package domain_test

import (
	"strings"
	"testing"

	"github.com/forge-ai/forge/api/domain"
)

func TestValidEmail(t *testing.T) {
	valid := []string{
		"a@b.com",
		"user+tag@example.org",
		"firstname.lastname@company.co.uk",
	}
	for _, e := range valid {
		if !domain.ValidEmail(e) {
			t.Errorf("expected %q to be a valid email", e)
		}
	}

	invalid := []string{
		"",
		"notanemail",
		"@missing.com",
		"no-at-sign",
		"missing-domain@",
		"spaces in@email.com",
	}
	for _, e := range invalid {
		if domain.ValidEmail(e) {
			t.Errorf("expected %q to be an invalid email", e)
		}
	}
}

func TestValidPassword(t *testing.T) {
	// Valid: exactly 8 chars (lower bound)
	if !domain.ValidPassword("12345678") {
		t.Error("8-char password should be valid")
	}
	// Valid: exactly 72 chars (upper bound)
	if !domain.ValidPassword(strings.Repeat("a", 72)) {
		t.Error("72-char password should be valid")
	}
	// Valid: 32-char mid-range
	if !domain.ValidPassword(strings.Repeat("x", 32)) {
		t.Error("32-char password should be valid")
	}

	// Invalid: 7 chars (too short)
	if domain.ValidPassword("1234567") {
		t.Error("7-char password should be invalid")
	}
	// Invalid: 73 chars (too long)
	if domain.ValidPassword(strings.Repeat("a", 73)) {
		t.Error("73-char password should be invalid")
	}
	// Invalid: empty string
	if domain.ValidPassword("") {
		t.Error("empty password should be invalid")
	}
}
