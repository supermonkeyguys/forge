CREATE TABLE IF NOT EXISTS agents (
  id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id      TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  description  TEXT        NOT NULL DEFAULT '',
  instructions TEXT        NOT NULL DEFAULT '',
  tools        TEXT[]      NOT NULL DEFAULT '{}',
  write_paths  TEXT[]      NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX agents_user_id_idx ON agents(user_id);
