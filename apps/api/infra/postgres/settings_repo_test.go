package postgres_test

import (
	"context"
	"os"
	"testing"

	"github.com/forge-ai/forge/api/domain"
	"github.com/forge-ai/forge/api/infra/postgres"
)

// Integration test — requires DATABASE_URL.
func TestSettingsRepoGetNotFound(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set")
	}
	pool, err := postgres.NewPool(context.Background(), dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	repo := postgres.NewSettingsRepo(pool)
	_, err = repo.Get(context.Background(), "nonexistent-user-id")
	if err == nil {
		t.Fatal("expected error for nonexistent user")
	}
	if err != domain.ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestSettingsRepoUpsertAndGet(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set")
	}
	pool, err := postgres.NewPool(context.Background(), dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	userRepo := postgres.NewUserRepo(pool)
	user, err := userRepo.Create(context.Background(), domain.User{
		Email:    "settings-test@example.com",
		Name:     "Test",
		Password: "hashed",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	defer pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", user.ID)

	repo := postgres.NewSettingsRepo(pool)

	err = repo.Upsert(context.Background(), user.ID, "https://api.openai.com/v1", "enc-key-abc")
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}

	settings, err := repo.Get(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if settings.BaseURL != "https://api.openai.com/v1" {
		t.Errorf("BaseURL: got %q", settings.BaseURL)
	}
	if !settings.HasAPIKey {
		t.Error("expected HasAPIKey=true")
	}

	err = repo.DeleteAPIKey(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
	settings, err = repo.Get(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("get after delete: %v", err)
	}
	if settings.HasAPIKey {
		t.Error("expected HasAPIKey=false after delete")
	}
}
