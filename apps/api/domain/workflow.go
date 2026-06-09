package domain

import "time"

type WorkflowStatus string

const (
	WorkflowStatusDraft  WorkflowStatus = "draft"
	WorkflowStatusActive WorkflowStatus = "active"
)

// WorkflowStep is a single execution step stored as part of WorkflowDefinition JSONB.
type WorkflowStep struct {
	ID           string         `json:"id"`
	Name         string         `json:"name"`
	Capability   string         `json:"capability"` // browser|http|llm|notify|code
	Instructions string         `json:"instructions"`
	DependsOn    []string       `json:"depends_on"`
	Config       map[string]any `json:"config,omitempty"`
}

// WorkflowDefinition is AI-generated; stored as JSONB.
type WorkflowDefinition struct {
	Steps []WorkflowStep `json:"steps"`
}

type WorkflowTrigger struct {
	Type   string         `json:"type"` // manual|webhook|schedule
	Config map[string]any `json:"config,omitempty"`
}

type Workflow struct {
	ID          string             `json:"id"`
	UserID      string             `json:"userId"`
	Name        string             `json:"name"`
	Description string             `json:"description"`
	Definition  WorkflowDefinition `json:"definition"`
	Trigger     WorkflowTrigger    `json:"trigger"`
	Status      WorkflowStatus     `json:"status"`
	CreatedAt   time.Time          `json:"createdAt"`
	UpdatedAt   time.Time          `json:"updatedAt"`
}
