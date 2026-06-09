package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/forge-ai/forge/api/domain"
)

type capabilityRepo struct {
	pool *pgxpool.Pool
}

func NewCapabilityRepo(pool *pgxpool.Pool) domain.CapabilityRepository {
	return &capabilityRepo{pool: pool}
}

func (r *capabilityRepo) Create(ctx context.Context, c domain.Capability) (domain.Capability, error) {
	schemaJSON, _ := json.Marshal(c.ConfigSchema)
	configJSON, _ := json.Marshal(c.Config)
	const q = `
		INSERT INTO capabilities (user_id, name, type, description, config_schema, config, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, now(), now())
		RETURNING id, user_id, name, type, description, config_schema, config, created_at, updated_at`
	row := r.pool.QueryRow(ctx, q, c.UserID, c.Name, string(c.Type), c.Description, schemaJSON, configJSON)
	result, err := scanCapability(row)
	if err != nil {
		return domain.Capability{}, fmt.Errorf("capabilityRepo.Create: %w", err)
	}
	return result, nil
}

func (r *capabilityRepo) GetByID(ctx context.Context, id string) (domain.Capability, error) {
	const q = `
		SELECT id, user_id, name, type, description, config_schema, config, created_at, updated_at
		FROM capabilities WHERE id = $1`
	row := r.pool.QueryRow(ctx, q, id)
	c, err := scanCapability(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Capability{}, fmt.Errorf("capabilityRepo.GetByID: %w", domain.ErrNotFound)
	}
	if err != nil {
		return domain.Capability{}, fmt.Errorf("capabilityRepo.GetByID: %w", err)
	}
	return c, nil
}

func (r *capabilityRepo) ListByUserID(ctx context.Context, userID string) ([]domain.Capability, error) {
	const q = `
		SELECT id, user_id, name, type, description, config_schema, config, created_at, updated_at
		FROM capabilities WHERE user_id = $1 ORDER BY created_at DESC`
	rows, err := r.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, fmt.Errorf("capabilityRepo.ListByUserID: %w", err)
	}
	defer rows.Close()
	var list []domain.Capability
	for rows.Next() {
		c, err := scanCapability(rows)
		if err != nil {
			return nil, fmt.Errorf("capabilityRepo.ListByUserID scan: %w", err)
		}
		list = append(list, c)
	}
	return list, rows.Err()
}

func (r *capabilityRepo) Update(ctx context.Context, c domain.Capability) (domain.Capability, error) {
	schemaJSON, _ := json.Marshal(c.ConfigSchema)
	configJSON, _ := json.Marshal(c.Config)
	const q = `
		UPDATE capabilities
		SET name=$1, type=$2, description=$3, config_schema=$4, config=$5, updated_at=now()
		WHERE id=$6
		RETURNING id, user_id, name, type, description, config_schema, config, created_at, updated_at`
	row := r.pool.QueryRow(ctx, q, c.Name, string(c.Type), c.Description, schemaJSON, configJSON, c.ID)
	result, err := scanCapability(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Capability{}, fmt.Errorf("capabilityRepo.Update: %w", domain.ErrNotFound)
	}
	if err != nil {
		return domain.Capability{}, fmt.Errorf("capabilityRepo.Update: %w", err)
	}
	return result, nil
}

func (r *capabilityRepo) Delete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM capabilities WHERE id=$1`, id)
	if err != nil {
		return fmt.Errorf("capabilityRepo.Delete: %w", err)
	}
	return nil
}

func scanCapability(row interface{ Scan(dest ...any) error }) (domain.Capability, error) {
	var c domain.Capability
	var capType string
	var schemaJSON, configJSON []byte
	err := row.Scan(&c.ID, &c.UserID, &c.Name, &capType, &c.Description,
		&schemaJSON, &configJSON, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return domain.Capability{}, err
	}
	c.Type = domain.CapabilityType(capType)
	_ = json.Unmarshal(schemaJSON, &c.ConfigSchema)
	_ = json.Unmarshal(configJSON, &c.Config)
	return c, nil
}
