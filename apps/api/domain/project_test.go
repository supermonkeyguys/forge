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

func TestProjectIsTerminal(t *testing.T) {
	terminal := []domain.ProjectStatus{
		domain.ProjectStatusDone,
		domain.ProjectStatusFailed,
	}
	for _, s := range terminal {
		p := domain.Project{Status: s}
		if !p.IsTerminal() {
			t.Errorf("expected IsTerminal=true for status %q", s)
		}
	}

	nonTerminal := []domain.ProjectStatus{
		domain.ProjectStatusIdle,
		domain.ProjectStatusAnalyzing,
		domain.ProjectStatusPlanning,
		domain.ProjectStatusBuilding,
		domain.ProjectStatusValidating,
		domain.ProjectStatusFixing,
		domain.ProjectStatusWaiting,
	}
	for _, s := range nonTerminal {
		p := domain.Project{Status: s}
		if p.IsTerminal() {
			t.Errorf("expected IsTerminal=false for status %q", s)
		}
	}
}

func TestValidStatus(t *testing.T) {
	valid := []string{
		"idle", "analyzing", "planning", "building",
		"validating", "fixing", "waiting", "done", "failed",
	}
	for _, s := range valid {
		if !domain.ValidStatus(s) {
			t.Errorf("expected ValidStatus=true for %q", s)
		}
	}

	invalid := []string{"", "unknown", "DONE", "Done", "running"}
	for _, s := range invalid {
		if domain.ValidStatus(s) {
			t.Errorf("expected ValidStatus=false for %q", s)
		}
	}
}
