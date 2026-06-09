package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

// agentHTTPClientLong is used for AI generation calls that can take 30-60s.
var agentHTTPClientLong = &http.Client{Timeout: 90 * time.Second}

// WorkflowRunHandler handles workflow generation and execution routes.
type WorkflowRunHandler struct {
	workflowRepo    domain.WorkflowRepository
	workflowRunRepo domain.WorkflowRunRepository
	agentURL        string
}

func NewWorkflowRunHandler(
	workflowRepo domain.WorkflowRepository,
	workflowRunRepo domain.WorkflowRunRepository,
	agentURL string,
) *WorkflowRunHandler {
	return &WorkflowRunHandler{
		workflowRepo:    workflowRepo,
		workflowRunRepo: workflowRunRepo,
		agentURL:        agentURL,
	}
}

// POST /api/v1/workflows/generate
func (h *WorkflowRunHandler) Generate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		UserInput      string   `json:"userInput"`
		Clarifications []string `json:"clarifications"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if body.UserInput == "" {
		middleware.WriteFieldError(w, "userInput", "userInput is required")
		return
	}

	payload, _ := json.Marshal(map[string]any{
		"userInput":      body.UserInput,
		"clarifications": body.Clarifications,
	})
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		h.agentURL+"/generate-workflow", bytes.NewReader(payload))
	if err != nil {
		middleware.WriteError(w, fmt.Errorf("build request: %w", err))
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := agentHTTPClientLong.Do(req)
	if err != nil {
		middleware.WriteError(w, fmt.Errorf("agent unavailable: %w", err))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		middleware.WriteError(w, fmt.Errorf("agent returned %d", resp.StatusCode))
		return
	}

	var agentBody struct {
		Definition domain.WorkflowDefinition `json:"definition"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&agentBody); err != nil {
		middleware.WriteError(w, fmt.Errorf("decode agent response: %w", err))
		return
	}
	middleware.WriteJSON(w, http.StatusOK, agentBody.Definition)
}

// POST /api/v1/workflows/{workflowID}/runs
func (h *WorkflowRunHandler) CreateRun(w http.ResponseWriter, r *http.Request) {
	workflowID := chi.URLParam(r, "workflowID")
	userID := middleware.UserIDFromContext(r.Context())

	wf, err := h.workflowRepo.GetByID(r.Context(), workflowID)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if wf.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}

	run, err := h.workflowRunRepo.Create(r.Context(), domain.WorkflowRun{
		WorkflowID: workflowID,
		UserID:     userID,
		Status:     domain.WorkflowRunStatusQueued,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}

	go h.dispatchRun(run, wf)

	middleware.WriteJSON(w, http.StatusAccepted, map[string]string{
		"runId":  run.ID,
		"status": string(run.Status),
	})
}

func (h *WorkflowRunHandler) dispatchRun(run domain.WorkflowRun, wf domain.Workflow) {
	defJSON, _ := json.Marshal(wf.Definition)
	payload, _ := json.Marshal(map[string]any{
		"taskId":             run.ID,
		"projectId":          wf.UserID,
		"workflowDefinition": json.RawMessage(defJSON),
		"jobType":            "workflow",
	})

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		h.agentURL+"/run-workflow", bytes.NewReader(payload))
	if err != nil {
		h.markFailed(run.ID, "failed to build agent request")
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := agentHTTPClient.Do(req)
	if err != nil || resp == nil {
		h.markFailed(run.ID, "agent unreachable")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		h.markFailed(run.ID, fmt.Sprintf("agent returned %d", resp.StatusCode))
		return
	}

	var agentResp struct {
		Data struct {
			JobID string `json:"jobId"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&agentResp); err == nil && agentResp.Data.JobID != "" {
		_ = h.workflowRunRepo.UpdateAgentJobID(context.Background(), run.ID, agentResp.Data.JobID)
	}
}

func (h *WorkflowRunHandler) markFailed(runID, errMsg string) {
	now := time.Now()
	_ = h.workflowRunRepo.UpdateStatus(context.Background(), runID,
		domain.WorkflowRunStatusFailed, errMsg, &now)
}

// GET /api/v1/workflow-runs/{runID}
func (h *WorkflowRunHandler) GetRun(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "runID")
	userID := middleware.UserIDFromContext(r.Context())

	run, err := h.workflowRunRepo.GetByID(r.Context(), runID)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if run.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}
	middleware.WriteJSON(w, http.StatusOK, run)
}

// GET /api/v1/workflow-runs/{runID}/events
func (h *WorkflowRunHandler) GetRunEvents(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "runID")
	userID := middleware.UserIDFromContext(r.Context())

	run, err := h.workflowRunRepo.GetByID(r.Context(), runID)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if run.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}

	if run.AgentJobID == "" {
		middleware.WriteJSON(w, http.StatusOK, map[string]any{
			"status": string(run.Status),
			"events": []any{},
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	agentReq, err := http.NewRequestWithContext(ctx, http.MethodGet,
		h.agentURL+"/status/"+run.AgentJobID, nil)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	agentResp, err := agentHTTPClient.Do(agentReq)
	if err != nil || agentResp.StatusCode == http.StatusNotFound {
		middleware.WriteJSON(w, http.StatusOK, map[string]any{
			"status": string(run.Status),
			"events": []any{},
		})
		return
	}
	defer agentResp.Body.Close()

	body, _ := io.ReadAll(agentResp.Body)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}
