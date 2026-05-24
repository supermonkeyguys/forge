package handler_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/forge-ai/forge/api/api/handler"
	"github.com/forge-ai/forge/api/domain"
	"github.com/forge-ai/forge/api/infra/mock"
)

func TestProjectHandler_Get_NotFound(t *testing.T) {
	repo := &mock.ProjectRepo{
		GetByIDFn: func(_ interface{}, id string) (domain.Project, error) {
			return domain.Project{}, domain.ErrNotFound
		},
	}

	h := handler.NewProjectHandler(repo)

	r := chi.NewRouter()
	r.Get("/api/v1/projects/{id}", h.Get)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/projects/nonexistent", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}

	var body map[string]interface{}
	json.NewDecoder(w.Body).Decode(&body)
	errObj, ok := body["error"].(map[string]interface{})
	if !ok {
		t.Fatal("expected error object in response")
	}
	if errObj["code"] != "NOT_FOUND" {
		t.Errorf("expected code NOT_FOUND, got %v", errObj["code"])
	}
}

func TestProjectHandler_Create_MissingName(t *testing.T) {
	repo := &mock.ProjectRepo{}
	h := handler.NewProjectHandler(repo)

	r := chi.NewRouter()
	r.Post("/api/v1/projects", h.Create)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/projects",
		strings.NewReader(`{"name":""}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestProjectHandler_Get_Success(t *testing.T) {
	want := domain.Project{ID: "proj-1", Name: "My App", Status: domain.ProjectStatusIdle}
	repo := &mock.ProjectRepo{
		GetByIDFn: func(_ interface{}, id string) (domain.Project, error) {
			if id == "proj-1" {
				return want, nil
			}
			return domain.Project{}, domain.ErrNotFound
		},
	}

	h := handler.NewProjectHandler(repo)
	r := chi.NewRouter()
	r.Get("/api/v1/projects/{id}", h.Get)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/projects/proj-1", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var body map[string]interface{}
	json.NewDecoder(w.Body).Decode(&body)
	data, ok := body["data"].(map[string]interface{})
	if !ok {
		t.Fatal("expected data object")
	}
	if data["id"] != "proj-1" {
		t.Errorf("expected id proj-1, got %v", data["id"])
	}
	fmt.Println("✓ GET /projects/:id returns project data")
}
