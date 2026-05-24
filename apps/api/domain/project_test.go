package domain_test

import (
	"testing"

	"github.com/forge-ai/forge/api/domain"
)

func TestProjectIsActive(t *testing.T) {
	active := []domain.ProjectStatus{
		domain.ProjectStatusAnalyzing,
		domain.ProjectStatusPlanning,
		domain.ProjectStatusBuilding,
		domain.ProjectStatusValidating,
		domain.ProjectStatusFixing,
	}
	for _, s := range active {
		p := domain.Project{Status: s}
		if !p.IsActive() {
			t.Errorf("expected IsActive=true for status %q", s)
		}
	}

	inactive := []domain.ProjectStatus{
		domain.ProjectStatusIdle,
		domain.ProjectStatusWaiting,
		domain.ProjectStatusDone,
		domain.ProjectStatusFailed,
	}
	for _, s := range inactive {
		p := domain.Project{Status: s}
		if p.IsActive() {
			t.Errorf("expected IsActive=false for status %q", s)
		}
	}
}

func TestProjectCanRetry(t *testing.T) {
	if !(&domain.Project{Status: domain.ProjectStatusFailed}).CanRetry() {
		t.Error("failed project should be retryable")
	}
	if !(&domain.Project{Status: domain.ProjectStatusWaiting}).CanRetry() {
		t.Error("waiting project should be retryable")
	}
	if (&domain.Project{Status: domain.ProjectStatusDone}).CanRetry() {
		t.Error("done project should not be retryable")
	}
}

func TestValidEmail(t *testing.T) {
	valid := []string{"a@b.com", "user+tag@example.org"}
	for _, e := range valid {
		if !domain.ValidEmail(e) {
			t.Errorf("expected %q to be valid", e)
		}
	}
	invalid := []string{"notanemail", "@missing.com", "no-at-sign"}
	for _, e := range invalid {
		if domain.ValidEmail(e) {
			t.Errorf("expected %q to be invalid", e)
		}
	}
}

func TestValidPassword(t *testing.T) {
	if !domain.ValidPassword("12345678") {
		t.Error("8-char password should be valid")
	}
	if domain.ValidPassword("short") {
		t.Error("short password should be invalid")
	}
}
