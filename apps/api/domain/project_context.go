package domain

import "time"

type ProjectContextSection struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"projectId"`
	Heading   string    `json:"heading"`
	Content   string    `json:"content"`
	AgentRole string    `json:"agentRole"`
	TaskID    string    `json:"taskId"`
	Version   int       `json:"version"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
