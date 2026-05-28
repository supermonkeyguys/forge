package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/forge-ai/forge/api/api/handler"
	"github.com/forge-ai/forge/api/domain"
	"github.com/forge-ai/forge/api/infra/mock"
)

func internalRouter(h *handler.InternalHandler) http.Handler {
	r := chi.NewRouter()
	r.Patch("/internal/tasks/{taskID}/status", h.UpdateTaskStatus)
	return r
}

func TestInternalHandler_UpdateTaskStatus_Success(t *testing.T) {
	taskRepo := &mock.TaskRepo{
		UpdateStatusFn: func(_ context.Context, id string, status domain.TaskStatus, previewURL, errorMsg string) (domain.Task, error) {
			return domain.Task{
				ID:         id,
				Status:     status,
				PreviewURL: previewURL,
				ErrorMsg:   errorMsg,
				UpdatedAt:  time.Now(),
			}, nil
		},
	}

	h := handler.NewInternalHandler(taskRepo)
	body, _ := json.Marshal(map[string]string{"status": "building"})
	req := httptest.NewRequest(http.MethodPatch, "/internal/tasks/task-1/status", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	internalRouter(h).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Data domain.Task `json:"data"`
	}
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp.Data.Status != domain.TaskStatusBuilding {
		t.Fatalf("expected status building, got %s", resp.Data.Status)
	}
}

func TestInternalHandler_UpdateTaskStatus_InvalidStatus(t *testing.T) {
	h := handler.NewInternalHandler(&mock.TaskRepo{})
	body, _ := json.Marshal(map[string]string{"status": "invalid-state"})
	req := httptest.NewRequest(http.MethodPatch, "/internal/tasks/task-1/status", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	internalRouter(h).ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestInternalHandler_UpdateTaskStatus_TaskNotFound(t *testing.T) {
	taskRepo := &mock.TaskRepo{
		UpdateStatusFn: func(_ context.Context, id string, status domain.TaskStatus, previewURL, errorMsg string) (domain.Task, error) {
			return domain.Task{}, domain.ErrNotFound
		},
	}
	h := handler.NewInternalHandler(taskRepo)
	body, _ := json.Marshal(map[string]string{"status": "building"})
	req := httptest.NewRequest(http.MethodPatch, "/internal/tasks/missing/status", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	internalRouter(h).ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestInternalHandler_UpdateTaskStatus_WithPreviewURL(t *testing.T) {
	var capturedPreviewURL string
	taskRepo := &mock.TaskRepo{
		UpdateStatusFn: func(_ context.Context, id string, status domain.TaskStatus, previewURL, errorMsg string) (domain.Task, error) {
			capturedPreviewURL = previewURL
			return domain.Task{ID: id, Status: status, PreviewURL: previewURL}, nil
		},
	}
	h := handler.NewInternalHandler(taskRepo)
	body, _ := json.Marshal(map[string]string{
		"status":     "done",
		"previewUrl": "https://preview.e2b.dev/abc",
	})
	req := httptest.NewRequest(http.MethodPatch, "/internal/tasks/task-1/status", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	internalRouter(h).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if capturedPreviewURL != "https://preview.e2b.dev/abc" {
		t.Fatalf("expected previewUrl passed through, got %q", capturedPreviewURL)
	}
}
