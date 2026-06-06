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

	h := handler.NewInternalHandler(taskRepo, nil, nil, nil, nil, nil)
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
	h := handler.NewInternalHandler(&mock.TaskRepo{}, nil, nil, nil, nil, nil)
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
	h := handler.NewInternalHandler(taskRepo, nil, nil, nil, nil, nil)
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
	h := handler.NewInternalHandler(taskRepo, nil, nil, nil, nil, nil)
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

func TestInternalHandler_UpdateTaskStatus_MalformedJSON(t *testing.T) {
	h := handler.NewInternalHandler(&mock.TaskRepo{}, nil, nil, nil, nil, nil)
	req := httptest.NewRequest(http.MethodPatch, "/internal/tasks/task-1/status",
		bytes.NewReader([]byte(`{invalid json}`)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	internalRouter(h).ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestInternalHandler_UpdateTaskStatus_ErrorMsgPassthrough(t *testing.T) {
	var capturedErrorMsg string
	taskRepo := &mock.TaskRepo{
		UpdateStatusFn: func(_ context.Context, id string, status domain.TaskStatus, previewURL, errorMsg string) (domain.Task, error) {
			capturedErrorMsg = errorMsg
			return domain.Task{ID: id, Status: status, ErrorMsg: errorMsg}, nil
		},
	}
	h := handler.NewInternalHandler(taskRepo, nil, nil, nil, nil, nil)
	body, _ := json.Marshal(map[string]string{
		"status":   "failed",
		"errorMsg": "sandbox timed out",
	})
	req := httptest.NewRequest(http.MethodPatch, "/internal/tasks/task-1/status", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	internalRouter(h).ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if capturedErrorMsg != "sandbox timed out" {
		t.Fatalf("expected errorMsg passed through, got %q", capturedErrorMsg)
	}
}

func TestInternalHandler_GetAgent_Success(t *testing.T) {
	want := domain.Agent{ID: "ag-1", UserID: "u-1", Name: "Docs Writer", Tools: []string{"read_file"}, WritePaths: []string{"docs/"}}
	agentRepo := &mock.AgentRepo{
		GetByIDFn: func(_ context.Context, id string) (domain.Agent, error) {
			if id == "ag-1" {
				return want, nil
			}
			return domain.Agent{}, domain.ErrNotFound
		},
	}
	h := handler.NewInternalHandler(nil, agentRepo, nil, nil, nil, nil)
	r := chi.NewRouter()
	r.Get("/internal/agents/{agentID}", h.GetAgent)

	req := httptest.NewRequest(http.MethodGet, "/internal/agents/ag-1", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	data := resp["data"].(map[string]any)
	if data["id"] != "ag-1" {
		t.Errorf("expected id ag-1, got %v", data["id"])
	}
}

func TestInternalHandler_GetAgent_NotFound(t *testing.T) {
	agentRepo := &mock.AgentRepo{
		GetByIDFn: func(_ context.Context, id string) (domain.Agent, error) {
			return domain.Agent{}, domain.ErrNotFound
		},
	}
	h := handler.NewInternalHandler(nil, agentRepo, nil, nil, nil, nil)
	r := chi.NewRouter()
	r.Get("/internal/agents/{agentID}", h.GetAgent)

	req := httptest.NewRequest(http.MethodGet, "/internal/agents/missing", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func internalRouterWithSteps(h *handler.InternalHandler) http.Handler {
	r := chi.NewRouter()
	r.Patch("/internal/tasks/{taskID}/status", h.UpdateTaskStatus)
	r.Post("/internal/tasks/{taskID}/steps", h.CreateTaskStep)
	return r
}

func TestInternalHandler_CreateTaskStep_Success(t *testing.T) {
	stepRepo := &mock.TaskStepRepo{
		CreateFn: func(_ context.Context, step domain.TaskStep) (domain.TaskStep, error) {
			step.ID = "step-1"
			step.CreatedAt = time.Now()
			return step, nil
		},
	}
	h := handler.NewInternalHandler(nil, nil, nil, nil, stepRepo, nil)
	body, _ := json.Marshal(map[string]any{
		"seqNo":      0,
		"agent":      "schema",
		"summary":    "schema.prisma done (1 tool call)",
		"toolCalls":  []map[string]any{{"tool": "write_file", "input": map[string]string{"path": "schema.prisma"}}},
		"durationMs": 4200,
		"status":     "done",
	})
	req := httptest.NewRequest(http.MethodPost, "/internal/tasks/task-1/steps", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	internalRouterWithSteps(h).ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestInternalHandler_CreateTaskStep_MissingAgent(t *testing.T) {
	h := handler.NewInternalHandler(nil, nil, nil, nil, &mock.TaskStepRepo{}, nil)
	body, _ := json.Marshal(map[string]any{"seqNo": 0, "summary": "ok"})
	req := httptest.NewRequest(http.MethodPost, "/internal/tasks/task-1/steps", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	internalRouterWithSteps(h).ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

