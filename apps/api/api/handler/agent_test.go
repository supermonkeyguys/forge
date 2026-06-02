package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/forge-ai/forge/api/api/handler"
	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
	"github.com/forge-ai/forge/api/infra/mock"
)

// helper: inject userID into request context
func withUser(req *http.Request, userID string) *http.Request {
	return req.WithContext(middleware.WithUserID(req.Context(), userID))
}

func TestAgentHandler_Create_MissingName(t *testing.T) {
	repo := &mock.AgentRepo{}
	h := handler.NewAgentHandler(repo)
	r := chi.NewRouter()
	r.Post("/api/v1/agents", h.Create)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/agents", strings.NewReader(`{"name":""}`))
	req = withUser(req, "user-1")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestAgentHandler_Create_InvalidTool(t *testing.T) {
	repo := &mock.AgentRepo{}
	h := handler.NewAgentHandler(repo)
	r := chi.NewRouter()
	r.Post("/api/v1/agents", h.Create)

	body := `{"name":"My Agent","tools":["not_a_real_tool"]}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/agents", strings.NewReader(body))
	req = withUser(req, "user-1")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid tool, got %d", w.Code)
	}
}

func TestAgentHandler_Create_Success(t *testing.T) {
	want := domain.Agent{ID: "ag-1", UserID: "user-1", Name: "Docs Writer", Tools: []string{"read_file"}, WritePaths: []string{"docs/"}}
	repo := &mock.AgentRepo{
		CreateFn: func(_ context.Context, a domain.Agent) (domain.Agent, error) {
			return want, nil
		},
	}
	h := handler.NewAgentHandler(repo)
	r := chi.NewRouter()
	r.Post("/api/v1/agents", h.Create)

	body := `{"name":"Docs Writer","tools":["read_file"],"writePaths":["docs/"]}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/agents", strings.NewReader(body))
	req = withUser(req, "user-1")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	data := resp["data"].(map[string]any)
	if data["id"] != "ag-1" {
		t.Errorf("expected id ag-1, got %v", data["id"])
	}
}

func TestAgentHandler_Delete_NotOwner(t *testing.T) {
	repo := &mock.AgentRepo{
		DeleteFn: func(_ context.Context, id, userID string) error {
			return domain.ErrNotFound
		},
	}
	h := handler.NewAgentHandler(repo)
	r := chi.NewRouter()
	r.Delete("/api/v1/agents/{agentID}", h.Delete)

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/agents/ag-1", nil)
	req = withUser(req, "other-user")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestAgentHandler_List_ReturnsEmpty(t *testing.T) {
	repo := &mock.AgentRepo{
		ListByUserIDFn: func(_ context.Context, userID string) ([]domain.Agent, error) {
			return nil, nil
		},
	}
	h := handler.NewAgentHandler(repo)
	r := chi.NewRouter()
	r.Get("/api/v1/agents", h.List)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/agents", nil)
	req = withUser(req, "user-1")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	data := resp["data"].([]any)
	if len(data) != 0 {
		t.Errorf("expected empty array, got %v", data)
	}
}
