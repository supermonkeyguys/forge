# Forge Architecture

## Overview

Forge is an AI-powered application factory. Users describe what they want to build,
and a team of AI agents collaborates to generate, validate, and deliver a running
full-stack application. Users can watch the process and iterate in natural language.

## Core Principles

1. **Transparency** — users see what each agent is doing and why
2. **Iteration-friendly** — changes are surgical, not full rewrites
3. **Architecture-constrained** — generated code follows strict layering rules to prevent degradation

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Frontend                            │
│  - Requirement input + PM review UI                             │
│  - Agent collaboration visualizer (real-time)                   │
│  - App preview (iframe → E2B sandbox URL)                       │
│  - Iteration history / version switcher                         │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTP + SSE
┌──────────────────────▼──────────────────────────────────────────┐
│                      Go API Server (Chi)                         │
│  - User/project/session management                              │
│  - Task lifecycle (create → dispatch → status → result)         │
│  - PostgreSQL (projects, versions, agent logs)                  │
│  - Dispatches jobs → Node.js Agent Service via HTTP/queue       │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTP / BullMQ (Redis)
┌──────────────────────▼──────────────────────────────────────────┐
│                  Node.js Agent Service                           │
│  - Orchestrator state machine                                   │
│  - Agent team execution (PM / Architect / Builders / Validator) │
│  - Vercel AI SDK → Claude                                       │
│  - E2B SDK → sandbox management                                 │
│  - Streams progress back to Go API via SSE/webhook              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Agent Team

| Agent | Tier | Responsibility | Reads | Writes |
|-------|------|----------------|-------|--------|
| PM Agent | 0 | Requirement → Spec, demand amplification | user input | spec.json |
| Architect Agent | 1 | Spec → file-level change plan | spec.json, project_context.md | task_plan.json, project_context.md |
| Schema Agent | 2 | Database schema design | task_plan.json | prisma/schema.prisma |
| Logic Agent | 2 | Business logic + unit tests | task_plan.json, project_context.md | packages/core/**, server/domain/** |
| API Agent | 2 | HTTP route layer | task_plan.json, project_context.md | app/api/** |
| UI Agent | 2 | Pure UI components + Storybook | task_plan.json, design_spec.json | packages/ui/** |
| Page Agent | 2 | Page assembly (thin layer) | task_plan.json, project_context.md | app/**/page.tsx |
| Test Agent | 3 | Run tests + E2E validation | spec.json, codebase | validation_report.json |
| Review Agent | 3 | Architecture constraint check | codebase | review_report.json |
| Orchestrator | 4 | State machine, routing, user escalation | all reports | — |

---

## Contract Files (shared communication between agents)

```
contracts/
├── spec.json               # PM Agent output — structured requirements
├── task_plan.json          # Architect output — file-level change plan
├── design_spec.json        # UI Agent maintains — component/design tokens
├── project_context.md      # All execution agents maintain — living architecture doc
├── validation_report.json  # Test Agent output
└── review_report.json      # Review Agent output
```

---

## Orchestrator State Machine

```
IDLE → ANALYZING → PLANNING → BUILDING → VALIDATING → DONE
                                              ↓
                                           FIXING → BUILDING
                                              ↓ (> N retries)
                                           WAITING (user input required)
```

---

## Generated App Architecture (what agents produce)

All generated apps follow this fixed structure:

```
generated-app/
├── packages/
│   ├── core/               # Business logic only (no UI deps)
│   │   └── **/*.test.ts    # Unit tests live here
│   └── ui/                 # Pure UI components (no business logic)
│       └── *.stories.tsx
├── server/
│   ├── domain/             # Backend business logic
│   └── infra/              # DB repositories, external clients
├── app/
│   ├── api/                # HTTP thin layer (no business logic)
│   └── **/page.tsx         # Page assembly only
└── prisma/
    └── schema.prisma
```

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend (platform UI) | React + Vite + TanStack Query |
| Backend (platform API) | Go + Chi + sqlc |
| Agent Service | Node.js + Vercel AI SDK |
| LLM | Claude (Sonnet for complex, Haiku for simple) |
| Sandbox | E2B |
| Task Queue | BullMQ + Redis |
| Database | PostgreSQL |
| Real-time | Server-Sent Events (SSE) |
