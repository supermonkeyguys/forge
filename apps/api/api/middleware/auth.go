package middleware

import (
	"context"
	"net/http"
	"strings"
)

type contextKey string

const userIDKey contextKey = "userID"

// RequireAuth validates the Bearer token and injects userID into context.
// Handlers retrieve it with UserIDFromContext.
func RequireAuth(jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := extractBearerToken(r)
			if token == "" {
				WriteError(w, domain_ErrUnauthorized())
				return
			}

			userID, err := validateJWT(token, jwtSecret)
			if err != nil {
				WriteError(w, domain_ErrUnauthorized())
				return
			}

			ctx := context.WithValue(r.Context(), userIDKey, userID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// UserIDFromContext retrieves the authenticated user ID from context.
// Returns "" if not set (caller should have used RequireAuth middleware).
func UserIDFromContext(ctx context.Context) string {
	v, _ := ctx.Value(userIDKey).(string)
	return v
}

func extractBearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return ""
	}
	return strings.TrimPrefix(h, "Bearer ")
}

// Stub — replace with real JWT validation (e.g. golang-jwt/jwt)
func validateJWT(token, secret string) (string, error) {
	// TODO: implement JWT validation
	_ = secret
	_ = token
	return "", nil
}

// domain_ErrUnauthorized avoids importing domain in this file directly.
// The real mapping is in domainErrToHTTP above.
func domain_ErrUnauthorized() error {
	return errUnauthorized{}
}

type errUnauthorized struct{}

func (e errUnauthorized) Error() string { return "unauthorized" }
func (e errUnauthorized) Is(target error) bool {
	// Make errors.Is(e, domain.ErrUnauthorized) work without importing domain
	return target.Error() == "unauthorized"
}
