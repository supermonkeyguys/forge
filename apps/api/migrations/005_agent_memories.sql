CREATE TABLE IF NOT EXISTS agent_memories (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agent_key     TEXT        NOT NULL,
  user_id       TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memory_key    TEXT        NOT NULL DEFAULT '',
  content       TEXT        NOT NULL,
  weight        FLOAT       NOT NULL DEFAULT 1.0,
  access_count  INT         NOT NULL DEFAULT 0,
  last_accessed TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_memories_agent_key_idx ON agent_memories(agent_key, user_id);
CREATE INDEX IF NOT EXISTS agent_memories_weight_idx    ON agent_memories(weight DESC);
