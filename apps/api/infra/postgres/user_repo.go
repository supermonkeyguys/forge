package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/forge-ai/forge/api/domain"
)

type userRepo struct {
	pool *pgxpool.Pool
}

func NewUserRepo(pool *pgxpool.Pool) domain.UserRepository {
	return &userRepo{pool: pool}
}

func (r *userRepo) Create(ctx context.Context, u domain.User) (domain.User, error) {
	const q = `
		INSERT INTO users (id, email, name, password, created_at)
		VALUES (gen_random_uuid()::text, $1, $2, $3, now())
		RETURNING id, email, name, password, created_at`

	row := r.pool.QueryRow(ctx, q, u.Email, u.Name, u.Password)
	result, err := scanUser(row)
	if err != nil {
		if isUniqueViolation(err) {
			return domain.User{}, fmt.Errorf("userRepo.Create: %w", domain.ErrAlreadyExists)
		}
		return domain.User{}, fmt.Errorf("userRepo.Create: %w", err)
	}
	return result, nil
}

func (r *userRepo) GetByID(ctx context.Context, id string) (domain.User, error) {
	const q = `SELECT id, email, name, password, created_at FROM users WHERE id = $1`

	row := r.pool.QueryRow(ctx, q, id)
	u, err := scanUser(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, fmt.Errorf("userRepo.GetByID: %w", domain.ErrNotFound)
	}
	return u, err
}

func (r *userRepo) GetByEmail(ctx context.Context, email string) (domain.User, error) {
	const q = `SELECT id, email, name, password, created_at FROM users WHERE email = $1`

	row := r.pool.QueryRow(ctx, q, email)
	u, err := scanUser(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, fmt.Errorf("userRepo.GetByEmail: %w", domain.ErrNotFound)
	}
	return u, err
}

func scanUser(row interface {
	Scan(dest ...any) error
}) (domain.User, error) {
	var u domain.User
	err := row.Scan(&u.ID, &u.Email, &u.Name, &u.Password, &u.CreatedAt)
	if err != nil {
		return domain.User{}, err
	}
	return u, nil
}
