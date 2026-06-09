package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

type CapabilityHandler struct {
	repo domain.CapabilityRepository
}

func NewCapabilityHandler(repo domain.CapabilityRepository) *CapabilityHandler {
	return &CapabilityHandler{repo: repo}
}

// POST /api/v1/capabilities
func (h *CapabilityHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var body struct {
		Name         string                    `json:"name"`
		Type         domain.CapabilityType     `json:"type"`
		Description  string                    `json:"description"`
		ConfigSchema map[string]any            `json:"configSchema"`
		Config       map[string]any            `json:"config"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if body.Name == "" {
		middleware.WriteFieldError(w, "name", "name is required")
		return
	}
	if body.Type == "" {
		middleware.WriteFieldError(w, "type", "type is required")
		return
	}

	cap, err := h.repo.Create(r.Context(), domain.Capability{
		UserID:       userID,
		Name:         body.Name,
		Type:         body.Type,
		Description:  body.Description,
		ConfigSchema: body.ConfigSchema,
		Config:       body.Config,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusCreated, cap)
}

// GET /api/v1/capabilities
func (h *CapabilityHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	list, err := h.repo.ListByUserID(r.Context(), userID)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if list == nil {
		list = []domain.Capability{}
	}
	middleware.WriteJSON(w, http.StatusOK, list)
}

// GET /api/v1/capabilities/{capabilityID}
func (h *CapabilityHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	id := chi.URLParam(r, "capabilityID")

	cap, err := h.repo.GetByID(r.Context(), id)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if cap.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}
	middleware.WriteJSON(w, http.StatusOK, cap)
}

// PUT /api/v1/capabilities/{capabilityID}
func (h *CapabilityHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	id := chi.URLParam(r, "capabilityID")

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
		Name         string                `json:"name"`
		Type         domain.CapabilityType `json:"type"`
		Description  string                `json:"description"`
		ConfigSchema map[string]any        `json:"configSchema"`
		Config       map[string]any        `json:"config"` // TODO: encrypt sensitive fields
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if body.Name == "" {
		body.Name = existing.Name
	}
	if body.Type == "" {
		body.Type = existing.Type
	}

	updated, err := h.repo.Update(r.Context(), domain.Capability{
		ID:           id,
		UserID:       userID,
		Name:         body.Name,
		Type:         body.Type,
		Description:  body.Description,
		ConfigSchema: body.ConfigSchema,
		Config:       body.Config,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusOK, updated)
}

// DELETE /api/v1/capabilities/{capabilityID}
func (h *CapabilityHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	id := chi.URLParam(r, "capabilityID")

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
