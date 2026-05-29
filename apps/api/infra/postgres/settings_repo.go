package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/forge-ai/forge/api/domain"
)

type settingsRepo struct {
	pool *pgxpool.Pool
}

func NewSettingsRepo(pool *pgxpool.Pool) domain.SettingsRepository {
	return &settingsRepo{pool: pool}
}

func (r *settingsRepo) Get(ctx context.Context, userID string) (domain.UserSettings, error) {
	const q = `
		SELECT user_id, base_url, api_key_enc IS NOT NULL AND api_key_enc != '', created_at, updated_at
		FROM user_settings
		WHERE user_id = $1`

	var s domain.UserSettings
	err := r.pool.QueryRow(ctx, q, userID).Scan(
		&s.UserID, &s.BaseURL, &s.HasAPIKey, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.UserSettings{}, domain.ErrNotFound
		}
		return domain.UserSettings{}, err
	}
	return s, nil
}

func (r *settingsRepo) Upsert(ctx context.Context, userID, baseURL, encryptedKey string) error {
	if encryptedKey == "" {
		const q = `
			INSERT INTO user_settings (user_id, base_url, updated_at)
			VALUES ($1, $2, now())
			ON CONFLICT (user_id) DO UPDATE
				SET base_url = EXCLUDED.base_url, updated_at = now()`
		_, err := r.pool.Exec(ctx, q, userID, baseURL)
		return err
	}
	const q = `
		INSERT INTO user_settings (user_id, base_url, api_key_enc, updated_at)
		VALUES ($1, $2, $3, now())
		ON CONFLICT (user_id) DO UPDATE
			SET base_url = EXCLUDED.base_url,
			    api_key_enc = EXCLUDED.api_key_enc,
			    updated_at = now()`
	_, err := r.pool.Exec(ctx, q, userID, baseURL, encryptedKey)
	return err
}

func (r *settingsRepo) DeleteAPIKey(ctx context.Context, userID string) error {
	const q = `UPDATE user_settings SET api_key_enc = NULL, updated_at = now() WHERE user_id = $1`
	_, err := r.pool.Exec(ctx, q, userID)
	return err
}
