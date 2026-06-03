CREATE TABLE IF NOT EXISTS project_context_sections (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id  TEXT        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  heading     TEXT        NOT NULL,
  content     TEXT        NOT NULL DEFAULT '',
  agent_role  TEXT        NOT NULL DEFAULT '',
  task_id     TEXT        NOT NULL DEFAULT '',
  version     INT         NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, heading)
);

CREATE INDEX IF NOT EXISTS project_context_sections_project_id_idx
  ON project_context_sections(project_id);
