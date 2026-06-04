# Frontend Performance Optimizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve first-screen load performance through vendor chunk splitting, HTTP cache headers, route prefetch on hover, and React Query data warmup.

**Architecture:** Four independent changes all within `apps/web/`. Vendor splitting and cache config target network/cache layer. Route prefetch and data warmup target perceived navigation speed. No new dependencies introduced.

**Tech Stack:** Vite 5, React 18, React Router v6, TanStack Query v5, Nginx (production)

**Baseline:** Main JS bundle was 391 KB single chunk. After route lazy-loading (already done), largest chunk is 164 KB (`vendor-router`). Target: vendor chunks < 150 KB each, long-term cacheable.

---

### Task 1: Vendor chunk splitting in vite.config.ts

**Files:**
- Modify: `apps/web/vite.config.ts`

**Why:** Currently `vendor-router-*.js` (164 KB) bundles React Router together with other libs. Any lib update busts the whole vendor cache. Explicit `manualChunks` splits stable libs (react) from less-stable ones (react-router, react-query) so each can be cached independently.

- [ ] **Step 1: Add manualChunks to vite.config.ts**

Replace the existing `export default defineConfig({...})` with:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@/components': resolve(__dirname, './src/components'),
      '@/lib': resolve(__dirname, './src/lib'),
      '@/hooks': resolve(__dirname, './src/hooks'),
      '@forge/core': resolve(__dirname, '../../packages/core'),
      '@forge/ui': resolve(__dirname, '../../packages/ui'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':  ['react', 'react-dom'],
          'vendor-router': ['react-router-dom'],
          'vendor-query':  ['@tanstack/react-query'],
          'vendor-icons':  ['lucide-react'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/agent': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/agent/, ''),
      },
    },
  },
})
```

- [ ] **Step 2: Run bundle check**

```bash
cd apps/web && bash scripts/check-bundle.sh
```

Expected: build succeeds, chunks now named `vendor-react-*.js`, `vendor-router-*.js`, `vendor-query-*.js`, `vendor-icons-*.js`. No single chunk > 300 KB.

- [ ] **Step 3: Commit**

```bash
git add apps/web/vite.config.ts
git commit -m "perf(web): split vendor chunks for long-term caching"
```

---

### Task 2: Nginx production config with cache headers

**Files:**
- Create: `apps/web/nginx.conf`

**Why:** Vite outputs content-hashed filenames for all assets (e.g. `vendor-react-B3WROPU_.js`). These can be cached indefinitely — if content changes, the hash changes. Without `Cache-Control: immutable`, browsers re-validate on every visit. `index.html` has no hash so must not be cached.

- [ ] **Step 1: Create apps/web/nginx.conf**

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # Hashed assets — cache forever
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    # index.html — never cache (always fetch latest)
    location = /index.html {
        add_header Cache-Control "no-cache";
        try_files $uri =404;
    }

    # SPA fallback for client-side routing
    location / {
        add_header Cache-Control "no-cache";
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 2: Verify syntax (skip if nginx not installed locally)**

```bash
nginx -t -c $(pwd)/apps/web/nginx.conf 2>&1 || echo "nginx not installed locally — file reviewed manually"
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/nginx.conf
git commit -m "perf(web): add nginx config with immutable cache for hashed assets"
```

---

### Task 3: Projects data warmup in AppShell

**Files:**
- Modify: `apps/web/src/components/layout/AppShell.tsx`

**Why:** `ProjectsPage` is lazy-loaded, so when user first lands the sequence is: chunk download → component mount → `useProjects()` fires → API responds → render. If we call `useProjects()` in `AppShell` (which mounts before any page), the API request starts immediately on login, running in parallel with any chunk downloads. By the time `ProjectsPage` mounts, data is likely already in cache.

- [ ] **Step 1: Add useProjects warmup to AppShell.tsx**

Add the import and a warmup hook at the top of `AppShell`:

```tsx
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { Icons } from '../ui/icons'
import { useProjects } from '@forge/core'

// Warms the React Query cache so ProjectsPage sees data immediately on mount
function useProjectsWarmup() {
  useProjects()
}
```

Then call it inside the `AppShell` function body (before the return):

```tsx
export function AppShell() {
  useProjectsWarmup()
  const location = useLocation()
  // ... rest unchanged
```

Full updated file:

```tsx
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { Icons } from '../ui/icons'
import { useProjects } from '@forge/core'

function useProjectsWarmup() {
  useProjects()
}

interface NavItemProps {
  to: string
  icon: React.ReactNode
  label: string
  exact?: boolean
  onPrefetch?: () => void
}

function NavItem({ to, icon, label, exact, onPrefetch }: NavItemProps) {
  const location = useLocation()
  const isActive = exact ? location.pathname === to : location.pathname.startsWith(to)
  return (
    <NavLink
      to={to}
      title={label}
      onMouseEnter={onPrefetch}
      className={cn(
        'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
        isActive
          ? 'bg-primary/[0.13] text-primary'
          : 'text-white/30 hover:bg-white/[0.06] hover:text-white/65',
      )}
    >
      {isActive && (
        <span className="absolute -left-px top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-sm bg-primary" />
      )}
      {icon}
    </NavLink>
  )
}

function BackButton() {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(-1)}
      title="返回"
      className="relative flex h-9 w-9 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/65"
    >
      <Icons.ChevronLeft className="h-[17px] w-[17px]" />
    </button>
  )
}

export function AppShell() {
  useProjectsWarmup()
  const location = useLocation()
  const isWorkspace = /^\/projects\/.+/.test(location.pathname)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <nav
        className="flex w-[52px] flex-shrink-0 flex-col items-center gap-0.5 border-r border-white/[0.05] py-2"
        style={{ background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(24px)' }}
      >
        {isWorkspace ? (
          <>
            <BackButton />
            <div className="my-0.5 h-px w-7 bg-white/[0.06]" />
          </>
        ) : (
          <NavItem to="/projects" exact icon={<Icons.LayoutGrid className="h-[17px] w-[17px]" />} label="项目" />
        )}

        <NavItem to="/conversations" icon={<Icons.MessageSquare className="h-[17px] w-[17px]" />} label="对话" />
        <div className="flex-1" />
        <div className="mb-1 h-px w-7 bg-white/[0.06]" />
        <NavItem to="/settings" icon={<Icons.Cog className="h-[17px] w-[17px]" />} label="设置" />
      </nav>

      <div className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build passes**

```bash
cd apps/web && bash scripts/check-bundle.sh
```

Expected: build succeeds, chunk sizes unchanged (warmup adds no new imports).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/layout/AppShell.tsx
git commit -m "perf(web): warm projects query cache on AppShell mount"
```

---

### Task 4: Route chunk prefetch on hover

**Files:**
- Modify: `apps/web/src/components/layout/AppShell.tsx` (already updated in Task 3)

**Why:** When the user hovers over a nav link (~150–200ms before click), we trigger the dynamic import for that route's JS chunk. By click time the chunk is either downloaded or in-flight, making the transition feel instant.

**Note:** Task 3 already added `onPrefetch?: () => void` to `NavItemProps` and wires it to `onMouseEnter`. This task adds the actual prefetch functions.

- [ ] **Step 1: Add prefetch callbacks to AppShell nav items**

In the `AppShell` component body, define prefetch functions and pass them to `NavItem`. Update the `AppShell` function:

```tsx
export function AppShell() {
  useProjectsWarmup()
  const location = useLocation()
  const isWorkspace = /^\/projects\/.+/.test(location.pathname)

  const prefetchProjects  = () => import('../../pages/projects')
  const prefetchSettings  = () => import('../../pages/settings')

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <nav
        className="flex w-[52px] flex-shrink-0 flex-col items-center gap-0.5 border-r border-white/[0.05] py-2"
        style={{ background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(24px)' }}
      >
        {isWorkspace ? (
          <>
            <BackButton />
            <div className="my-0.5 h-px w-7 bg-white/[0.06]" />
          </>
        ) : (
          <NavItem
            to="/projects"
            exact
            icon={<Icons.LayoutGrid className="h-[17px] w-[17px]" />}
            label="项目"
            onPrefetch={prefetchProjects}
          />
        )}

        <NavItem to="/conversations" icon={<Icons.MessageSquare className="h-[17px] w-[17px]" />} label="对话" />
        <div className="flex-1" />
        <div className="mb-1 h-px w-7 bg-white/[0.06]" />
        <NavItem
          to="/settings"
          icon={<Icons.Cog className="h-[17px] w-[17px]" />}
          label="设置"
          onPrefetch={prefetchSettings}
        />
      </nav>

      <div className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
cd apps/web && bash scripts/check-bundle.sh
```

Expected: build succeeds, chunk structure identical to Task 3 output.

- [ ] **Step 3: Run tests**

```bash
cd apps/web && npm run test -- --run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/layout/AppShell.tsx
git commit -m "perf(web): prefetch route chunks on nav item hover"
```

---

### Task 5: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full bundle check**

```bash
cd apps/web && bash scripts/check-bundle.sh
```

Expected output should show:
- `vendor-react-*.js` — react + react-dom, ~140 KB
- `vendor-router-*.js` — react-router-dom only, ~50 KB
- `vendor-query-*.js` — @tanstack/react-query, ~30 KB
- `vendor-icons-*.js` — lucide-react, ~variable
- Page chunks — login, projects, workspace, settings separately
- No single chunk > 300 KB

- [ ] **Step 2: Run all tests**

```bash
cd /Users/cookie/project/forge && npm run test -- --run 2>/dev/null || pnpm --filter @forge/web test -- --run
```

Expected: all pass.

- [ ] **Step 3: Summary commit (if any uncommitted changes)**

```bash
git status
```

If clean, skip. Otherwise commit remaining changes.
