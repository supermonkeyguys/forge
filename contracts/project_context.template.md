# Project Context

> This file is the shared brain for all agents working on this project.
> Every agent MUST read this before starting work.
> Every agent MUST update the relevant section after completing work.

## App Overview

- **Name**: {{app_name}}
- **Description**: {{description}}
- **Tech Stack**: Next.js 14 + Prisma + SQLite
- **Created**: {{created_at}}

---

## Architecture Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| (filled by Architect Agent) | | |

---

## Data Models

```
(filled by Schema Agent after schema.prisma is written)

Example:
User: id, email, password, createdAt
Post: id, title, content, authorId → User
```

---

## API Contracts

```
(filled by API Agent after each route is created)

Example:
POST /api/auth/login
  body: { email: string, password: string }
  response: { token: string, user: { id, email } }

GET /api/posts
  query: { page?: number, limit?: number }
  response: { items: Post[], total: number }
```

---

## Available Hooks (packages/core/)

```
(filled by Logic Agent after each hook is created)

Example:
useLogin()           → packages/core/auth/use-login.ts
usePostList(page)    → packages/core/posts/use-post-list.ts
```

---

## Available UI Components (packages/ui/)

```
(filled by UI Agent after each component is created)

Example:
<Button variant="primary|ghost" size="sm|md|lg" />
<Input label placeholder error />
<Modal title onClose children />
```

---

## Completed Features

```
(filled by Orchestrator after each validation pass)

- [ ] F001: User authentication
- [ ] F002: Post list page
```

---

## Known Constraints & Gotchas

```
(filled by any agent when they discover something important)

Example:
- SQLite doesn't support concurrent writes; use transactions for multi-step ops
- Auth token stored in httpOnly cookie, not localStorage
```
