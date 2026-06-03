package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

type WorkspaceKBHandler struct{ repo domain.WorkspaceKBRepository }

func NewWorkspaceKBHandler(repo domain.WorkspaceKBRepository) *WorkspaceKBHandler {
	return &WorkspaceKBHandler{repo: repo}
}

// GET /api/v1/kb?q=
func (h *WorkspaceKBHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	q := r.URL.Query().Get("q")
	var entries []domain.WorkspaceKBEntry
	var err error
	if q != "" {
		entries, err = h.repo.Search(r.Context(), userID, q, 20)
	} else {
		entries, err = h.repo.List(r.Context(), userID)
	}
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if entries == nil {
		entries = []domain.WorkspaceKBEntry{}
	}
	middleware.WriteJSONList(w, entries, len(entries), 1, 100)
}

// POST /api/v1/kb
func (h *WorkspaceKBHandler) Create(w http.ResponseWriter, r *http.Request) {
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
	if body.Title == "" {
		middleware.WriteFieldError(w, "title", "title is required")
		return
	}
	if body.Content == "" {
		middleware.WriteFieldError(w, "content", "content is required")
		return
	}
	if body.Tags == nil {
		body.Tags = []string{}
	}
	entry, err := h.repo.Create(r.Context(), domain.WorkspaceKBEntry{
		UserID: userID, Title: body.Title, Content: body.Content, Tags: body.Tags,
		Verified: true, Confidence: 1.0,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusCreated, entry)
}

// PUT /api/v1/kb/{id}
func (h *WorkspaceKBHandler) Update(w http.ResponseWriter, r *http.Request) {
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
	entry, err := h.repo.Update(r.Context(), domain.WorkspaceKBEntry{
		ID: id, UserID: userID, Title: body.Title, Content: body.Content, Tags: body.Tags,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusOK, entry)
}

// PATCH /api/v1/kb/{id}/verify
func (h *WorkspaceKBHandler) Verify(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := middleware.UserIDFromContext(r.Context())
	entry, err := h.repo.Verify(r.Context(), id, userID)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusOK, entry)
}

// DELETE /api/v1/kb/{id}
func (h *WorkspaceKBHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := middleware.UserIDFromContext(r.Context())
	if err := h.repo.Delete(r.Context(), id, userID); err != nil {
		middleware.WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
