package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

// InternalHandler handles /internal/* routes — service-to-service only, no JWT.
type InternalHandler struct {
	taskRepo domain.TaskRepository
}

func NewInternalHandler(taskRepo domain.TaskRepository) *InternalHandler {
	return &InternalHandler{taskRepo: taskRepo}
}

// PATCH /internal/tasks/{taskID}/status
func (h *InternalHandler) UpdateTaskStatus(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskID")
	if taskID == "" {
		middleware.WriteFieldError(w, "taskID", "taskID is required")
		return
	}

	var body struct {
		Status     string          `json:"status"`
		PreviewURL string          `json:"previewUrl"`
		ErrorMsg   string          `json:"errorMsg"`
		Events     json.RawMessage `json:"events,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if !domain.ValidTaskStatus(body.Status) {
		middleware.WriteFieldError(w, "status", "invalid task status: "+body.Status)
		return
	}

	task, err := h.taskRepo.UpdateStatus(r.Context(), taskID, domain.TaskStatus(body.Status), body.PreviewURL, body.ErrorMsg)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}

	// Persist events when provided (sent on terminal states: done/failed)
	if len(body.Events) > 0 && string(body.Events) != "null" {
		if err := h.taskRepo.SaveEvents(r.Context(), taskID, string(body.Events)); err != nil {
			log.Printf("[UpdateTaskStatus] SaveEvents taskID=%s err=%v", taskID, err)
		}
	}

	middleware.WriteJSON(w, http.StatusOK, task)
}
