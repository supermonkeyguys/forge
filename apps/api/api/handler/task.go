package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

var agentHTTPClient = &http.Client{Timeout: 5 * time.Second}

// TaskHandler handles /api/v1/projects/:projectID/tasks routes.
// It holds only domain interfaces — never infra/postgres concrete types.
type TaskHandler struct {
	taskRepo    domain.TaskRepository
	projectRepo domain.ProjectRepository
	agentURL    string // Agent Service base URL for dispatching jobs
}

func NewTaskHandler(taskRepo domain.TaskRepository, projectRepo domain.ProjectRepository, agentURL string) *TaskHandler {
	return &TaskHandler{
		taskRepo:    taskRepo,
		projectRepo: projectRepo,
		agentURL:    agentURL,
	}
}

// POST /api/v1/projects/{projectID}/tasks
func (h *TaskHandler) Create(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	userID := middleware.UserIDFromContext(r.Context())

	// Verify project exists and belongs to user.
	project, err := h.projectRepo.GetByID(r.Context(), projectID)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if project.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}

	var body struct {
		Prompt string `json:"prompt"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if body.Prompt == "" {
		middleware.WriteFieldError(w, "prompt", "prompt is required")
		return
	}

	task, err := h.taskRepo.Create(r.Context(), domain.Task{
		ProjectID: projectID,
		UserID:    userID,
		Prompt:    body.Prompt,
		Status:    domain.TaskStatusIdle,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}

	// Fire-and-forget dispatch to Agent Service.
	// Failures are non-fatal here; the task is already persisted.
	go h.dispatchToAgent(task)

	middleware.WriteJSON(w, http.StatusCreated, task)
}

// GET /api/v1/projects/{projectID}/tasks
func (h *TaskHandler) List(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	userID := middleware.UserIDFromContext(r.Context())

	project, err := h.projectRepo.GetByID(r.Context(), projectID)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if project.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}

	limit, offset := parsePagination(r)
	tasks, err := h.taskRepo.ListByProjectID(r.Context(), projectID, limit, offset)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}

	page := (offset / limit) + 1
	middleware.WriteJSONList(w, tasks, len(tasks), page, limit)
}

// GET /api/v1/projects/{projectID}/tasks/{taskID}
func (h *TaskHandler) Get(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskID")
	userID := middleware.UserIDFromContext(r.Context())

	task, err := h.taskRepo.GetByID(r.Context(), taskID)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if task.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}

	middleware.WriteJSON(w, http.StatusOK, task)
}

// GET /api/v1/projects/{projectID}/tasks/latest
// Returns the most recent task summary (no eventsJson) for a project, or null if none.
func (h *TaskHandler) Latest(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	userID := middleware.UserIDFromContext(r.Context())

	task, err := h.taskRepo.GetLatestSummaryByProjectID(r.Context(), projectID)
	if errors.Is(err, domain.ErrNotFound) {
		middleware.WriteJSON(w, http.StatusOK, nil)
		return
	}
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if task.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}

	middleware.WriteJSON(w, http.StatusOK, task)
}

// GET /api/v1/projects/{projectID}/tasks/latest/events
// Returns the most recent task including full eventsJson. Only call when restoring event history.
func (h *TaskHandler) LatestEvents(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	userID := middleware.UserIDFromContext(r.Context())

	task, err := h.taskRepo.GetLatestByProjectID(r.Context(), projectID)
	if errors.Is(err, domain.ErrNotFound) {
		middleware.WriteJSON(w, http.StatusOK, nil)
		return
	}
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if task.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}

	middleware.WriteJSON(w, http.StatusOK, task)
}

// GET /api/v1/tasks/{taskID}/stream
// Server-Sent Events stream for real-time agent progress.
func (h *TaskHandler) Stream(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskID")
	userID := middleware.UserIDFromContext(r.Context())

	task, err := h.taskRepo.GetByID(r.Context(), taskID)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if task.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}

	// SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	flusher, ok := w.(http.Flusher)
	if !ok {
		// Streaming not supported; send current state and close.
		fmt.Fprintf(w, "data: {\"type\":\"task_state\",\"status\":\"%s\"}\n\n", task.Status)
		return
	}

	// Poll task status until terminal or client disconnects.
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			t, err := h.taskRepo.GetByID(r.Context(), taskID)
			if err != nil {
				fmt.Fprintf(w, "event: error\ndata: {\"error\":\"task not found\"}\n\n")
				flusher.Flush()
				return
			}

			data, _ := json.Marshal(map[string]string{
				"type":       "task_state",
				"status":     string(t.Status),
				"previewUrl": t.PreviewURL,
				"errorMsg":   t.ErrorMsg,
			})
			fmt.Fprintf(w, "event: agent_event\ndata: %s\n\n", data)
			flusher.Flush()

			if t.IsTerminal() {
				fmt.Fprintf(w, "event: done\ndata: {\"previewUrl\":\"%s\"}\n\n", t.PreviewURL)
				flusher.Flush()
				return
			}
		}
	}
}

// dispatchToAgent notifies the Agent Service to start processing the task.
func (h *TaskHandler) dispatchToAgent(task domain.Task) {
	if h.agentURL == "" {
		return
	}
	body, _ := json.Marshal(map[string]string{
		"taskId":    task.ID,
		"projectId": task.ProjectID,
		"userInput": task.Prompt,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, h.agentURL+"/run", jsonReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := agentHTTPClient.Do(req)
	if err != nil || resp == nil {
		log.Printf("[dispatchToAgent] failed url=%s err=%v", h.agentURL+"/run", err)
		return
	}
	log.Printf("[dispatchToAgent] ok status=%d", resp.StatusCode)
	resp.Body.Close()
}
