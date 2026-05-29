package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/forge-ai/forge/api/api/middleware"
)

const testSecret = "test-secret-key"

func TestRequireAuth_NoToken(t *testing.T) {
	handler := middleware.RequireAuth(testSecret)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
}

func TestRequireAuth_InvalidToken(t *testing.T) {
	handler := middleware.RequireAuth(testSecret)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer invalid-token")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
}

func TestRequireAuth_ValidToken(t *testing.T) {
	const userID = "user-abc-123"

	token, err := middleware.GenerateJWT(userID, testSecret)
	if err != nil {
		t.Fatalf("GenerateJWT failed: %v", err)
	}

	var capturedUserID string
	nextCalled := false

	handler := middleware.RequireAuth(testSecret)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		capturedUserID = middleware.UserIDFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	if !nextCalled {
		t.Error("expected next handler to be called")
	}
	if capturedUserID != userID {
		t.Errorf("expected userID %q, got %q", userID, capturedUserID)
	}
}

func TestGenerateAndValidateJWT(t *testing.T) {
	const userID = "user-xyz-789"

	token, err := middleware.GenerateJWT(userID, testSecret)
	if err != nil {
		t.Fatalf("GenerateJWT failed: %v", err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}

	// Validate via the middleware: a valid token must pass RequireAuth and
	// deliver the correct userID into context.
	var gotUserID string
	handler := middleware.RequireAuth(testSecret)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotUserID = middleware.UserIDFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	if gotUserID != userID {
		t.Errorf("expected sub=%q, got %q", userID, gotUserID)
	}
}
