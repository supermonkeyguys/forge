package handler

import (
	"encoding/json"
	"net/http"

	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

// AuthHandler handles /api/v1/auth routes.
type AuthHandler struct {
	userRepo  domain.UserRepository
	jwtSecret string
	hasher    PasswordHasher
}

// PasswordHasher abstracts bcrypt so tests can inject a fast stub.
type PasswordHasher interface {
	Hash(password string) (string, error)
	Verify(hash, password string) error
}

func NewAuthHandler(userRepo domain.UserRepository, jwtSecret string, hasher PasswordHasher) *AuthHandler {
	return &AuthHandler{userRepo: userRepo, jwtSecret: jwtSecret, hasher: hasher}
}

// POST /api/v1/auth/register
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Name     string `json:"name"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if !domain.ValidEmail(body.Email) {
		middleware.WriteFieldError(w, "email", "invalid email address")
		return
	}
	if !domain.ValidPassword(body.Password) {
		middleware.WriteFieldError(w, "password", "password must be at least 8 characters")
		return
	}
	if body.Name == "" {
		middleware.WriteFieldError(w, "name", "name is required")
		return
	}

	hashed, err := h.hasher.Hash(body.Password)
	if err != nil {
		middleware.WriteError(w, domain.ErrInternal)
		return
	}

	user, err := h.userRepo.Create(r.Context(), domain.User{
		Email:    body.Email,
		Name:     body.Name,
		Password: hashed,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}

	token, err := middleware.GenerateJWT(user.ID, h.jwtSecret)
	if err != nil {
		middleware.WriteError(w, domain.ErrInternal)
		return
	}

	middleware.WriteJSON(w, http.StatusCreated, map[string]any{
		"token": token,
		"user":  safeUser(user),
	})
}

// POST /api/v1/auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}

	user, err := h.userRepo.GetByEmail(r.Context(), body.Email)
	if err != nil {
		// Return 401 regardless of whether user exists (no user enumeration).
		middleware.WriteError(w, domain.ErrUnauthorized)
		return
	}

	if err := h.hasher.Verify(user.Password, body.Password); err != nil {
		middleware.WriteError(w, domain.ErrUnauthorized)
		return
	}

	token, err := middleware.GenerateJWT(user.ID, h.jwtSecret)
	if err != nil {
		middleware.WriteError(w, domain.ErrInternal)
		return
	}

	middleware.WriteJSON(w, http.StatusOK, map[string]any{
		"token": token,
		"user":  safeUser(user),
	})
}

// GET /api/v1/auth/me
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	user, err := h.userRepo.GetByID(r.Context(), userID)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}

	middleware.WriteJSON(w, http.StatusOK, safeUser(user))
}

// safeUser strips the password hash before sending to clients.
func safeUser(u domain.User) map[string]any {
	return map[string]any{
		"id":        u.ID,
		"email":     u.Email,
		"name":      u.Name,
		"createdAt": u.CreatedAt,
	}
}
