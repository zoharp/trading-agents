# Orcanos — System-level Instructions

These rules apply to every Orcanos project. They do not change per project.
Project-specific details live in `CLAUDE.md`.

---

## Deployment gate — MANDATORY

**Do NOT push code to GitHub or trigger any deployment until the user explicitly approves.**
Always stop after a local commit and ask before pushing.

---

## Skills in use

Global skills live in `~/.claude/skills/`. Use them as the project requires:

| Skill | When to invoke |
|---|---|
| `deploy` | Any git commit / push / release |
| `release-management` | After every code change that bumps a version |
| `gcp-deployment` | Dockerfile, Cloud Build, Vercel, GCP secrets |
| `fastapi-streaming` | FastAPI NDJSON endpoints, React streaming consumers |
| `supabase-patterns` | Supabase auth, pgvector, RLS, live settings |
| `orcanos-rag-architecture` | RAG pipeline, query router, chunking, ETL indexing |
| `orcanos-api` | Any Orcanos REST API call (auth, read, write, links) |
| `orcanos-test-automation` | Setting up or running the test suite |
| `req-create` | New functionality, new endpoints, changed system behavior |
| `req-trace` | After editing `backend/` or `frontend/src/` — check traceability |
| `req-gap-check` | Periodic scan — find source files with no linked requirement |
| `req-status` | Requirements health / compliance dashboard |

---

## Release management — MANDATORY

Use the `release-management` skill after every code change.
Versions are tracked in `CLAUDE.md` under **Current versions** — update them there after every bump.

---

## Requirements traceability — MANDATORY (IEC 62304 projects)

After every code change to `backend/` or `frontend/src/`:
1. Run `req-trace` on each modified file to check existing traceability
2. Run `req-create` for any new functionality, new endpoints, or changed behavior
3. Skip only for trivial changes: style fixes, config tweaks, pure refactors with no behavior change

---

## General rules

- Secrets never go in source code — always `.env`, never committed
- `.env.example` must stay in sync with `.env` (keys only, no values)
- Every project exposes a `/health` endpoint returning `{ "status": "ok", "backend_version": "..." }`
- Test backend always runs on port 8001 with `AUTH_DISABLED=true` — never point tests at production
