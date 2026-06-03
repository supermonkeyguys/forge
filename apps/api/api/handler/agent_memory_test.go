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
	"github.com/forge-ai/forge/api/domain"
	"github.com/forge-ai/forge/api/infra/mock"
)

func TestAgentMemoryHandler_Create_Success(t *testing.T) {
	want := domain.AgentMemory{ID: "m-1", AgentKey: "system:logic", UserID: "u-1", Content: "prefers short functions"}
	repo := &mock.AgentMemoryRepo{
		CreateFn: func(_ context.Context, m domain.AgentMemory) (domain.AgentMemory, error) {
			return want, nil
		},
	}
	h := handler.NewAgentMemoryHandler(repo)
	r := chi.NewRouter()
	r.Post("/api/v1/agents/{agentKey}/memories", h.Create)

	body := `{"content":"prefers short functions","memoryKey":"style"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/agents/system:logic/memories", strings.NewReader(body))
	req = withUser(req, "u-1")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["data"].(map[string]any)["id"] != "m-1" {
		t.Error("expected id m-1")
	}
}

func TestAgentMemoryHandler_Create_MissingContent(t *testing.T) {
	repo := &mock.AgentMemoryRepo{}
	h := handler.NewAgentMemoryHandler(repo)
	r := chi.NewRouter()
	r.Post("/api/v1/agents/{agentKey}/memories", h.Create)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/agents/system:logic/memories", strings.NewReader(`{"content":""}`))
	req = withUser(req, "u-1")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestAgentMemoryHandler_List_Success(t *testing.T) {
	memories := []domain.AgentMemory{{ID: "m-1", Content: "test memory"}}
	repo := &mock.AgentMemoryRepo{
		ListByAgentKeyFn: func(_ context.Context, agentKey, userID, query string, limit int) ([]domain.AgentMemory, error) {
			return memories, nil
		},
	}
	h := handler.NewAgentMemoryHandler(repo)
	r := chi.NewRouter()
	r.Get("/api/v1/agents/{agentKey}/memories", h.List)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/agents/system:logic/memories", nil)
	req = withUser(req, "u-1")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}
