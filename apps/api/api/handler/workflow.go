package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

type WorkflowHandler struct {
	repo domain.WorkflowRepository
}

func NewWorkflowHandler(repo domain.WorkflowRepository) *WorkflowHandler {
	return &WorkflowHandler{repo: repo}
}

// POST /api/v1/workflows
func (h *WorkflowHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var body struct {
		Name        string                    `json:"name"`
		Description string                    `json:"description"`
		Definition  domain.WorkflowDefinition `json:"definition"`
		Trigger     domain.WorkflowTrigger    `json:"trigger"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if body.Name == "" {
		middleware.WriteFieldError(w, "name", "name is required")
		return
	}

	wf, err := h.repo.Create(r.Context(), domain.Workflow{
		UserID:      userID,
		Name:        body.Name,
		Description: body.Description,
		Definition:  body.Definition,
		Trigger:     body.Trigger,
		Status:      domain.WorkflowStatusDraft,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusCreated, wf)
}

// GET /api/v1/workflows
func (h *WorkflowHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	list, err := h.repo.ListByUserID(r.Context(), userID)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if list == nil {
		list = []domain.Workflow{}
	}
	middleware.WriteJSON(w, http.StatusOK, list)
}

// GET /api/v1/workflows/{workflowID}
func (h *WorkflowHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	id := chi.URLParam(r, "workflowID")

	wf, err := h.repo.GetByID(r.Context(), id)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if wf.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}
	middleware.WriteJSON(w, http.StatusOK, wf)
}

// PUT /api/v1/workflows/{workflowID}
func (h *WorkflowHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	id := chi.URLParam(r, "workflowID")

	existing, err := h.repo.GetByID(r.Context(), id)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if existing.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}

	var body struct {
		Name        string                    `json:"name"`
		Description string                    `json:"description"`
		Definition  domain.WorkflowDefinition `json:"definition"`
		Trigger     domain.WorkflowTrigger    `json:"trigger"`
		Status      domain.WorkflowStatus     `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if body.Name == "" {
		body.Name = existing.Name
	}
	if body.Status == "" {
		body.Status = existing.Status
	}

	updated, err := h.repo.Update(r.Context(), domain.Workflow{
		ID:          id,
		UserID:      userID,
		Name:        body.Name,
		Description: body.Description,
		Definition:  body.Definition,
		Trigger:     body.Trigger,
		Status:      body.Status,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusOK, updated)
}

// DELETE /api/v1/workflows/{workflowID}
func (h *WorkflowHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	id := chi.URLParam(r, "workflowID")

	existing, err := h.repo.GetByID(r.Context(), id)
	if errors.Is(err, domain.ErrNotFound) {
		middleware.WriteError(w, domain.ErrNotFound)
		return
	}
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if existing.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}

	if err := h.repo.Delete(r.Context(), id); err != nil {
		middleware.WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
