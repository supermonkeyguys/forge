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

func TestProjectKBHandler_Create_Success(t *testing.T) {
	pid := "proj-1"
	want := domain.ProjectKBEntry{ID: "kb-1", UserID: "u-1", Title: "API convention", Type: "principle", Status: "verified"}
	h := handler.NewProjectKBHandler(&mock.ProjectKBRepo{
		CreateFn: func(_ context.Context, e domain.ProjectKBEntry) (domain.ProjectKBEntry, error) {
			return want, nil
		},
	})
	r := chi.NewRouter()
	r.Post("/api/v1/projects/{projectID}/kb", h.Create)

	body := `{"title":"API convention","content":"Use REST","type":"principle"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/projects/proj-1/kb", strings.NewReader(body))
	req = withUser(req, "u-1")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	_ = pid

	if w.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["data"].(map[string]any)["id"] != "kb-1" {
		t.Error("expected id kb-1")
	}
}

func TestProjectKBHandler_Create_MissingTitle(t *testing.T) {
	h := handler.NewProjectKBHandler(&mock.ProjectKBRepo{})
	r := chi.NewRouter()
	r.Post("/api/v1/projects/{projectID}/kb", h.Create)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/projects/proj-1/kb", strings.NewReader(`{"title":"","content":"x"}`))
	req = withUser(req, "u-1")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestProjectKBHandler_Create_InvalidType(t *testing.T) {
	h := handler.NewProjectKBHandler(&mock.ProjectKBRepo{})
	r := chi.NewRouter()
	r.Post("/api/v1/projects/{projectID}/kb", h.Create)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/projects/proj-1/kb",
		strings.NewReader(`{"title":"t","content":"c","type":"invalid"}`))
	req = withUser(req, "u-1")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid type, got %d", w.Code)
	}
}
