CREATE TABLE IF NOT EXISTS task_steps (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  task_id     TEXT        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  seq_no      INTEGER     NOT NULL,
  agent       TEXT        NOT NULL,
  summary     TEXT        NOT NULL DEFAULT '',
  tool_calls  JSONB       NOT NULL DEFAULT '[]',
  duration_ms INTEGER     NOT NULL DEFAULT 0,
  status      TEXT        NOT NULL DEFAULT 'done',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, seq_no)
);

CREATE INDEX IF NOT EXISTS task_steps_task_id_idx ON task_steps(task_id);
