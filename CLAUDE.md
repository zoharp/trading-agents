# [Project Name] — Claude Code Instructions

## IMPORTANT: Deployment Gate
**Do NOT push any code to GitHub or trigger any deployment until the user explicitly approves.** Always stop after committing locally and ask for approval before pushing.

---

## Skills in use
This project uses the following global skills (from `~/.claude/skills/`):
- **`release-management`** — version bumping rules and release_notes.json updates
- **`deploy`** — git commit, push to GitHub, deployment checklist
- **`gcp-deployment`** — Cloud Run, Cloud Build, Vercel, secrets handling
- **`fastapi-streaming`** — NDJSON streaming, React fetch consumer, module testing
- **`supabase-patterns`** — auth, pgvector, live settings, multi-tenant patterns
- **`orcanos-rag-architecture`** — RAG pipeline, router, chunking, retrieval, ETL
- **`req-create`** — create a new IEC 62304 requirement from a feature description
- **`req-trace`** — trace a source file/function to its linked requirements
- **`req-gap-check`** — find source files with no linked requirement
- **`req-status`** — requirements health dashboard

---

## Requirements Traceability — MANDATORY
After every code change to `backend/` or `frontend/src/`:
1. Run `/req-trace` on each modified file to check existing traceability
2. Run `/req-create` for any new functionality, new endpoints, or changed system behavior
3. Skip only for trivial changes: style fixes, config tweaks, pure refactors with no behavior change

---

## Release Management — MANDATORY
After every code change, use the `release-management` skill.

### Current versions (update after every bump)
- **Backend:** `1.0.0`
- **Frontend:** `1.0.0`

---

## Project Goal
<!-- Describe what this project does in 2-5 sentences -->

---

## Tech Stack
- **Backend:** <!-- FastAPI / Node / .NET / none -->
- **Frontend:** <!-- React/Vite / Next.js / none -->
- **Database:** <!-- Supabase / SQL Server / none -->
- **AI/LLM:** <!-- OpenAI GPT-4o / Claude / none -->

---

## Project
**Git repo:** https://github.com/zoharp/new-project

### Deployment
- **Frontend:** <!-- Vercel / GCP / none -->
- **Backend:** <!-- GCP Cloud Run / AWS / local only -->
- **Deploy:** run `GitPush.bat` (Windows)

---

## Project Structure

```
project-name/
├── CLAUDE.md               ← this file
├── .env                    ← secrets (never commit)
├── .env.example            ← template
├── .gitignore
├── GitPush.bat             ← git commit + push
├── run.bat                 ← start backend + frontend
├── run-backend.bat         ← start backend only
├── run_claude.bat          ← launch Claude Code
├── requirements.txt        ← Python dependencies (if backend)
├── backend/
│   └── api.py
└── frontend/
    └── src/
```

---

## Environment Variables (`.env`)

```
# Fill in as the project grows
```

---

## How to Run

```bat
run.bat          ← full stack (backend + frontend)
run-backend.bat  ← backend only
run_claude.bat   ← Claude Code
```

---

## One-time Setup
1. Copy `.env.example` → `.env` and fill in all values
2. Install Python deps: `pip install -r requirements.txt`
3. Install frontend deps: `cd frontend && npm install`

---

## Common Issues
<!-- Add project-specific troubleshooting here -->
