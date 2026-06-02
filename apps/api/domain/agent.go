package domain

import "time"

type Agent struct {
	ID           string    `json:"id"`
	UserID       string    `json:"userId"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	Instructions string    `json:"instructions"`
	Tools        []string  `json:"tools"`
	WritePaths   []string  `json:"writePaths"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

var validAgentTools = map[string]bool{
	"read_file":   true,
	"write_file":  true,
	"str_replace": true,
	"tsc_check":   true,
	"spawn_task":  true,
}

func ValidAgentTool(t string) bool { return validAgentTools[t] }
