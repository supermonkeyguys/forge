package domain_test

import (
	"testing"

	"github.com/forge-ai/forge/api/domain"
)

func TestTask_IsActive(t *testing.T) {
	active := []domain.TaskStatus{
		domain.TaskStatusAnalyzing,
		domain.TaskStatusPlanning,
		domain.TaskStatusBuilding,
		domain.TaskStatusValidating,
		domain.TaskStatusFixing,
	}
	for _, s := range active {
		task := domain.Task{Status: s}
		if !task.IsActive() {
			t.Errorf("expected IsActive() = true for status %s", s)
		}
	}

	inactive := []domain.TaskStatus{
		domain.TaskStatusIdle,
		domain.TaskStatusWaiting,
		domain.TaskStatusDone,
		domain.TaskStatusFailed,
	}
	for _, s := range inactive {
		task := domain.Task{Status: s}
		if task.IsActive() {
			t.Errorf("expected IsActive() = false for status %s", s)
		}
	}
}

func TestTask_CanRetry(t *testing.T) {
	retryable := []domain.TaskStatus{domain.TaskStatusFailed, domain.TaskStatusWaiting}
	for _, s := range retryable {
		task := domain.Task{Status: s}
		if !task.CanRetry() {
			t.Errorf("expected CanRetry() = true for status %s", s)
		}
	}

	nonRetryable := []domain.TaskStatus{
		domain.TaskStatusIdle,
		domain.TaskStatusAnalyzing,
		domain.TaskStatusDone,
	}
	for _, s := range nonRetryable {
		task := domain.Task{Status: s}
		if task.CanRetry() {
			t.Errorf("expected CanRetry() = false for status %s", s)
		}
	}
}

func TestTask_IsTerminal(t *testing.T) {
	terminal := []domain.TaskStatus{domain.TaskStatusDone, domain.TaskStatusFailed}
	for _, s := range terminal {
		task := domain.Task{Status: s}
		if !task.IsTerminal() {
			t.Errorf("expected IsTerminal() = true for status %s", s)
		}
	}

	nonTerminal := []domain.TaskStatus{
		domain.TaskStatusIdle,
		domain.TaskStatusAnalyzing,
		domain.TaskStatusWaiting,
	}
	for _, s := range nonTerminal {
		task := domain.Task{Status: s}
		if task.IsTerminal() {
			t.Errorf("expected IsTerminal() = false for status %s", s)
		}
	}
}

func TestValidTaskStatus(t *testing.T) {
	valid := []string{"idle", "analyzing", "planning", "building", "validating", "fixing", "waiting", "done", "failed"}
	for _, s := range valid {
		if !domain.ValidTaskStatus(s) {
			t.Errorf("expected ValidTaskStatus(%q) = true", s)
		}
	}
	if domain.ValidTaskStatus("unknown") {
		t.Error("expected ValidTaskStatus(\"unknown\") = false")
	}
}
