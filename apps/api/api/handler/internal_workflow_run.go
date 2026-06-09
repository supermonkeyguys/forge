package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

// InternalWorkflowRunHandler handles /internal/workflow-runs/* routes.
// Called by the Agent service when a workflow job reaches a terminal state.
type InternalWorkflowRunHandler struct {
	repo domain.WorkflowRunRepository
}

func NewInternalWorkflowRunHandler(repo domain.WorkflowRunRepository) *InternalWorkflowRunHandler {
	return &InternalWorkflowRunHandler{repo: repo}
}

// PATCH /internal/workflow-runs/{runID}/status
func (h *InternalWorkflowRunHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "runID")
	if runID == "" {
		middleware.WriteFieldError(w, "runID", "runID is required")
		return
	}

	var body struct {
		Status   string `json:"status"`
		ErrorMsg string `json:"errorMsg"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}

	// Normalise "aborted" → "failed" (agent uses "aborted" for failures)
	if body.Status == "aborted" {
		body.Status = string(domain.WorkflowRunStatusFailed)
	}

	status := domain.WorkflowRunStatus(body.Status)
	var finishedAt *time.Time
	if status == domain.WorkflowRunStatusDone || status == domain.WorkflowRunStatusFailed {
		now := time.Now()
		finishedAt = &now
	}

	if err := h.repo.UpdateStatus(r.Context(), runID, status, body.ErrorMsg, finishedAt); err != nil {
		middleware.WriteError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
