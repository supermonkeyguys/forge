package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

type ProjectKBHandler struct{ repo domain.ProjectKBRepository }

func NewProjectKBHandler(repo domain.ProjectKBRepository) *ProjectKBHandler {
	return &ProjectKBHandler{repo: repo}
}

// GET /api/v1/projects/{projectID}/kb?type=&status=
func (h *ProjectKBHandler) List(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	userID := middleware.UserIDFromContext(r.Context())
	entries, err := h.repo.List(r.Context(), projectID, userID,
		r.URL.Query().Get("type"), r.URL.Query().Get("status"))
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if entries == nil {
		entries = []domain.ProjectKBEntry{}
	}
	middleware.WriteJSONList(w, entries, len(entries), 1, 100)
}

// POST /api/v1/projects/{projectID}/kb
func (h *ProjectKBHandler) Create(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	userID := middleware.UserIDFromContext(r.Context())
	var body struct {
		Title   string   `json:"title"`
		Content string   `json:"content"`
		Type    string   `json:"type"`
		Tags    []string `json:"tags"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if body.Title == "" {
		middleware.WriteFieldError(w, "title", "title is required")
		return
	}
	if body.Content == "" {
		middleware.WriteFieldError(w, "content", "content is required")
		return
	}
	if body.Type == "" {
		body.Type = "spec"
	}
	if !domain.ValidKBTypes[body.Type] {
		middleware.WriteFieldError(w, "type", "invalid type")
		return
	}
	if body.Tags == nil {
		body.Tags = []string{}
	}
	pid := projectID
	entry, err := h.repo.Create(r.Context(), domain.ProjectKBEntry{
		ProjectID: &pid, UserID: userID, Type: body.Type,
		Title: body.Title, Content: body.Content, Tags: body.Tags,
		InputType: "text", Status: "verified", Confidence: 1.0,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusCreated, entry)
}

// PUT /api/v1/projects/{projectID}/kb/{id}
func (h *ProjectKBHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := middleware.UserIDFromContext(r.Context())
	var body struct {
		Title   string   `json:"title"`
		Content string   `json:"content"`
		Tags    []string `json:"tags"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if body.Tags == nil {
		body.Tags = []string{}
	}
	entry, err := h.repo.Update(r.Context(), domain.ProjectKBEntry{
		ID: id, UserID: userID, Title: body.Title, Content: body.Content, Tags: body.Tags,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusOK, entry)
}

// PUT /api/v1/projects/{projectID}/kb/{id}/verify
func (h *ProjectKBHandler) Verify(w http.ResponseWriter, r *http.Request) {
	id, userID := chi.URLParam(r, "id"), middleware.UserIDFromContext(r.Context())
	entry, err := h.repo.SetStatus(r.Context(), id, userID, "verified")
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusOK, entry)
}

// PUT /api/v1/projects/{projectID}/kb/{id}/deprecate
func (h *ProjectKBHandler) Deprecate(w http.ResponseWriter, r *http.Request) {
	id, userID := chi.URLParam(r, "id"), middleware.UserIDFromContext(r.Context())
	entry, err := h.repo.SetStatus(r.Context(), id, userID, "deprecated")
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusOK, entry)
}

// DELETE /api/v1/projects/{projectID}/kb/{id}
func (h *ProjectKBHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, userID := chi.URLParam(r, "id"), middleware.UserIDFromContext(r.Context())
	if err := h.repo.Delete(r.Context(), id, userID); err != nil {
		middleware.WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
