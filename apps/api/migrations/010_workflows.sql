-- Workflows table
CREATE TABLE IF NOT EXISTS workflows (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id     TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    definition  JSONB NOT NULL DEFAULT '{"steps":[]}',
    trigger     JSONB NOT NULL DEFAULT '{"type":"manual"}',
    status      TEXT NOT NULL DEFAULT 'draft',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflows_user_id ON workflows(user_id);

-- Capabilities table
CREATE TABLE IF NOT EXISTS capabilities (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id       TEXT NOT NULL,
    name          TEXT NOT NULL,
    type          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    config_schema JSONB NOT NULL DEFAULT '{}',
    config        JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_capabilities_user_id ON capabilities(user_id);

-- Add workflow_id to tasks (nullable, backward compatible)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS workflow_id TEXT REFERENCES workflows(id) ON DELETE SET NULL;
