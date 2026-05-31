-- Add events_json column to persist agent execution events after job completes.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS events_json TEXT NOT NULL DEFAULT '[]';
