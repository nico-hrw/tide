package db

import "time"

// LinkType defines the type of relationship.
type LinkType string

const (
	LinkTypeManual LinkType = "manual" // User manually linked
	LinkTypeAuto   LinkType = "auto"   // Automatically detected (future)
)

// Link represents a graph edge between two files (nodes).
type Link struct {
	SourceID  string    `json:"source_id"`
	TargetID  string    `json:"target_id"`
	Type      LinkType  `json:"type"`
	CreatedAt time.Time `json:"created_at"`
}
