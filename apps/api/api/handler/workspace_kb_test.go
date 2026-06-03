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

func TestWorkspaceKBHandler_Create_MissingTitle(t *testing.T) {
	h := handler.NewWorkspaceKBHandler(&mock.WorkspaceKBRepo{})
	r := chi.NewRouter()
	r.Post("/api/v1/kb", h.Create)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/kb", strings.NewReader(`{"title":""}`))
	req = withUser(req, "u-1")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestWorkspaceKBHandler_Create_Success(t *testing.T) {
	want := domain.WorkspaceKBEntry{ID: "kb-1", Title: "Brand guide", Content: "Use blue", Verified: true}
	h := handler.NewWorkspaceKBHandler(&mock.WorkspaceKBRepo{
		CreateFn: func(_ context.Context, e domain.WorkspaceKBEntry) (domain.WorkspaceKBEntry, error) {
			return want, nil
		},
	})
	r := chi.NewRouter()
	r.Post("/api/v1/kb", h.Create)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/kb", strings.NewReader(`{"title":"Brand guide","content":"Use blue"}`))
	req = withUser(req, "u-1")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["data"].(map[string]any)["id"] != "kb-1" {
		t.Error("expected id kb-1")
	}
}

func TestWorkspaceKBHandler_Delete_NotOwner(t *testing.T) {
	h := handler.NewWorkspaceKBHandler(&mock.WorkspaceKBRepo{
		DeleteFn: func(_ context.Context, id, userID string) error {
			return domain.ErrNotFound
		},
	})
	r := chi.NewRouter()
	r.Delete("/api/v1/kb/{id}", h.Delete)

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/kb/kb-1", nil)
	req = withUser(req, "other-user")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}
