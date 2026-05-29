package handler_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/forge-ai/forge/api/api/handler"
	"github.com/forge-ai/forge/api/domain"
	"github.com/forge-ai/forge/api/infra/mock"
)

// plainHasher is a fast password hasher stub for tests — avoids real bcrypt.
type plainHasher struct{}

func (plainHasher) Hash(p string) (string, error)     { return "hashed:" + p, nil }
func (plainHasher) Verify(h, p string) error {
	if h != "hashed:"+p {
		return errors.New("wrong password")
	}
	return nil
}

const testJWTSecret = "test-secret"

func newAuthHandler(userRepo *mock.UserRepo) *handler.AuthHandler {
	return handler.NewAuthHandler(userRepo, testJWTSecret, plainHasher{})
}

func TestAuthHandler_Register_InvalidEmail(t *testing.T) {
	h := newAuthHandler(&mock.UserRepo{})

	body := `{"email":"notanemail","name":"x","password":"12345678"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Register(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}

	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	errObj, ok := resp["error"].(map[string]any)
	if !ok {
		t.Fatal("expected error object in response")
	}
	if errObj["field"] != "email" {
		t.Errorf("expected field=email, got %v", errObj["field"])
	}
}

func TestAuthHandler_Register_WeakPassword(t *testing.T) {
	h := newAuthHandler(&mock.UserRepo{})

	body := `{"email":"a@b.com","name":"x","password":"short"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Register(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}

	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	errObj, ok := resp["error"].(map[string]any)
	if !ok {
		t.Fatal("expected error object in response")
	}
	if errObj["field"] != "password" {
		t.Errorf("expected field=password, got %v", errObj["field"])
	}
}

func TestAuthHandler_Register_MissingName(t *testing.T) {
	h := newAuthHandler(&mock.UserRepo{})

	body := `{"email":"a@b.com","name":"","password":"12345678"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Register(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}

	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	errObj, ok := resp["error"].(map[string]any)
	if !ok {
		t.Fatal("expected error object in response")
	}
	if errObj["field"] != "name" {
		t.Errorf("expected field=name, got %v", errObj["field"])
	}
}

func TestAuthHandler_Register_DuplicateEmail(t *testing.T) {
	repo := &mock.UserRepo{
		CreateFn: func(_ context.Context, u domain.User) (domain.User, error) {
			return domain.User{}, domain.ErrAlreadyExists
		},
	}
	h := newAuthHandler(repo)

	body := `{"email":"a@b.com","name":"Alice","password":"12345678"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Register(w, req)

	if w.Code != http.StatusConflict {
		t.Errorf("expected 409, got %d", w.Code)
	}
}

func TestAuthHandler_Register_Success(t *testing.T) {
	repo := &mock.UserRepo{
		CreateFn: func(_ context.Context, u domain.User) (domain.User, error) {
			u.ID = "user-1"
			return u, nil
		},
	}
	h := newAuthHandler(repo)

	body := `{"email":"a@b.com","name":"Alice","password":"12345678"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Register(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	data, ok := resp["data"].(map[string]any)
	if !ok {
		t.Fatalf("expected data object, got: %v", resp)
	}
	if _, hasToken := data["token"]; !hasToken {
		t.Error("expected token in response data")
	}
	if _, hasPassword := data["password"]; hasPassword {
		t.Error("response must not contain password field")
	}
}

func TestAuthHandler_Login_WrongPassword(t *testing.T) {
	repo := &mock.UserRepo{
		GetByEmailFn: func(_ context.Context, email string) (domain.User, error) {
			return domain.User{
				ID:       "user-1",
				Email:    email,
				Password: "hashed:correctpassword",
			}, nil
		},
	}
	h := newAuthHandler(repo)

	body := `{"email":"a@b.com","password":"wrongpassword"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Login(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestAuthHandler_Login_UserNotFound(t *testing.T) {
	repo := &mock.UserRepo{
		GetByEmailFn: func(_ context.Context, email string) (domain.User, error) {
			return domain.User{}, domain.ErrNotFound
		},
	}
	h := newAuthHandler(repo)

	body := `{"email":"unknown@b.com","password":"12345678"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Login(w, req)

	// Must return 401 regardless of whether user exists (no user enumeration).
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestAuthHandler_Login_Success(t *testing.T) {
	repo := &mock.UserRepo{
		GetByEmailFn: func(_ context.Context, email string) (domain.User, error) {
			return domain.User{
				ID:       "user-1",
				Email:    email,
				Name:     "Alice",
				Password: "hashed:12345678",
			}, nil
		},
	}
	h := newAuthHandler(repo)

	body := `{"email":"a@b.com","password":"12345678"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.Login(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	data, ok := resp["data"].(map[string]any)
	if !ok {
		t.Fatalf("expected data object, got: %v", resp)
	}
	if _, hasToken := data["token"]; !hasToken {
		t.Error("expected token in response data")
	}
}
