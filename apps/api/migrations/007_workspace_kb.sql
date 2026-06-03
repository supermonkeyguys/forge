CREATE TABLE IF NOT EXISTS workspace_kb (
  id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id      TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  content      TEXT        NOT NULL,
  tags         TEXT[]      NOT NULL DEFAULT '{}',
  source_agent TEXT        NOT NULL DEFAULT '',
  source_task  TEXT        NOT NULL DEFAULT '',
  verified     BOOLEAN     NOT NULL DEFAULT false,
  confidence   FLOAT       NOT NULL DEFAULT 0.8,
  stale_at     TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_kb_user_id_idx ON workspace_kb(user_id);
CREATE INDEX IF NOT EXISTS workspace_kb_tags_idx    ON workspace_kb USING GIN(tags);
