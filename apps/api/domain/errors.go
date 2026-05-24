package domain

import "errors"

// Sentinel errors — the ONLY errors the api and infra layers should return.
// infra/ must convert DB-specific errors (e.g. pgx.ErrNoRows) into these.
// api/middleware/error.go maps these to HTTP status codes.

var (
	ErrNotFound      = errors.New("not found")
	ErrAlreadyExists = errors.New("already exists")
	ErrUnauthorized  = errors.New("unauthorized")
	ErrForbidden     = errors.New("forbidden")
	ErrInvalidInput  = errors.New("invalid input")
	ErrInternal      = errors.New("internal error")
)
