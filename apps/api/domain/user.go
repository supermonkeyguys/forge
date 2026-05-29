package domain

import (
	"regexp"
	"time"
)

type User struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Password  string    `json:"-"` // bcrypt hash, never exposed in JSON
	CreatedAt time.Time `json:"createdAt"`
}

var emailRe = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

// Pure validation — no DB, directly testable.
func ValidEmail(email string) bool {
	return emailRe.MatchString(email)
}

func ValidPassword(password string) bool {
	return len(password) >= 8 && len(password) <= 72
}
