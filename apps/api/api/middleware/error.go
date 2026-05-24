package middleware

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/forge-ai/forge/api/domain"
)

// errorResponse is the canonical error shape returned to clients.
type errorResponse struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Field   string `json:"field,omitempty"`
}

// WriteError is the ONLY place that maps domain errors to HTTP status codes.
// All handlers must call this instead of writing their own error responses.
func WriteError(w http.ResponseWriter, err error) {
	status, code := domainErrToHTTP(err)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(errorResponse{
		Error: errorDetail{
			Code:    code,
			Message: err.Error(),
		},
	})
}

// WriteFieldError writes a 400 with a field-level message (e.g. validation errors).
func WriteFieldError(w http.ResponseWriter, field, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	json.NewEncoder(w).Encode(errorResponse{
		Error: errorDetail{
			Code:    "INVALID_INPUT",
			Message: message,
			Field:   field,
		},
	})
}

func domainErrToHTTP(err error) (status int, code string) {
	switch {
	case errors.Is(err, domain.ErrNotFound):
		return http.StatusNotFound, "NOT_FOUND"
	case errors.Is(err, domain.ErrAlreadyExists):
		return http.StatusConflict, "ALREADY_EXISTS"
	case errors.Is(err, domain.ErrUnauthorized):
		return http.StatusUnauthorized, "UNAUTHORIZED"
	case errors.Is(err, domain.ErrForbidden):
		return http.StatusForbidden, "FORBIDDEN"
	case errors.Is(err, domain.ErrInvalidInput):
		return http.StatusBadRequest, "INVALID_INPUT"
	default:
		return http.StatusInternalServerError, "INTERNAL_ERROR"
	}
}

// WriteJSON writes a successful JSON response.
func WriteJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]any{"data": data})
}

// WriteJSONList writes a paginated list response.
func WriteJSONList(w http.ResponseWriter, data any, total, page, limit int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]any{
		"data":  data,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}
