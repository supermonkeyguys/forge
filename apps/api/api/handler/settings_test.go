package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/forge-ai/forge/api/api/handler"
	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

type stubSettingsRepo struct {
	settings map[string]*settingsRow
}

type settingsRow struct {
	baseURL      string
	encryptedKey string
}

func newStubSettingsRepo() *stubSettingsRepo {
	return &stubSettingsRepo{settings: map[string]*settingsRow{}}
}

func (r *stubSettingsRepo) Get(ctx context.Context, userID string) (domain.UserSettings, error) {
	row, ok := r.settings[userID]
	if !ok {
		return domain.UserSettings{}, domain.ErrNotFound
	}
	return domain.UserSettings{
		UserID:    userID,
		BaseURL:   row.baseURL,
		HasAPIKey: row.encryptedKey != "",
	}, nil
}

func (r *stubSettingsRepo) Upsert(ctx context.Context, userID, baseURL, encryptedKey string) error {
	if _, ok := r.settings[userID]; !ok {
		r.settings[userID] = &settingsRow{}
	}
	r.settings[userID].baseURL = baseURL
	if encryptedKey != "" {
		r.settings[userID].encryptedKey = encryptedKey
	}
	return nil
}

func (r *stubSettingsRepo) DeleteAPIKey(ctx context.Context, userID string) error {
	if row, ok := r.settings[userID]; ok {
		row.encryptedKey = ""
	}
	return nil
}

func requestWithUser(method, path string, body any, userID string) *http.Request {
	var buf bytes.Buffer
	if body != nil {
		json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	ctx := middleware.WithUserID(req.Context(), userID)
	return req.WithContext(ctx)
}

func TestSettingsGet_NotFound_ReturnsEmpty(t *testing.T) {
	encKey := make([]byte, 32)
	h := handler.NewSettingsHandler(newStubSettingsRepo(), encKey)

	req := requestWithUser("GET", "/api/v1/settings", nil, "user-1")
	w := httptest.NewRecorder()
	h.Get(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status: got %d, want 200", w.Code)
	}
	var resp struct {
		Data struct {
			BaseURL   string `json:"baseUrl"`
			HasAPIKey bool   `json:"hasApiKey"`
		} `json:"data"`
	}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.Data.HasAPIKey {
		t.Error("expected hasApiKey=false for new user")
	}
}

func TestSettingsSave_EncryptsKey(t *testing.T) {
	encKey := make([]byte, 32)
	repo := newStubSettingsRepo()
	h := handler.NewSettingsHandler(repo, encKey)

	body := map[string]string{"baseUrl": "https://api.openai.com/v1", "apiKey": "sk-test"}
	req := requestWithUser("PUT", "/api/v1/settings", body, "user-1")
	w := httptest.NewRecorder()
	h.Save(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status: got %d, want 200", w.Code)
	}
	if repo.settings["user-1"].encryptedKey == "sk-test" {
		t.Error("key should be encrypted, not stored as plaintext")
	}
	if repo.settings["user-1"].encryptedKey == "" {
		t.Error("encrypted key should not be empty")
	}
}
