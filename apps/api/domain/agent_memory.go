package domain

import "time"

type AgentMemory struct {
	ID           string     `json:"id"`
	AgentKey     string     `json:"agentKey"`
	UserID       string     `json:"userId"`
	MemoryKey    string     `json:"memoryKey"`
	Content      string     `json:"content"`
	Weight       float64    `json:"weight"`
	AccessCount  int        `json:"accessCount"`
	LastAccessed *time.Time `json:"lastAccessed"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
}
