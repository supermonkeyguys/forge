# E2E Tests

Playwright E2E tests for Forge frontend. 50 tests across 2 layers.

## Prerequisites

Both services must be running before running tests:

```bash
# Terminal 1 — Go API
cd apps/api && go run ./cmd/server

# Terminal 2 — Vite dev server  
cd apps/web && pnpm dev
```

Dev account (`dev@forge.local` / `devpassword123`) is auto-created on first run.

## Running Tests

```bash
# Layer 1 only — fast, no SSE required (use for quick validation after changes)
npm run e2e:layer1

# Layer 2 only — SSE mocked, agent flow
npm run e2e:layer2

# All tests
npm run e2e

# Interactive UI mode
npx playwright test --ui

# Show HTML report from last run
npx playwright show-report
```

## Test Structure

```
e2e/
├── fixtures/
│   └── auth.ts                       # authedPage fixture (performs dev login)
├── layer1/                           # No SSE — stable, fast
│   ├── routing.spec.ts               # Route redirects and auth guard
│   ├── login.spec.ts                 # Dev skip login + real form
│   ├── projects.spec.ts              # Project list, empty state, status cards
│   ├── workspace-input.spec.ts       # WorkspacePage input phase
│   ├── workspace-pm-review.spec.ts   # PM review feature selection and confirm
│   └── workspace-running.spec.ts     # Running phase agent cards and progress
└── layer2/                           # EventSource mocked via addInitScript
    ├── agent-flow.spec.ts            # Agent card updates from SSE events
    ├── preview-panel.spec.ts         # Preview iframe on done event
    └── waiting-state.spec.ts         # Waiting phase user input
```

## Layer Descriptions

**Layer 1** tests cover all UI that doesn't require live SSE:
- Routing redirects and auth guard
- Login flows (dev mode + real credentials)
- Projects page (empty state, project cards for each status)
- WorkspacePage: input → pm-review → running transitions

**Layer 2** tests mock the SSE stream using a custom EventSource mock injected via `addInitScript`. This fires agent events synchronously so tests don't need a real Agent Service running.

## Adding New Tests

- New frontend feature with no SSE → add to `layer1/`
- New Agent SSE event type → add to `layer2/agent-flow.spec.ts`
- New state in WorkspacePage → add to the appropriate layer based on whether it requires SSE
