# Forge

AI-powered application factory. Describe what you want to build — a team of AI agents
collaborates to generate, validate, and deliver a running full-stack application.

**Core differentiators:**
- **Transparency** — watch every agent decision in real-time, not a black box
- **Iteration-friendly** — surgical changes that don't break what's already working
- **Architecture-constrained** — generated code follows strict layering rules to stay maintainable

## Project Structure

```
forge/
├── apps/
│   ├── web/          # React frontend (Vite)
│   ├── api/          # Go backend (Chi)
│   └── agent/        # Node.js agent service (Vercel AI SDK + E2B)
├── contracts/        # Shared JSON schemas for agent communication
└── docs/             # Architecture and planning docs
```

## Development

```bash
make dev          # Start all services
make dev-api      # Go API only (port 8080)
make dev-agent    # Agent service only (port 3001)
make dev-web      # React frontend only (port 5173)
```

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full system design.

## Roadmap

- **Phase 0** — Project skeleton + contract file schemas ✅
- **Phase 1** — Single-agent loop: input → spec → code → sandbox → preview
- **Phase 2** — PM Agent demand amplification + user review UI
- **Phase 3** — Full agent team + parallel execution
- **Phase 4** — Real-time collaboration visualizer
- **Phase 5** — Version history + surgical iteration
