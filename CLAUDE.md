# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Root `AGENTS.md` holds the business requirements, coding standards (simplicity, no emojis, root-cause debugging) and color palette. `backend/AGENTS.md`, `frontend/AGENTS.md` and `scripts/AGENTS.md` hold per-area rules; read the relevant one before editing that area. Planning and status docs live in `docs/` (`PLAN.md`, `REMEDIATION.md`, `DATABASE.md`, `kanban-schema.json`).

## Commands

Python commands run from the project root using the root `.venv` (Python 3.12, `pip install -r backend/requirements-dev.txt`). Frontend commands run in `frontend/` (Node 24, `npm ci`).

```text
# Backend tests
python -m pytest backend/tests -q
python -m pytest backend/tests/test_api.py::test_name -q     # single test

# Frontend
npm run lint
npm run test:unit                                  # vitest
npx vitest run src/lib/kanban.test.ts -t "name"    # single unit test
npm run test:e2e                                   # next build + playwright
npx playwright test -g "name"                      # single e2e (after npm run build)

# Native full-app preview (build frontend first)
npm run build   # in frontend/, produces frontend/out
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000

# Docker (Compose project pm-mvp, http://127.0.0.1:8000, user/password)
powershell -ExecutionPolicy Bypass -File scripts/start.ps1   # or bash scripts/start.sh
powershell -ExecutionPolicy Bypass -File scripts/stop.ps1    # or bash scripts/stop.sh
```

`npm run dev` has no backend API; use it only for isolated UI work. E2E tests start `backend.tests.serve_e2e` on port 8765 (isolated SQLite, mocked AI provider) via `.venv` python, or `PM_TEST_PYTHON` if set. Install the browser once with `npx playwright install chromium`.

## Architecture

- Single origin: FastAPI (`backend/app/main.py`) serves `/api/*` and the Next.js static export from `frontend/out` (`output: "export"`, `trailingSlash: true`). Static serving is path-confined to that directory. The Docker image builds the export in a Node stage and copies it into the Python image; only `backend/data` is mounted.
- Auth: `/api/login` issues an opaque HttpOnly cookie; only the token hash is stored in SQLite with an eight-hour expiry (`auth.py`). Every board/AI route derives the user from `require_user`, never from request data.
- Board model: one board per user with five fixed, ordered columns; every card belongs to exactly one column. Strict Pydantic validation lives in `models.py` and mirrors `frontend/src/lib/kanban.ts`.
- Persistence and concurrency: `database.py` stores board-scoped IDs and a board `revision`. `POST /api/board` sends the full board with its revision; a stale revision returns 409 and nothing is written. `init_db` migrates older databases on startup without data loss. `PM_DB_PATH` overrides the default `backend/data/pm.db`.
- AI flow: `POST /api/ai` loads the authoritative board server-side, builds a prompt (`ai.py`), calls OpenRouter (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`), parses a structured JSON reply of actions (`add_card`, `move_card`, `rename_card`, `update_card_details`, `delete_card`, `rename_column`), applies them, rechecks session and revision, then commits. The response returns the committed board plus applied and rejected actions; the client never POSTs an AI-produced board.
- Frontend: `KanbanBoard.tsx` owns authoritative loading, a single in-flight mutation, retry on failure and reload on conflict. dnd-kit handles pointer and keyboard movement; cards also have a "Move to" selector. `src/lib/api.ts` wraps same-origin fetches.

## Testing notes

Automated tests must never call the live OpenRouter provider; backend tests use mock transports and e2e mocks only the provider. Backend tests use isolated databases via `conftest.py`.
