-- 012_workflow_last_triggered.sql
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS last_triggered_at TIMESTAMPTZ;
