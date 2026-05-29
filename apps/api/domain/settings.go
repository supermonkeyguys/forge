package domain

import "time"

// UserSettings holds per-user AI service configuration.
// HasAPIKey is a derived field — the raw key is never returned to callers.
type UserSettings struct {
	UserID    string
	BaseURL   string
	HasAPIKey bool
	CreatedAt time.Time
	UpdatedAt time.Time
}
