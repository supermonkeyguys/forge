-- 011_workflow_runs.sql
CREATE TABLE IF NOT EXISTS workflow_runs (
    id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    workflow_id  TEXT        NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    user_id      TEXT        NOT NULL,
    status       TEXT        NOT NULL DEFAULT 'queued',
    error        TEXT        NOT NULL DEFAULT '',
    agent_job_id TEXT        NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_user_id     ON workflow_runs(user_id);
