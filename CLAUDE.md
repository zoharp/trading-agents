# [Project Name] — Claude Code Instructions

> System-level rules (deployment gate, skills, versioning, traceability) are in `system.md`.
> This file contains only project-specific information.

---

## Project

<!-- Describe what this project does in 2-5 sentences -->

**Git repo:** https://github.com/zoharp/[repo-name]

---

## Tech Stack

- **Backend:** <!-- FastAPI / Node / .NET / none -->
- **Frontend:** <!-- React/Vite / Next.js / none -->
- **Database:** <!-- Supabase / SQL Server / none -->
- **AI/LLM:** <!-- OpenAI GPT-4o / Claude / none -->

---

## Deployment

- **Frontend:** <!-- Vercel — auto-deploys on push to main -->
- **Backend:** <!-- GCP Cloud Run — via Cloud Build -->
- **Deploy:** run `deploy.bat` (Windows) or `./deploy.sh` (Mac/Linux)

---

## Current versions

- **Backend:** `1.0.0`
- **Frontend:** `1.0.0`

---

## Project Structure

```
[project-name]/
├── CLAUDE.md               ← this file (project-specific)
├── system.md               ← global Orcanos rules (shared across all projects)
├── .env                    ← secrets (never commit)
├── .env.example            ← template (keys only)
├── .gitignore
├── deploy.bat              ← git commit + push (Windows)
├── deploy.sh               ← git commit + push (Mac/Linux)
├── run.bat                 ← start backend + frontend
├── run-backend.bat         ← start backend only
├── run_claude.bat          ← launch Claude Code
├── requirements.txt        ← Python dependencies (backend)
├── backend/
│   └── api.py
├── tests/
│   ├── conftest.py
│   ├── run_tests.py
│   ├── test_definitions.json
│   └── app/
│       └── test_queries.py
└── frontend/
    └── src/
```

---

## Environment Variables (`.env`)

```bash
# Add required variables here as they are defined
# Example:
# OPENAI_API_KEY=
# SUPABASE_URL=
# SUPABASE_SERVICE_ROLE_KEY=
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

<!-- Add project-specific troubleshooting here as it comes up -->
