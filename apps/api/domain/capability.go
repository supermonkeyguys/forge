package domain

import "time"

type CapabilityType string

const (
	CapabilityTypeBrowser CapabilityType = "browser"
	CapabilityTypeHTTP    CapabilityType = "http"
	CapabilityTypeLLM     CapabilityType = "llm"
	CapabilityTypeNotify  CapabilityType = "notify"
	CapabilityTypeCode    CapabilityType = "code"
	CapabilityTypeFile    CapabilityType = "file"
)

type Capability struct {
	ID           string         `json:"id"`
	UserID       string         `json:"userId"`
	Name         string         `json:"name"`
	Type         CapabilityType `json:"type"`
	Description  string         `json:"description"`
	ConfigSchema map[string]any `json:"configSchema"`
	Config       map[string]any `json:"config"` // TODO: encrypt sensitive fields before storage
	CreatedAt    time.Time      `json:"createdAt"`
	UpdatedAt    time.Time      `json:"updatedAt"`
}
