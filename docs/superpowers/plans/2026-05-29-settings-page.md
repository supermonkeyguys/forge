# Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/settings` full-page route with a three-column frosted-glass layout for configuring AI API credentials (server-side encrypted) and choosing a theme color (localStorage).

**Architecture:** Backend gains a `user_settings` table, a `SettingsRepository` domain interface, a `SettingsHandler`, and three new API endpoints. Frontend gains a `settings-store.ts` (Zustand, localStorage for theme), a `use-settings.ts` hook (React Query), and a `SettingsPage.tsx` three-column component. The app sidebar gains a Settings nav link. Theme color mutation happens by rewriting CSS custom properties on `:root` at runtime.

**Tech Stack:** Go (chi router, pgx, AES-256-GCM encryption), React 18, TypeScript, Zustand, React Query (`@tanstack/react-query`), Tailwind v4, `lucide-react` icons, `backdrop-filter` CSS for glass effect.

---

## File Map

### Backend — new files
| File | Responsibility |
|------|---------------|
| `apps/api/domain/settings.go` | `UserSettings` domain type + `SettingsRepository` interface |
| `apps/api/infra/postgres/settings_repo.go` | Postgres implementation of `SettingsRepository` |
| `apps/api/pkg/crypto/aes.go` | AES-256-GCM encrypt/decrypt helpers |
| `apps/api/api/handler/settings.go` | `SettingsHandler` — GET / PUT / DELETE endpoints |
| `apps/api/migrations/002_user_settings.sql` | `user_settings` table DDL |

### Backend — modified files
| File | Change |
|------|--------|
| `apps/api/domain/repository.go` | Add `SettingsRepository` interface |
| `apps/api/api/router.go` | Add `/api/v1/settings` routes |
| `apps/api/cmd/server/main.go` | Wire `settingsRepo` + `SettingsHandler`, load `SETTINGS_ENCRYPTION_KEY` from config |

### Frontend — new files
| File | Responsibility |
|------|---------------|
| `apps/web/src/pages/SettingsPage.tsx` | Three-column page shell + routing |
| `apps/web/src/store/settings-store.ts` | Zustand store for theme color (localStorage persisted) |
| `packages/core/settings/settings-api.ts` | Raw API calls for settings endpoints |
| `packages/core/settings/use-settings.ts` | React Query hooks: `useGetSettings`, `useSaveSettings`, `useResetApiKey` |

### Frontend — modified files
| File | Change |
|------|--------|
| `apps/web/src/routes.tsx` | Add `/settings` protected route |
| `apps/web/src/main.tsx` | Apply saved theme color on startup before first render |
| `apps/web/src/lib/utils.ts` | Add `hexToHsl(hex): string` helper |
| `apps/web/src/components/ui/icons.tsx` | Add `KeyRound`, `User`, `Bell`, `LayoutGrid`, `MessageSquare` icons |
| `packages/core/index.ts` | Export settings hooks and types |

---

## Task 1: DB migration — `user_settings` table

**Files:**
- Create: `apps/api/migrations/002_user_settings.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- apps/api/migrations/002_user_settings.sql
CREATE TABLE IF NOT EXISTS user_settings (
    user_id     TEXT        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    base_url    TEXT        NOT NULL DEFAULT '',
    api_key_enc TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Run the migration**

```bash
cd apps/api
DATABASE_URL="$DATABASE_URL" go run ./cmd/migrate/main.go
```

Expected: no error output, migration applied.

- [ ] **Step 3: Verify table exists**

```bash
psql "$DATABASE_URL" -c "\d user_settings"
```

Expected: table with columns `user_id`, `base_url`, `api_key_enc`, `created_at`, `updated_at`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/migrations/002_user_settings.sql
git commit -m "feat(api): add user_settings migration"
```

---

## Task 2: AES-256-GCM crypto helper

**Files:**
- Create: `apps/api/pkg/crypto/aes.go`

- [ ] **Step 1: Write a failing test**

Create `apps/api/pkg/crypto/aes_test.go`:

```go
package crypto_test

import (
	"testing"

	"github.com/forge-ai/forge/api/pkg/crypto"
)

func TestEncryptDecryptRoundTrip(t *testing.T) {
	key := make([]byte, 32)
	for i := range key { key[i] = byte(i) }

	plaintext := "sk-test-key-abc123"
	ciphertext, err := crypto.Encrypt(plaintext, key)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	if ciphertext == plaintext {
		t.Fatal("ciphertext should not equal plaintext")
	}

	got, err := crypto.Decrypt(ciphertext, key)
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}
	if got != plaintext {
		t.Fatalf("got %q, want %q", got, plaintext)
	}
}

func TestDecryptWrongKey(t *testing.T) {
	key1 := make([]byte, 32)
	key2 := make([]byte, 32)
	for i := range key2 { key2[i] = 0xFF }

	ciphertext, _ := crypto.Encrypt("secret", key1)
	_, err := crypto.Decrypt(ciphertext, key2)
	if err == nil {
		t.Fatal("expected error decrypting with wrong key")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api
go test ./pkg/crypto/... -v
```

Expected: `FAIL — package not found` or `undefined: crypto.Encrypt`.

- [ ] **Step 3: Implement AES-256-GCM helpers**

Create `apps/api/pkg/crypto/aes.go`:

```go
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"
)

// Encrypt encrypts plaintext with AES-256-GCM. key must be 32 bytes.
// Returns base64-encoded nonce+ciphertext.
func Encrypt(plaintext string, key []byte) (string, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(sealed), nil
}

// Decrypt decrypts a base64-encoded nonce+ciphertext produced by Encrypt.
func Decrypt(encoded string, key []byte) (string, error) {
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(data) < gcm.NonceSize() {
		return "", errors.New("ciphertext too short")
	}
	nonce, ct := data[:gcm.NonceSize()], data[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api
go test ./pkg/crypto/... -v
```

Expected: `PASS` — both `TestEncryptDecryptRoundTrip` and `TestDecryptWrongKey`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/pkg/crypto/
git commit -m "feat(api): add AES-256-GCM crypto helpers"
```

---

## Task 3: Domain type + repository interface

**Files:**
- Create: `apps/api/domain/settings.go`
- Modify: `apps/api/domain/repository.go`

- [ ] **Step 1: Create the domain type**

Create `apps/api/domain/settings.go`:

```go
package domain

import "time"

// UserSettings holds per-user AI service configuration.
// HasAPIKey is a derived field — the raw key is never returned to callers.
type UserSettings struct {
	UserID    string
	BaseURL   string
	HasAPIKey bool
	CreatedAt time.Time
	UpdatedAt time.Time
}
```

- [ ] **Step 2: Add SettingsRepository to repository.go**

In `apps/api/domain/repository.go`, append after the existing interfaces:

```go
type SettingsRepository interface {
	Get(ctx context.Context, userID string) (UserSettings, error)
	// Upsert stores baseURL and the already-encrypted apiKey.
	// Pass empty string for encryptedKey to leave the existing key unchanged.
	Upsert(ctx context.Context, userID, baseURL, encryptedKey string) error
	DeleteAPIKey(ctx context.Context, userID string) error
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd apps/api
go build ./domain/...
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/domain/settings.go apps/api/domain/repository.go
git commit -m "feat(api): add UserSettings domain type and SettingsRepository interface"
```

---

## Task 4: Postgres implementation of SettingsRepository

**Files:**
- Create: `apps/api/infra/postgres/settings_repo.go`

- [ ] **Step 1: Write a failing test**

Create `apps/api/infra/postgres/settings_repo_test.go`:

```go
package postgres_test

import (
	"context"
	"os"
	"testing"

	"github.com/forge-ai/forge/api/domain"
	"github.com/forge-ai/forge/api/infra/postgres"
)

// Integration test — requires DATABASE_URL.
// Run: DATABASE_URL=... go test ./infra/postgres/... -run TestSettings -v
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

	// Create a test user first
	userRepo := postgres.NewUserRepo(pool)
	user, err := userRepo.Create(context.Background(), domain.User{
		Email: "settings-test@example.com",
		Name:  "Test",
		Password: "hashed",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	// Clean up after test
	defer pool.Exec(context.Background(), "DELETE FROM users WHERE id = $1", user.ID)

	repo := postgres.NewSettingsRepo(pool)

	// Upsert settings
	err = repo.Upsert(context.Background(), user.ID, "https://api.openai.com/v1", "enc-key-abc")
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}

	// Get should return HasAPIKey=true
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

	// DeleteAPIKey
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api
go test ./infra/postgres/... -run TestSettings -v
```

Expected: `FAIL — NewSettingsRepo undefined`.

- [ ] **Step 3: Implement the repo**

Create `apps/api/infra/postgres/settings_repo.go`:

```go
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
		// Update base_url only, leave api_key_enc unchanged
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
```

- [ ] **Step 4: Run tests (skipped without DB, or pass DATABASE_URL)**

```bash
cd apps/api
go test ./infra/postgres/... -run TestSettings -v
```

Expected: `PASS` (or `SKIP` if `DATABASE_URL` not set — that's fine).

- [ ] **Step 5: Commit**

```bash
git add apps/api/infra/postgres/settings_repo.go apps/api/infra/postgres/settings_repo_test.go
git commit -m "feat(api): implement SettingsRepository in postgres"
```

---

## Task 5: SettingsHandler (HTTP layer)

**Files:**
- Create: `apps/api/api/handler/settings.go`

- [ ] **Step 1: Write a failing handler test**

Create `apps/api/api/handler/settings_test.go`:

```go
package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/forge-ai/forge/api/api/handler"
	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

// stubSettingsRepo is an in-memory implementation for tests.
type stubSettingsRepo struct {
	settings map[string]*settingsRow
}

type settingsRow struct {
	baseURL      string
	encryptedKey string
}

func newStubSettingsRepo() *stubSettingsRepo {
	return &stubSettingsRepo{settings: map[string]*settingsRow{}}
}

func (r *stubSettingsRepo) Get(ctx context.Context, userID string) (domain.UserSettings, error) {
	row, ok := r.settings[userID]
	if !ok {
		return domain.UserSettings{}, domain.ErrNotFound
	}
	return domain.UserSettings{
		UserID:    userID,
		BaseURL:   row.baseURL,
		HasAPIKey: row.encryptedKey != "",
	}, nil
}

func (r *stubSettingsRepo) Upsert(ctx context.Context, userID, baseURL, encryptedKey string) error {
	if _, ok := r.settings[userID]; !ok {
		r.settings[userID] = &settingsRow{}
	}
	r.settings[userID].baseURL = baseURL
	if encryptedKey != "" {
		r.settings[userID].encryptedKey = encryptedKey
	}
	return nil
}

func (r *stubSettingsRepo) DeleteAPIKey(ctx context.Context, userID string) error {
	if row, ok := r.settings[userID]; ok {
		row.encryptedKey = ""
	}
	return nil
}

func requestWithUser(method, path string, body any, userID string) *http.Request {
	var buf bytes.Buffer
	if body != nil {
		json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	ctx := middleware.WithUserID(req.Context(), userID)
	return req.WithContext(ctx)
}

func TestSettingsGet_NotFound_ReturnsEmpty(t *testing.T) {
	encKey := make([]byte, 32)
	h := handler.NewSettingsHandler(newStubSettingsRepo(), encKey)

	req := requestWithUser("GET", "/api/v1/settings", nil, "user-1")
	w := httptest.NewRecorder()
	h.Get(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status: got %d, want 200", w.Code)
	}
	var resp struct {
		Data struct {
			BaseURL   string `json:"baseUrl"`
			HasAPIKey bool   `json:"hasApiKey"`
		} `json:"data"`
	}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.Data.HasAPIKey {
		t.Error("expected hasApiKey=false for new user")
	}
}

func TestSettingsSave_EncryptsKey(t *testing.T) {
	encKey := make([]byte, 32)
	repo := newStubSettingsRepo()
	h := handler.NewSettingsHandler(repo, encKey)

	body := map[string]string{"baseUrl": "https://api.openai.com/v1", "apiKey": "sk-test"}
	req := requestWithUser("PUT", "/api/v1/settings", body, "user-1")
	w := httptest.NewRecorder()
	h.Save(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status: got %d, want 200", w.Code)
	}
	// Key should be stored encrypted, not plaintext
	if repo.settings["user-1"].encryptedKey == "sk-test" {
		t.Error("key should be encrypted, not stored as plaintext")
	}
	if repo.settings["user-1"].encryptedKey == "" {
		t.Error("encrypted key should not be empty")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api
go test ./api/handler/... -run TestSettings -v
```

Expected: `FAIL — NewSettingsHandler undefined`.

- [ ] **Step 3: Check that `middleware.WithUserID` exists**

```bash
grep -n "WithUserID\|UserIDFromContext" apps/api/api/middleware/*.go
```

If `WithUserID` doesn't exist (only `UserIDFromContext`), add it to the auth middleware file:

```go
// WithUserID injects a userID into the context (used in tests).
func WithUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, userIDKey{}, userID)
}
```

- [ ] **Step 4: Implement SettingsHandler**

Create `apps/api/api/handler/settings.go`:

```go
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
	"github.com/forge-ai/forge/api/pkg/crypto"
)

type SettingsHandler struct {
	repo   domain.SettingsRepository
	encKey []byte // 32-byte AES-256 key
}

func NewSettingsHandler(repo domain.SettingsRepository, encKey []byte) *SettingsHandler {
	return &SettingsHandler{repo: repo, encKey: encKey}
}

// GET /api/v1/settings
func (h *SettingsHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	settings, err := h.repo.Get(r.Context(), userID)
	if err == domain.ErrNotFound {
		// Return empty settings for new users
		middleware.WriteJSON(w, http.StatusOK, map[string]any{
			"baseUrl":   "",
			"hasApiKey": false,
		})
		return
	}
	if err != nil {
		middleware.WriteError(w, err)
		return
	}

	middleware.WriteJSON(w, http.StatusOK, map[string]any{
		"baseUrl":   settings.BaseURL,
		"hasApiKey": settings.HasAPIKey,
	})
}

// PUT /api/v1/settings
func (h *SettingsHandler) Save(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var body struct {
		BaseURL string `json:"baseUrl"`
		APIKey  string `json:"apiKey"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}

	var encryptedKey string
	if body.APIKey != "" {
		var err error
		encryptedKey, err = crypto.Encrypt(body.APIKey, h.encKey)
		if err != nil {
			middleware.WriteError(w, err)
			return
		}
	}

	if err := h.repo.Upsert(r.Context(), userID, body.BaseURL, encryptedKey); err != nil {
		middleware.WriteError(w, err)
		return
	}

	middleware.WriteJSON(w, http.StatusOK, map[string]any{
		"baseUrl":   body.BaseURL,
		"hasApiKey": body.APIKey != "" || encryptedKey != "",
	})
}

// DELETE /api/v1/settings/api-key
func (h *SettingsHandler) DeleteAPIKey(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	if err := h.repo.DeleteAPIKey(r.Context(), userID); err != nil {
		middleware.WriteError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/api
go test ./api/handler/... -run TestSettings -v
```

Expected: `PASS`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/api/handler/settings.go apps/api/api/handler/settings_test.go
git commit -m "feat(api): add SettingsHandler with AES-256 key encryption"
```

---

## Task 6: Wire settings into router + server

**Files:**
- Modify: `apps/api/api/router.go`
- Modify: `apps/api/cmd/server/main.go`

- [ ] **Step 1: Add Settings to RouterDeps and wire routes**

In `apps/api/api/router.go`, add to `RouterDeps`:

```go
Settings          *handler.SettingsHandler
```

Then inside the protected `r.Route("/api/v1", ...)` block, add after the projects routes:

```go
// Settings
r.Route("/settings", func(r chi.Router) {
    r.Get("/", deps.Settings.Get)
    r.Put("/", deps.Settings.Save)
    r.Delete("/api-key", deps.Settings.DeleteAPIKey)
})
```

- [ ] **Step 2: Add SETTINGS_ENCRYPTION_KEY to server config**

In `apps/api/cmd/server/main.go`, update the `config` struct:

```go
type config struct {
	Port                  string
	DatabaseURL           string
	AgentServiceURL       string
	JWTSecret             string
	InternalToken         string
	SettingsEncryptionKey []byte // 32 bytes, base64-decoded
}
```

Update `loadConfig()` — add after `jwtSecret` validation:

```go
import "encoding/base64"

encKeyB64 := os.Getenv("SETTINGS_ENCRYPTION_KEY")
if encKeyB64 == "" {
    return config{}, errors.New("SETTINGS_ENCRYPTION_KEY environment variable is required")
}
encKey, err := base64.StdEncoding.DecodeString(encKeyB64)
if err != nil || len(encKey) != 32 {
    return config{}, errors.New("SETTINGS_ENCRYPTION_KEY must be a base64-encoded 32-byte key")
}
```

And set it in the returned struct:

```go
SettingsEncryptionKey: encKey,
```

- [ ] **Step 3: Build and wire the handler in main**

In `apps/api/cmd/server/main.go`, after existing repo initializations:

```go
settingsRepo := postgres.NewSettingsRepo(pool)
settingsHandler := handler.NewSettingsHandler(settingsRepo, cfg.SettingsEncryptionKey)
```

Add to `RouterDeps{}`:

```go
Settings: settingsHandler,
```

- [ ] **Step 4: Generate a test encryption key and verify the server starts**

```bash
# Generate a 32-byte base64 key for local dev
openssl rand -base64 32
```

Add it to your local `.env` file:

```
SETTINGS_ENCRYPTION_KEY=<output from above>
```

Then build to confirm no compile errors:

```bash
cd apps/api
go build ./...
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/api/router.go apps/api/cmd/server/main.go
git commit -m "feat(api): wire settings routes into router and server"
```

---

## Task 7: Frontend — `hexToHsl` utility + new icons

**Files:**
- Modify: `apps/web/src/lib/utils.ts`
- Modify: `apps/web/src/components/ui/icons.tsx`

- [ ] **Step 1: Add `hexToHsl` to utils.ts**

In `apps/web/src/lib/utils.ts`, append:

```ts
/**
 * Converts a hex color (#rrggbb) to the HSL string format used by CSS custom
 * properties in global.css — e.g. "25 90% 48%"  (no "hsl()" wrapper).
 */
export function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}
```

- [ ] **Step 2: Add missing icons to icons.tsx**

The existing `Icons` export is missing `KeyRound`, `User`, `Bell`, `LayoutGrid`, and `MessageSquare`. Add these functions before the `export const Icons = {` line:

```tsx
function KeyRound(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="M21 2l-9.6 9.6" />
      <path d="M15.5 7.5l3 3" />
    </Icon>
  )
}

function User(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Icon>
  )
}

function Bell(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Icon>
  )
}

function LayoutGrid(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </Icon>
  )
}

function MessageSquare(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Icon>
  )
}
```

Then add the new icons to the `Icons` export object:

```ts
export const Icons = {
  // ... existing entries ...
  KeyRound,
  User,
  Bell,
  LayoutGrid,
  MessageSquare,
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd apps/web
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/utils.ts apps/web/src/components/ui/icons.tsx
git commit -m "feat(web): add hexToHsl utility and settings-related icons"
```

---

## Task 8: Frontend — settings store (theme color)

**Files:**
- Create: `apps/web/src/store/settings-store.ts`

- [ ] **Step 1: Write a failing test**

Create `apps/web/src/store/settings-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useSettingsStore } from './settings-store'
import { hexToHsl } from '../lib/utils'

describe('settings-store', () => {
  beforeEach(() => {
    useSettingsStore.setState({ themeColor: '#f97316' })
    document.documentElement.style.removeProperty('--primary')
    document.documentElement.style.removeProperty('--accent')
    document.documentElement.style.removeProperty('--ring')
    localStorage.clear()
  })

  it('setThemeColor updates store and CSS variables', () => {
    const { setThemeColor } = useSettingsStore.getState()
    setThemeColor('#3b82f6')

    expect(useSettingsStore.getState().themeColor).toBe('#3b82f6')

    const expected = hexToHsl('#3b82f6')
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe(expected)
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(expected)
    expect(document.documentElement.style.getPropertyValue('--ring')).toBe(expected)
  })

  it('persists themeColor to localStorage', () => {
    const { setThemeColor } = useSettingsStore.getState()
    setThemeColor('#10b981')
    expect(localStorage.getItem('forge-settings')).toContain('#10b981')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web
npx vitest run src/store/settings-store.test.ts
```

Expected: `FAIL — Cannot find module './settings-store'`.

- [ ] **Step 3: Implement the store**

Create `apps/web/src/store/settings-store.ts`:

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { hexToHsl } from '../lib/utils'

const THEME_PRESETS = [
  { label: '橙色', hex: '#f97316' },
  { label: '蓝色', hex: '#3b82f6' },
  { label: '绿色', hex: '#10b981' },
  { label: '紫色', hex: '#8b5cf6' },
] as const

export type ThemeColor = (typeof THEME_PRESETS)[number]['hex']

interface SettingsState {
  themeColor: string
  setThemeColor: (hex: string) => void
}

function applyThemeColor(hex: string) {
  const hsl = hexToHsl(hex)
  document.documentElement.style.setProperty('--primary', hsl)
  document.documentElement.style.setProperty('--accent', hsl)
  document.documentElement.style.setProperty('--ring', hsl)
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themeColor: '#f97316',
      setThemeColor: (hex: string) => {
        applyThemeColor(hex)
        set({ themeColor: hex })
      },
    }),
    {
      name: 'forge-settings',
      partialize: (s) => ({ themeColor: s.themeColor }),
    },
  ),
)

export { THEME_PRESETS, applyThemeColor }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/web
npx vitest run src/store/settings-store.test.ts
```

Expected: `PASS`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/store/settings-store.ts apps/web/src/store/settings-store.test.ts
git commit -m "feat(web): add settings store with theme color persistence"
```

---

## Task 9: Frontend — settings API + React Query hooks

**Files:**
- Create: `packages/core/settings/settings-api.ts`
- Create: `packages/core/settings/use-settings.ts`
- Modify: `packages/core/index.ts`

- [ ] **Step 1: Create the API client**

Create `packages/core/settings/settings-api.ts`:

```ts
import { api } from '../api/client.ts'

export interface SettingsResponse {
  baseUrl: string
  hasApiKey: boolean
}

export const settingsApi = {
  get(token: string) {
    return api.get<SettingsResponse>('/api/v1/settings', token)
  },
  save(token: string, baseUrl: string, apiKey: string) {
    return api.put<SettingsResponse>('/api/v1/settings', { baseUrl, apiKey }, token)
  },
  deleteApiKey(token: string) {
    return api.delete('/api/v1/settings/api-key', token)
  },
}
```

- [ ] **Step 2: Create the React Query hooks**

Create `packages/core/settings/use-settings.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore, selectToken } from '../auth/auth-store.ts'
import { settingsApi } from './settings-api.ts'

const SETTINGS_KEY = ['settings'] as const

export function useGetSettings() {
  const token = useAuthStore(selectToken)
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => settingsApi.get(token!).then((r) => r.data),
    enabled: !!token,
  })
}

export function useSaveSettings() {
  const token = useAuthStore(selectToken)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ baseUrl, apiKey }: { baseUrl: string; apiKey: string }) =>
      settingsApi.save(token!, baseUrl, apiKey).then((r) => r.data),
    onSuccess: (data) => {
      queryClient.setQueryData(SETTINGS_KEY, data)
    },
  })
}

export function useResetApiKey() {
  const token = useAuthStore(selectToken)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => settingsApi.deleteApiKey(token!),
    onSuccess: () => {
      queryClient.setQueryData(SETTINGS_KEY, (old: any) =>
        old ? { ...old, hasApiKey: false } : old,
      )
    },
  })
}
```

- [ ] **Step 3: Export from core/index.ts**

In `packages/core/index.ts`, append:

```ts
// Settings
export { useGetSettings, useSaveSettings, useResetApiKey } from './settings/use-settings.ts'
export type { SettingsResponse } from './settings/settings-api.ts'
```

- [ ] **Step 4: Verify it compiles**

```bash
cd apps/web
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/core/settings/ packages/core/index.ts
git commit -m "feat(core): add settings API client and React Query hooks"
```

---

## Task 10: Frontend — SettingsPage component

**Files:**
- Create: `apps/web/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Create the page**

Create `apps/web/src/pages/SettingsPage.tsx`:

```tsx
import { useState } from 'react'
import { useGetSettings, useSaveSettings, useResetApiKey } from '@forge/core'
import { useSettingsStore, THEME_PRESETS, applyThemeColor } from '../store/settings-store'
import { Icons } from '../components/ui/icons'
import { toast } from '../store/toast-store'
import { cn } from '../lib/utils'

type SettingsSection = 'api' | 'appearance'

export function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('api')

  return (
    <div className="flex h-screen bg-background">
      {/* Col 1: App sidebar */}
      <AppSidebar />
      {/* Col 2: Settings nav */}
      <SettingsNav active={activeSection} onSelect={setActiveSection} />
      {/* Col 3: Content */}
      <div className="flex-1 overflow-y-auto p-10">
        {activeSection === 'api' && <APIConfigSection />}
        {activeSection === 'appearance' && <AppearanceSection />}
      </div>
    </div>
  )
}

function AppSidebar() {
  return (
    <nav
      className="w-[200px] flex-shrink-0 border-r border-white/[0.06] bg-white/[0.025]"
      style={{ backdropFilter: 'blur(24px) saturate(160%)' }}
    >
      <div className="p-3 pt-4">
        <p className="mb-1 px-2 text-[10.5px] font-semibold uppercase tracking-widest text-white/25">
          工作区
        </p>
        <SidebarItem icon={<Icons.LayoutGrid className="h-3.5 w-3.5" />} label="项目" href="/projects" />
        <SidebarItem icon={<Icons.MessageSquare className="h-3.5 w-3.5" />} label="对话" href="#" />
        <p className="mb-1 mt-3 px-2 text-[10.5px] font-semibold uppercase tracking-widest text-white/25">
          配置
        </p>
        <SidebarItem icon={<Icons.Cog className="h-3.5 w-3.5" />} label="设置" href="/settings" active />
      </div>
    </nav>
  )
}

function SidebarItem({
  icon, label, href, active,
}: {
  icon: React.ReactNode; label: string; href: string; active?: boolean
}) {
  return (
    <a
      href={href}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors',
        active
          ? 'bg-primary/10 text-foreground'
          : 'text-white/45 hover:bg-white/[0.06] hover:text-white/75',
      )}
    >
      <span className={cn('opacity-55', active && 'opacity-100')}>{icon}</span>
      {label}
    </a>
  )
}

function SettingsNav({
  active, onSelect,
}: {
  active: SettingsSection; onSelect: (s: SettingsSection) => void
}) {
  return (
    <nav
      className="w-[210px] flex-shrink-0 border-r border-white/[0.06] bg-white/[0.03] py-5"
      style={{ backdropFilter: 'blur(24px) saturate(160%)' }}
    >
      <h2 className="mb-4 px-4 text-[15px] font-semibold text-white/85">设置</h2>

      <NavGroup label="AI 服务">
        <NavItem
          icon={<Icons.KeyRound className="h-3.5 w-3.5" />}
          label="API 配置"
          active={active === 'api'}
          onClick={() => onSelect('api')}
        />
      </NavGroup>

      <NavGroup label="偏好">
        <NavItem
          icon={<Icons.Palette className="h-3.5 w-3.5" />}
          label="外观"
          active={active === 'appearance'}
          onClick={() => onSelect('appearance')}
        />
        <NavItem
          icon={<Icons.Bell className="h-3.5 w-3.5" />}
          label="通知"
          active={false}
          onClick={() => {}}
          disabled
        />
      </NavGroup>
    </nav>
  )
}

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <p className="mb-1 px-4 text-[10.5px] font-semibold uppercase tracking-widest text-white/25">
        {label}
      </p>
      {children}
    </div>
  )
}

function NavItem({
  icon, label, active, onClick, disabled,
}: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2 rounded-md mx-1.5 px-2.5 py-1.5 text-[13px] transition-colors',
        active
          ? 'bg-primary/13 text-white/92'
          : 'text-white/45 hover:bg-white/[0.06] hover:text-white/75',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      <span className={cn('opacity-55', active && 'opacity-100')}>{icon}</span>
      {label}
    </button>
  )
}

function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-white/[0.08] p-6',
        'shadow-[0_4px_24px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.06)]',
        className,
      )}
      style={{
        background: 'rgba(255,255,255,0.045)',
        backdropFilter: 'blur(24px) saturate(180%)',
      }}
    >
      {children}
    </div>
  )
}

function APIConfigSection() {
  const { data, isLoading } = useGetSettings()
  const { mutate: save, isPending: isSaving } = useSaveSettings()
  const { mutate: resetKey, isPending: isResetting } = useResetApiKey()

  const [baseUrl, setBaseUrl] = useState(data?.baseUrl ?? '')
  const [apiKey, setApiKey] = useState('')

  // Sync baseUrl from server on load
  if (!isLoading && data?.baseUrl && baseUrl === '') {
    setBaseUrl(data.baseUrl)
  }

  const handleSave = () => {
    save(
      { baseUrl, apiKey },
      {
        onSuccess: () => toast.success('配置已保存'),
        onError: () => toast.error('保存失败，请稍后重试'),
      },
    )
    setApiKey('') // clear field after save
  }

  const handleReset = () => {
    resetKey(undefined, {
      onSuccess: () => toast.success('API Key 已清除'),
      onError: () => toast.error('操作失败'),
    })
  }

  return (
    <div className="max-w-[640px]">
      <h1 className="mb-5 text-[17px] font-semibold text-white/88">API 配置</h1>
      <GlassCard>
        <div className="mb-4">
          <label className="mb-1.5 block text-[11.5px] font-medium text-white/40">Base URL</label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="w-full rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 font-mono text-[13px] text-white/65 outline-none focus:border-primary/50"
          />
        </div>

        <div className="mb-1">
          <label className="mb-1.5 block text-[11.5px] font-medium text-white/40">API Key</label>
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={data?.hasApiKey ? '输入新 Key 以覆盖' : 'sk-...'}
              className="flex-1 rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 font-mono text-[13px] text-white/65 outline-none focus:border-primary/50"
            />
            {data?.hasApiKey && (
              <span className="flex items-center gap-1 rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-400 whitespace-nowrap">
                <Icons.Check className="h-3 w-3" />
                已配置
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[11.5px] text-white/25">
            Key 加密存储于服务器，前端不可读取。如需更换请直接填入新值覆盖。
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-white/[0.05] pt-5">
          {data?.hasApiKey && (
            <button
              onClick={handleReset}
              disabled={isResetting}
              className="rounded-lg border border-white/10 bg-white/[0.06] px-4 py-2 text-[13px] text-white/50 transition-colors hover:text-white/75 disabled:opacity-40"
            >
              重置
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground shadow-[0_2px_12px] shadow-primary/35 transition-opacity disabled:opacity-40"
          >
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </GlassCard>
    </div>
  )
}

function AppearanceSection() {
  const { themeColor, setThemeColor } = useSettingsStore()

  return (
    <div className="max-w-[640px]">
      <h1 className="mb-5 text-[17px] font-semibold text-white/88">外观</h1>
      <GlassCard>
        <p className="mb-3 text-[11.5px] font-medium text-white/40">主题色</p>
        <div className="flex gap-5">
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset.hex}
              onClick={() => setThemeColor(preset.hex)}
              className="flex flex-col items-center gap-2"
              title={preset.label}
            >
              <span
                className={cn(
                  'h-8 w-8 rounded-full transition-transform hover:scale-110',
                  themeColor === preset.hex &&
                    'ring-2 ring-white/60 ring-offset-2 ring-offset-background',
                )}
                style={{ background: preset.hex }}
              />
              <span className="text-[11px] text-white/30">{preset.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-4 text-[11.5px] text-white/25">
          选择后立即生效，通过修改 CSS 变量 <code className="text-white/40">--primary</code> 应用到全站，刷新保留。
        </p>
      </GlassCard>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/web
npx tsc --noEmit
```

Fix any type errors before proceeding.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/SettingsPage.tsx
git commit -m "feat(web): add SettingsPage with three-column glass layout"
```

---

## Task 11: Wire route + apply theme on startup

**Files:**
- Modify: `apps/web/src/routes.tsx`
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 1: Add /settings route**

In `apps/web/src/routes.tsx`, add the import and route:

```tsx
import { SettingsPage } from './pages/SettingsPage'
```

Inside `<Route element={<ProtectedRoute />}>`, add:

```tsx
<Route path="/settings" element={<SettingsPage />} />
```

- [ ] **Step 2: Apply saved theme on startup**

In `apps/web/src/main.tsx`, before the `createRoot` call, add:

```tsx
import { applyThemeColor } from './store/settings-store'

// Apply persisted theme color before first render to avoid flash
const saved = JSON.parse(localStorage.getItem('forge-settings') ?? '{}')
if (saved?.state?.themeColor) {
  applyThemeColor(saved.state.themeColor)
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd apps/web
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes.tsx apps/web/src/main.tsx
git commit -m "feat(web): add /settings route and apply saved theme on startup"
```

---

## Task 12: Add settings link to app sidebar / nav

The app currently doesn't have a persistent sidebar with a settings link. The settings icon needs to be reachable from any page.

**Files:**
- Check current nav in `apps/web/src/pages/ProjectsPage.tsx` and `apps/web/src/pages/WorkspacePage.tsx`; find where the top nav bar is rendered and add a settings link there.

- [ ] **Step 1: Find the nav bar component**

```bash
grep -rn "navbar\|nav.*bar\|PageShell\|top.*nav" apps/web/src --include="*.tsx" -i | head -20
```

- [ ] **Step 2: Add settings link to the top-right area of PageShell or equivalent**

In whichever component renders the top nav bar, add a link to `/settings`:

```tsx
import { Link } from 'react-router-dom'
import { Icons } from '../ui/icons'

// In the top-right nav area:
<Link
  to="/settings"
  className="rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground"
  title="设置"
>
  <Icons.Cog className="h-4 w-4" />
</Link>
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd apps/web
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/
git commit -m "feat(web): add settings icon link to nav bar"
```

---

## Task 13: Manual smoke test

- [ ] **Step 1: Start the backend**

```bash
cd apps/api
SETTINGS_ENCRYPTION_KEY=$(openssl rand -base64 32) DATABASE_URL="..." JWT_SECRET="..." go run ./cmd/server/main.go
```

- [ ] **Step 2: Start the frontend**

```bash
cd apps/web
npm run dev
```

- [ ] **Step 3: Verify API config flow**

1. Navigate to `http://localhost:5173/settings`
2. Confirm three-column layout renders with glass card effect
3. Enter a Base URL and API Key, click **保存**
4. Confirm success toast appears
5. Reload the page — Base URL should persist, API Key shows "已配置" badge
6. Click **重置** — "已配置" badge disappears

- [ ] **Step 4: Verify theme color flow**

1. Click **外观** in settings nav
2. Click a different color swatch
3. Confirm the primary color changes across the UI immediately
4. Reload — color persists

- [ ] **Step 5: Commit any fixes found during smoke test**

```bash
git add -p
git commit -m "fix(web): smoke test fixes for settings page"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|-----------------|------|
| `/settings` full-page route | Task 10, 11 |
| Three-column glass layout | Task 10 |
| AI Base URL + API Key config | Task 5, 9, 10 |
| Server-side AES-256 encryption | Task 2, 5 |
| Key never returned to frontend | Task 5 (`hasApiKey` flag only) |
| Theme color presets (4 colors) | Task 8, 10 |
| Theme via CSS variable mutation | Task 7, 8 |
| Theme persisted to localStorage | Task 8 |
| Theme applied on startup | Task 11 |
| All icons use SVG (no emoji) | Task 7 |
| `PUT /api/v1/settings` endpoint | Task 5, 6 |
| `GET /api/v1/settings` endpoint | Task 5, 6 |
| `DELETE /api/v1/settings/api-key` | Task 5, 6 |
| DB migration | Task 1 |
| Settings nav link from other pages | Task 12 |

All spec sections are covered. ✓
