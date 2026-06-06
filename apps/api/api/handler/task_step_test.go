package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/forge-ai/forge/api/api/handler"
	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
	"github.com/forge-ai/forge/api/infra/mock"
)

func taskStepRouter(h *handler.TaskStepHandler) http.Handler {
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := middleware.WithUserID(r.Context(), "user-1")
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	r.Get("/projects/{projectID}/tasks/latest/steps", h.LatestSteps)
	return r
}

func TestTaskStepHandler_LatestSteps(t *testing.T) {
	taskRepo := &mock.TaskRepo{
		GetLatestByProjectIDFn: func(_ context.Context, projectID string) (domain.Task, error) {
			return domain.Task{ID: "task-1", ProjectID: projectID}, nil
		},
	}
	stepRepo := &mock.TaskStepRepo{
		ListByTaskIDFn: func(_ context.Context, taskID string) ([]domain.TaskStep, error) {
			return []domain.TaskStep{
				{
					ID:         "step-1",
					TaskID:     taskID,
					SeqNo:      0,
					Agent:      "pm",
					Summary:    `"App" — 5 features`,
					ToolCalls:  []domain.ToolCallEntry{},
					DurationMs: 9800,
					Status:     "done",
					CreatedAt:  time.Now(),
				},
			}, nil
		},
	}
	h := handler.NewTaskStepHandler(taskRepo, stepRepo)
	req := httptest.NewRequest(http.MethodGet, "/projects/proj-1/tasks/latest/steps", nil)
	rec := httptest.NewRecorder()
	taskStepRouter(h).ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Data []domain.TaskStep `json:"data"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Data) != 1 || resp.Data[0].Agent != "pm" {
		t.Fatalf("unexpected steps: %+v", resp.Data)
	}
}

func TestTaskStepHandler_LatestSteps_Empty(t *testing.T) {
	taskRepo := &mock.TaskRepo{
		GetLatestByProjectIDFn: func(_ context.Context, _ string) (domain.Task, error) {
			return domain.Task{ID: "task-2"}, nil
		},
	}
	stepRepo := &mock.TaskStepRepo{
		ListByTaskIDFn: func(_ context.Context, _ string) ([]domain.TaskStep, error) {
			return []domain.TaskStep{}, nil
		},
	}
	h := handler.NewTaskStepHandler(taskRepo, stepRepo)
	req := httptest.NewRequest(http.MethodGet, "/projects/proj-1/tasks/latest/steps", nil)
	rec := httptest.NewRecorder()
	taskStepRouter(h).ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Data []domain.TaskStep `json:"data"`
	}
	json.NewDecoder(rec.Body).Decode(&resp)
	if len(resp.Data) != 0 {
		t.Fatalf("expected empty, got %d steps", len(resp.Data))
	}
}
