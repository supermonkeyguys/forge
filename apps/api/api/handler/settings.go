package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
	"github.com/forge-ai/forge/api/pkg/crypto"
)

type SettingsHandler struct {
	repo   domain.SettingsRepository
	encKey []byte
}

func NewSettingsHandler(repo domain.SettingsRepository, encKey []byte) *SettingsHandler {
	return &SettingsHandler{repo: repo, encKey: encKey}
}

// GET /api/v1/settings
func (h *SettingsHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	settings, err := h.repo.Get(r.Context(), userID)
	if errors.Is(err, domain.ErrNotFound) {
		middleware.WriteJSON(w, http.StatusOK, map[string]any{
			"baseUrl":   "",
			"hasApiKey": false,
		})
		return
	}
	if err != nil {
		middleware.WriteError(w, err)
		return
	}

	middleware.WriteJSON(w, http.StatusOK, map[string]any{
		"baseUrl":   settings.BaseURL,
		"hasApiKey": settings.HasAPIKey,
	})
}

// PUT /api/v1/settings
func (h *SettingsHandler) Save(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var body struct {
		BaseURL string `json:"baseUrl"`
		APIKey  string `json:"apiKey"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}

	var encryptedKey string
	if body.APIKey != "" {
		var err error
		encryptedKey, err = crypto.Encrypt(body.APIKey, h.encKey)
		if err != nil {
			middleware.WriteError(w, err)
			return
		}
	}

	if err := h.repo.Upsert(r.Context(), userID, body.BaseURL, encryptedKey); err != nil {
		middleware.WriteError(w, err)
		return
	}

	// Re-derive hasApiKey: use the newly-supplied key if present, otherwise check DB
	hasKey := body.APIKey != ""
	if !hasKey {
		if existing, gErr := h.repo.Get(r.Context(), userID); gErr == nil {
			hasKey = existing.HasAPIKey
		}
	}
	middleware.WriteJSON(w, http.StatusOK, map[string]any{
		"baseUrl":   body.BaseURL,
		"hasApiKey": hasKey,
	})
}

// DELETE /api/v1/settings/api-key
func (h *SettingsHandler) DeleteAPIKey(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	if err := h.repo.DeleteAPIKey(r.Context(), userID); err != nil {
		middleware.WriteError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
