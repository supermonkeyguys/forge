package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

type TaskStepHandler struct {
	taskRepo domain.TaskRepository
	stepRepo domain.TaskStepRepository
}

func NewTaskStepHandler(taskRepo domain.TaskRepository, stepRepo domain.TaskStepRepository) *TaskStepHandler {
	return &TaskStepHandler{taskRepo: taskRepo, stepRepo: stepRepo}
}

// GET /api/v1/projects/{projectID}/tasks/latest/steps
func (h *TaskStepHandler) LatestSteps(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")

	task, err := h.taskRepo.GetLatestByProjectID(r.Context(), projectID)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}

	steps, err := h.stepRepo.ListByTaskID(r.Context(), task.ID)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}

	middleware.WriteJSONList(w, steps, len(steps), 1, len(steps)+1)
}
