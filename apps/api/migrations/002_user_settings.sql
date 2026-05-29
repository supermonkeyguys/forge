-- apps/api/migrations/002_user_settings.sql
CREATE TABLE IF NOT EXISTS user_settings (
    user_id     TEXT        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    base_url    TEXT        NOT NULL DEFAULT '',
    api_key_enc TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
