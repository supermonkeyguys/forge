package domain

import (
	"regexp"
	"time"
)

type User struct {
	ID        string
	Email     string
	Name      string
	Password  string // bcrypt hash, never plaintext
	CreatedAt time.Time
}

var emailRe = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

// Pure validation — no DB, directly testable.
func ValidEmail(email string) bool {
	return emailRe.MatchString(email)
}

func ValidPassword(password string) bool {
	return len(password) >= 8
}
