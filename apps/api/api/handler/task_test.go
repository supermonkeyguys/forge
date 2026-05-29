package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/forge-ai/forge/api/api/handler"
	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
	"github.com/forge-ai/forge/api/infra/mock"
)

func taskToken(userID, secret string) string {
	tok, _ := middleware.GenerateJWT(userID, secret)
	return "Bearer " + tok
}

func TestTaskHandler_Create_MissingPrompt(t *testing.T) {
	const secret = "test-secret"
	projectRepo := &mock.ProjectRepo{
		GetByIDFn: func(_ context.Context, id string) (domain.Project, error) {
			return domain.Project{ID: id, UserID: "u1"}, nil
		},
	}
	taskRepo := &mock.TaskRepo{}

	h := handler.NewTaskHandler(taskRepo, projectRepo, "")
	r := chi.NewRouter()
	r.Use(middleware.RequireAuth(secret))
	r.Post("/projects/{projectID}/tasks", h.Create)

	req := httptest.NewRequest(http.MethodPost, "/projects/proj-1/tasks",
		strings.NewReader(`{"prompt":""}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", taskToken("u1", secret))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

func TestTaskHandler_Create_ProjectNotFound(t *testing.T) {
	const secret = "test-secret"
	projectRepo := &mock.ProjectRepo{
		GetByIDFn: func(_ context.Context, id string) (domain.Project, error) {
			return domain.Project{}, domain.ErrNotFound
		},
	}
	taskRepo := &mock.TaskRepo{}

	h := handler.NewTaskHandler(taskRepo, projectRepo, "")
	r := chi.NewRouter()
	r.Use(middleware.RequireAuth(secret))
	r.Post("/projects/{projectID}/tasks", h.Create)

	req := httptest.NewRequest(http.MethodPost, "/projects/no-such/tasks",
		strings.NewReader(`{"prompt":"build me an app"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", taskToken("u1", secret))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

func TestTaskHandler_Create_ProjectForbidden(t *testing.T) {
	const secret = "test-secret"
	projectRepo := &mock.ProjectRepo{
		GetByIDFn: func(_ context.Context, id string) (domain.Project, error) {
			return domain.Project{ID: id, UserID: "other-user"}, nil
		},
	}
	taskRepo := &mock.TaskRepo{}

	h := handler.NewTaskHandler(taskRepo, projectRepo, "")
	r := chi.NewRouter()
	r.Use(middleware.RequireAuth(secret))
	r.Post("/projects/{projectID}/tasks", h.Create)

	req := httptest.NewRequest(http.MethodPost, "/projects/proj-1/tasks",
		strings.NewReader(`{"prompt":"build me an app"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", taskToken("current-user", secret))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d: %s", w.Code, w.Body.String())
	}
}

func TestTaskHandler_Create_Success(t *testing.T) {
	const secret = "test-secret"
	want := domain.Task{
		ID: "task-1", ProjectID: "proj-1", UserID: "u1",
		Prompt: "build me an app", Status: domain.TaskStatusIdle,
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	projectRepo := &mock.ProjectRepo{
		GetByIDFn: func(_ context.Context, id string) (domain.Project, error) {
			return domain.Project{ID: id, UserID: "u1"}, nil
		},
	}
	taskRepo := &mock.TaskRepo{
		CreateFn: func(_ context.Context, _ domain.Task) (domain.Task, error) {
			return want, nil
		},
	}

	h := handler.NewTaskHandler(taskRepo, projectRepo, "")
	r := chi.NewRouter()
	r.Use(middleware.RequireAuth(secret))
	r.Post("/projects/{projectID}/tasks", h.Create)

	req := httptest.NewRequest(http.MethodPost, "/projects/proj-1/tasks",
		strings.NewReader(`{"prompt":"build me an app"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", taskToken("u1", secret))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var body map[string]any
	json.NewDecoder(w.Body).Decode(&body)
	data, ok := body["data"].(map[string]any)
	if !ok {
		t.Fatal("expected data object")
	}
	if data["id"] != "task-1" {
		t.Errorf("expected id task-1, got %v", data["id"])
	}
}

func TestTaskHandler_Get_NotFound(t *testing.T) {
	const secret = "test-secret"
	taskRepo := &mock.TaskRepo{
		GetByIDFn: func(_ context.Context, id string) (domain.Task, error) {
			return domain.Task{}, domain.ErrNotFound
		},
	}

	h := handler.NewTaskHandler(taskRepo, &mock.ProjectRepo{}, "")
	r := chi.NewRouter()
	r.Use(middleware.RequireAuth(secret))
	r.Get("/tasks/{taskID}", h.Get)

	req := httptest.NewRequest(http.MethodGet, "/tasks/no-such", nil)
	req.Header.Set("Authorization", taskToken("u1", secret))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestTaskHandler_Get_Forbidden(t *testing.T) {
	const secret = "test-secret"
	taskRepo := &mock.TaskRepo{
		GetByIDFn: func(_ context.Context, id string) (domain.Task, error) {
			return domain.Task{ID: id, UserID: "other-user"}, nil
		},
	}

	h := handler.NewTaskHandler(taskRepo, &mock.ProjectRepo{}, "")
	r := chi.NewRouter()
	r.Use(middleware.RequireAuth(secret))
	r.Get("/tasks/{taskID}", h.Get)

	req := httptest.NewRequest(http.MethodGet, "/tasks/task-1", nil)
	req.Header.Set("Authorization", taskToken("current-user", secret))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d", w.Code)
	}
}
