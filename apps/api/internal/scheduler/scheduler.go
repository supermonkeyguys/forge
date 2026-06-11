package scheduler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/robfig/cron/v3"

	"github.com/forge-ai/forge/api/domain"
)

var schedHTTPClient = &http.Client{Timeout: 10 * time.Second}

// CronScheduler manages in-process cron jobs for workflow schedule triggers.
type CronScheduler struct {
	c        *cron.Cron
	repo     domain.WorkflowRepository
	runRepo  domain.WorkflowRunRepository
	agentURL string
	logger   *slog.Logger

	mu       sync.Mutex
	entryIDs map[string]cron.EntryID // workflowID → entryID
}

// NewCronScheduler creates (but does not start) a CronScheduler.
func NewCronScheduler(
	repo domain.WorkflowRepository,
	runRepo domain.WorkflowRunRepository,
	agentURL string,
	logger *slog.Logger,
) *CronScheduler {
	return &CronScheduler{
		c:        cron.New(),
		repo:     repo,
		runRepo:  runRepo,
		agentURL: agentURL,
		logger:   logger,
		entryIDs: make(map[string]cron.EntryID),
	}
}

// Start loads all active scheduled workflows and starts the cron runner.
func (s *CronScheduler) Start(ctx context.Context) error {
	workflows, err := s.repo.ListActiveScheduled(ctx)
	if err != nil {
		return fmt.Errorf("scheduler.Start: %w", err)
	}
	for _, wf := range workflows {
		if err := s.addEntry(wf); err != nil {
			s.logger.Warn("scheduler: failed to register workflow", "workflowID", wf.ID, "error", err)
		}
	}
	s.logger.Info("scheduler started", "jobs", len(s.entryIDs))
	s.c.Start()
	return nil
}

// Stop gracefully stops the cron runner.
func (s *CronScheduler) Stop() {
	s.c.Stop()
}

// Refresh updates the cron entry for a workflow after it is created or updated.
func (s *CronScheduler) Refresh(workflowID string, trigger domain.WorkflowTrigger, status domain.WorkflowStatus) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if id, ok := s.entryIDs[workflowID]; ok {
		s.c.Remove(id)
		delete(s.entryIDs, workflowID)
	}
	if status != domain.WorkflowStatusActive || trigger.Type != "schedule" {
		return
	}
	wf := domain.Workflow{ID: workflowID, Trigger: trigger, Status: status}
	if err := s.addEntryLocked(wf); err != nil {
		s.logger.Warn("scheduler.Refresh: failed to add entry", "workflowID", workflowID, "error", err)
	}
}

// Remove removes the cron entry for a deleted workflow.
func (s *CronScheduler) Remove(workflowID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if id, ok := s.entryIDs[workflowID]; ok {
		s.c.Remove(id)
		delete(s.entryIDs, workflowID)
	}
}

// addEntry acquires the lock then delegates to addEntryLocked.
func (s *CronScheduler) addEntry(wf domain.Workflow) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.addEntryLocked(wf)
}

// addEntryLocked registers a workflow cron job. Must be called with s.mu held.
func (s *CronScheduler) addEntryLocked(wf domain.Workflow) error {
	cronExpr, _ := wf.Trigger.Config["cron"].(string)
	if cronExpr == "" {
		return fmt.Errorf("missing cron expression for workflow %s", wf.ID)
	}
	tz, _ := wf.Trigger.Config["tz"].(string)
	if tz == "" {
		tz = "UTC"
	}
	// robfig/cron v3 supports "CRON_TZ=<tz> <expr>" natively
	spec := fmt.Sprintf("CRON_TZ=%s %s", tz, cronExpr)
	workflowID := wf.ID
	entryID, err := s.c.AddFunc(spec, func() {
		s.triggerRun(workflowID)
	})
	if err != nil {
		return fmt.Errorf("cron.AddFunc(%q): %w", spec, err)
	}
	s.entryIDs[wf.ID] = entryID
	s.logger.Info("scheduler: registered", "workflowID", wf.ID, "cron", cronExpr, "tz", tz)
	return nil
}

func (s *CronScheduler) triggerRun(workflowID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	wf, err := s.repo.GetByID(ctx, workflowID)
	if err != nil {
		s.logger.Error("scheduler.triggerRun: workflow not found", "workflowID", workflowID, "error", err)
		return
	}

	run, err := s.runRepo.Create(ctx, domain.WorkflowRun{
		WorkflowID: workflowID,
		UserID:     wf.UserID,
		Status:     domain.WorkflowRunStatusQueued,
	})
	if err != nil {
		s.logger.Error("scheduler.triggerRun: failed to create run", "workflowID", workflowID, "error", err)
		return
	}

	defJSON, _ := json.Marshal(wf.Definition)
	payload, _ := json.Marshal(map[string]any{
		"taskId":             run.ID,
		"projectId":          wf.UserID,
		"workflowDefinition": json.RawMessage(defJSON),
		"jobType":            "workflow",
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		s.agentURL+"/run-workflow", bytes.NewReader(payload))
	if err != nil {
		s.markRunFailed(run.ID, "failed to build request")
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := schedHTTPClient.Do(req)
	if err != nil || resp == nil {
		s.markRunFailed(run.ID, "agent unreachable")
		s.logger.Error("scheduler.triggerRun: agent unreachable", "workflowID", workflowID)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		s.markRunFailed(run.ID, fmt.Sprintf("agent returned %d", resp.StatusCode))
		return
	}

	var agentResp struct {
		Data struct{ JobID string `json:"jobId"` } `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&agentResp); err == nil && agentResp.Data.JobID != "" {
		_ = s.runRepo.UpdateAgentJobID(context.Background(), run.ID, agentResp.Data.JobID)
	}

	_ = s.repo.UpdateLastTriggered(context.Background(), workflowID, time.Now())
	s.logger.Info("scheduler.triggerRun: dispatched", "workflowID", workflowID, "runID", run.ID)
}

func (s *CronScheduler) markRunFailed(runID, msg string) {
	now := time.Now()
	_ = s.runRepo.UpdateStatus(context.Background(), runID,
		domain.WorkflowRunStatusFailed, msg, &now)
}
