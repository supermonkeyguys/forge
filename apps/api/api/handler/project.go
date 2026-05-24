package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

// ProjectHandler handles all /api/v1/projects routes.
// It holds only the domain interface — never infra/postgres concrete types.
type ProjectHandler struct {
	repo domain.ProjectRepository
}

func NewProjectHandler(repo domain.ProjectRepository) *ProjectHandler {
	return &ProjectHandler{repo: repo}
}

// GET /api/v1/projects
func (h *ProjectHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	limit, offset := parsePagination(r)

	projects, err := h.repo.ListByUserID(r.Context(), userID, limit, offset)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}

	page := (offset / limit) + 1
	middleware.WriteJSONList(w, projects, len(projects), page, limit)
}

// POST /api/v1/projects
func (h *ProjectHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if body.Name == "" {
		middleware.WriteFieldError(w, "name", "name is required")
		return
	}

	project, err := h.repo.Create(r.Context(), domain.Project{
		Name:   body.Name,
		UserID: userID,
		Status: domain.ProjectStatusIdle,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}

	middleware.WriteJSON(w, http.StatusCreated, project)
}

// GET /api/v1/projects/{projectID}
func (h *ProjectHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "projectID")
	userID := middleware.UserIDFromContext(r.Context())

	project, err := h.repo.GetByID(r.Context(), id)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if project.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}

	middleware.WriteJSON(w, http.StatusOK, project)
}

// DELETE /api/v1/projects/{projectID}
func (h *ProjectHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "projectID")
	userID := middleware.UserIDFromContext(r.Context())

	project, err := h.repo.GetByID(r.Context(), id)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if project.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}
	if project.IsActive() {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}

	if err := h.repo.Delete(r.Context(), id); err != nil {
		middleware.WriteError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
