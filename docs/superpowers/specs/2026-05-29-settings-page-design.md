# Settings Page Design

**Date:** 2026-05-29
**Status:** Approved

---

## Overview

Add a `/settings` full-page route to the Forge web app. The page uses a three-column layout (app sidebar → settings nav → content area) styled with frosted-glass cards, matching the visual language seen in Linear/Multicast-style desktop apps. Settings are split into two concerns:

- **AI service config** (Base URL + API Key) — stored encrypted in the backend DB, never readable by the frontend
- **Theme color** — stored in `localStorage`, applied instantly via CSS variable mutation

---

## Layout

Three fixed columns, full viewport height:

| Column | Width | Purpose |
|--------|-------|---------|
| App sidebar | 200px | Global app nav (项目 / 对话 / 设置) |
| Settings nav | 210px | Settings category list |
| Content area | flex-1 | Active section form |

Background: dark base (`#0d0f14`) with subtle radial color gradients (orange/purple/green) to support the glass effect. All three columns use `backdrop-filter: blur(24px) saturate(180%)` with low-opacity white backgrounds and `rgba` borders.

Section cards inside the content area add an extra `inset 0 1px 0 rgba(255,255,255,0.06)` top highlight for depth.

Entry point: settings icon in the app sidebar, navigates to `/settings`.

---

## Settings Categories

### AI 服务 → API 配置

Fields:
- **Base URL** — text input, editable, placeholder `https://api.openai.com/v1`
- **API Key** — masked display (`••••••••`), shows `✓ 已配置` badge when set, field hint explains server-side encryption
- **Actions** — "重置" (clear stored key) + "保存" buttons

Behavior:
- On save: `PUT /api/v1/settings` with `{ baseUrl, apiKey }` — key encrypted server-side with AES-256 before storage
- On load: `GET /api/v1/settings` returns `{ baseUrl, hasApiKey: boolean }` — key plaintext never returned
- "重置" calls `DELETE /api/v1/settings/api-key`

### 偏好 → 外观

Fields:
- **主题色** — 4 color swatches: 橙色 `#f97316`, 蓝色 `#3b82f6`, 绿色 `#10b981`, 紫色 `#8b5cf6`

Behavior:
- On select: mutate `--primary` and `--accent` CSS variables on `:root` via JS
- Persist selection to `localStorage` key `forge-theme-color`
- On app load: `settings-store.ts` reads `localStorage` and applies the saved color before first render

---

## Frontend Architecture

### New files

| File | Purpose |
|------|---------|
| `apps/web/src/pages/SettingsPage.tsx` | Route component, three-column shell |
| `apps/web/src/store/settings-store.ts` | Zustand store: theme color (localStorage) + AI config state |
| `packages/core/settings/use-settings.ts` | React Query hooks: `useGetSettings`, `useSaveSettings`, `useResetApiKey` |
| `packages/core/settings/settings-api.ts` | API calls for settings endpoints |

### Modified files

| File | Change |
|------|--------|
| `apps/web/src/routes.tsx` | Add `/settings` protected route |
| `apps/web/src/main.tsx` | Apply saved theme color on startup |
| `apps/web/src/components/left-panel/ConversationPanel.tsx` (or equivalent sidebar) | Add settings nav link |

### Theme color application

```ts
// On select or on app load
function applyThemeColor(hex: string) {
  const hsl = hexToHsl(hex)  // helper in lib/utils.ts
  document.documentElement.style.setProperty('--primary', hsl)
  document.documentElement.style.setProperty('--accent', hsl)
  document.documentElement.style.setProperty('--ring', hsl)
}
```

The existing CSS already defines `--primary` / `--accent` / `--ring` as HSL values — mutating them covers all themed UI components with no additional changes.

---

## Backend Architecture

### New domain type

```go
// domain/settings.go
type UserSettings struct {
  UserID    string
  BaseURL   string
  HasAPIKey bool       // never return plaintext key
  CreatedAt time.Time
  UpdatedAt time.Time
}
```

### New repository interface (domain/repository.go)

```go
type SettingsRepository interface {
  Get(ctx context.Context, userID string) (UserSettings, error)
  Upsert(ctx context.Context, userID string, baseURL string, encryptedKey string) error
  DeleteAPIKey(ctx context.Context, userID string) error
}
```

### New DB table

```sql
CREATE TABLE user_settings (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  base_url    TEXT NOT NULL DEFAULT '',
  api_key_enc TEXT,          -- AES-256-GCM encrypted, null if not set
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### New API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/settings` | JWT | Returns `{ baseUrl, hasApiKey }` |
| `PUT` | `/api/v1/settings` | JWT | Upserts baseUrl + encrypted apiKey |
| `DELETE` | `/api/v1/settings/api-key` | JWT | Clears stored key |

Encryption key sourced from env var `SETTINGS_ENCRYPTION_KEY` (32-byte AES-256 key, base64-encoded). Never hardcoded.

---

## Data Flow

```
User opens /settings
  → GET /api/v1/settings (JWT)
  → { baseUrl: "...", hasApiKey: true }
  → Show masked key + "已配置" badge

User enters new key + saves
  → PUT /api/v1/settings { baseUrl, apiKey }
  → Go handler: encrypt(apiKey, SETTINGS_ENCRYPTION_KEY) → store
  → Return { baseUrl, hasApiKey: true }
  → Frontend shows success toast

User selects theme color
  → applyThemeColor("#3b82f6")
  → localStorage.setItem("forge-theme-color", "#3b82f6")
  → Instant visual update, no API call
```

---

## Error Handling

- API save failure → toast error "保存失败，请稍后重试"
- `SETTINGS_ENCRYPTION_KEY` not set → Go server startup fails fast with a clear error message
- `GET /api/v1/settings` 404 (first time) → treated as empty state, all fields blank

---

## Out of Scope

- Theme color multi-device sync (localStorage only)
- Light/dark mode toggle (CSS `.light` class exists but not wired to this feature)
- Notification settings (nav item visible but not implemented)
- Profile/avatar settings
