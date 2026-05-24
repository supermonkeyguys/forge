package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

// ProjectStream finds the latest task for a project and streams its status via SSE.
// GET /api/v1/projects/:projectID/stream
// Supports ?token= query param for SSE clients that cannot set Authorization header.
func (h *TaskHandler) ProjectStream(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	userID := middleware.UserIDFromContext(r.Context())

	// Verify project ownership
	project, err := h.projectRepo.GetByID(r.Context(), projectID)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if project.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}

	// Find the latest task for this project
	tasks, err := h.taskRepo.ListByProjectID(r.Context(), projectID, 1, 0)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}

	// SSE headers — must be set before writing any body
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	flusher, canFlush := w.(http.Flusher)

	// No tasks yet — send idle state and close
	if len(tasks) == 0 {
		data, _ := json.Marshal(map[string]string{"type": "task_state", "status": "idle"})
		fmt.Fprintf(w, "event: agent_event\ndata: %s\n\n", data)
		if canFlush {
			flusher.Flush()
		}
		return
	}

	task := tasks[0]

	if !canFlush {
		data, _ := json.Marshal(map[string]string{"type": "task_state", "status": string(task.Status)})
		fmt.Fprintf(w, "event: agent_event\ndata: %s\n\n", data)
		return
	}

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			t, err := h.taskRepo.GetByID(r.Context(), task.ID)
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
