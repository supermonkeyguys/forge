package domain

import "time"

type WorkspaceKBEntry struct {
	ID          string     `json:"id"`
	UserID      string     `json:"userId"`
	Title       string     `json:"title"`
	Content     string     `json:"content"`
	Tags        []string   `json:"tags"`
	SourceAgent string     `json:"sourceAgent"`
	SourceTask  string     `json:"sourceTask"`
	Verified    bool       `json:"verified"`
	Confidence  float64    `json:"confidence"`
	StaleAt     *time.Time `json:"staleAt"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}
