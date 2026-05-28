package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/forge-ai/forge/api/api/middleware"
)

func okHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
}

func TestRequireInternalToken_NoTokenConfigured_Passes(t *testing.T) {
	handler := middleware.RequireInternalToken("")(http.HandlerFunc(okHandler))
	req := httptest.NewRequest(http.MethodPatch, "/internal/tasks/abc/status", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestRequireInternalToken_ValidToken_Passes(t *testing.T) {
	handler := middleware.RequireInternalToken("secret123")(http.HandlerFunc(okHandler))
	req := httptest.NewRequest(http.MethodPatch, "/internal/tasks/abc/status", nil)
	req.Header.Set("X-Internal-Token", "secret123")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestRequireInternalToken_WrongToken_Returns401(t *testing.T) {
	handler := middleware.RequireInternalToken("secret123")(http.HandlerFunc(okHandler))
	req := httptest.NewRequest(http.MethodPatch, "/internal/tasks/abc/status", nil)
	req.Header.Set("X-Internal-Token", "wrong")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestRequireInternalToken_MissingHeader_Returns401(t *testing.T) {
	handler := middleware.RequireInternalToken("secret123")(http.HandlerFunc(okHandler))
	req := httptest.NewRequest(http.MethodPatch, "/internal/tasks/abc/status", nil)
	// no X-Internal-Token header
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}
