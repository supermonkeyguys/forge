CREATE TABLE IF NOT EXISTS project_kb (
  id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id   TEXT        REFERENCES projects(id) ON DELETE CASCADE,
  user_id      TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_global    BOOLEAN     NOT NULL DEFAULT false,
  type         TEXT        NOT NULL DEFAULT 'spec',
  title        TEXT        NOT NULL,
  content      TEXT        NOT NULL,
  tags         TEXT[]      NOT NULL DEFAULT '{}',
  input_type   TEXT        NOT NULL DEFAULT 'text',
  source_ref   TEXT        NOT NULL DEFAULT '',
  source_agent TEXT        NOT NULL DEFAULT '',
  source_task  TEXT        NOT NULL DEFAULT '',
  status       TEXT        NOT NULL DEFAULT 'pending',
  confidence   FLOAT       NOT NULL DEFAULT 0.8,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_kb_project_id_idx ON project_kb(project_id);
CREATE INDEX IF NOT EXISTS project_kb_user_id_idx    ON project_kb(user_id);
CREATE INDEX IF NOT EXISTS project_kb_type_idx       ON project_kb(type);
CREATE INDEX IF NOT EXISTS project_kb_status_idx     ON project_kb(status);
CREATE INDEX IF NOT EXISTS project_kb_tags_idx       ON project_kb USING GIN(tags);

-- Migrate workspace_kb → project_kb (as global entries)
INSERT INTO project_kb (id, user_id, is_global, type, title, content, tags,
                        source_agent, source_task, status, confidence, created_at, updated_at)
SELECT id, user_id, true, 'spec', title, content, tags,
       source_agent, source_task,
       CASE WHEN verified THEN 'verified' ELSE 'pending' END,
       confidence, created_at, updated_at
FROM workspace_kb
ON CONFLICT (id) DO NOTHING;

-- Migrate project_context_sections → project_kb
INSERT INTO project_kb (project_id, user_id, is_global, type, title, content,
                        source_agent, source_task, status, confidence, created_at, updated_at)
SELECT pcs.project_id, p.user_id, false, 'spec', pcs.heading, pcs.content,
       pcs.agent_role, pcs.task_id, 'verified', 1.0, pcs.created_at, pcs.updated_at
FROM project_context_sections pcs
JOIN projects p ON p.id = pcs.project_id
ON CONFLICT DO NOTHING;
