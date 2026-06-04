package domain

import "time"

type ProjectKBEntry struct {
	ID          string    `json:"id"`
	ProjectID   *string   `json:"projectId"`
	UserID      string    `json:"userId"`
	IsGlobal    bool      `json:"isGlobal"`
	Type        string    `json:"type"`
	Title       string    `json:"title"`
	Content     string    `json:"content"`
	Tags        []string  `json:"tags"`
	InputType   string    `json:"inputType"`
	SourceRef   string    `json:"sourceRef"`
	SourceAgent string    `json:"sourceAgent"`
	SourceTask  string    `json:"taskId"`
	Status      string    `json:"status"`
	Confidence  float64   `json:"confidence"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

var ValidKBTypes    = map[string]bool{"principle": true, "spec": true, "test_asset": true, "past_output": true}
var ValidKBStatus   = map[string]bool{"processing": true, "pending": true, "verified": true, "deprecated": true}
var ValidInputTypes = map[string]bool{"text": true, "url": true, "file": true}
