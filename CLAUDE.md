# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Root `AGENTS.md` holds the business requirements, coding standards (simplicity, no emojis, root-cause debugging) and color palette. `backend/AGENTS.md`, `frontend/AGENTS.md` and `scripts/AGENTS.md` hold per-area rules; read the relevant one before editing that area. Planning and status docs live in `docs/` (`PLAN.md`, `REMEDIATION.md`, `DATABASE.md`, `kanban-schema.json`).

## Commands

Python commands run from the project root using the root `.venv` (Python 3.12, `pip install -r backend/requirements-dev.txt`). Frontend commands run in `frontend/` (Node 24, `npm ci`).

```text
# Backend tests
python -m pytest backend/tests -q
python -m pytest backend/tests -q --cov=backend.app --cov-fail-under=90   # as CI runs it
python -m pytest backend/tests/test_api.py::test_name -q     # single test

# Frontend
npm run lint
npm run test:unit                                  # vitest
npm run test:coverage                              # vitest with coverage thresholds (CI)
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
- Auth: `/api/register` and `/api/login` (scrypt password hashes in `database.py`) issue an opaque HttpOnly cookie; only the token hash is stored in SQLite with an eight-hour expiry (`auth.py`). Every route derives the user from `require_user` (or `require_admin` for `/api/admin/*`), never from request data. Disabled users' sessions are ignored. The demo account `user`/`password` is seeded as an admin.
- Boards and access: users own many boards (`/api/boards`, `/api/boards/{id}`) and share them through `board_members` as editor or viewer. `database._role` decides access; a board the user cannot see is a 404, viewers get 403 on writes, and only owners delete boards or manage members (`/api/boards/{id}/members`). `/api/boards/{id}/participants` lists assignable users.
- Board model: 1-20 custom columns in any order; every card belongs to exactly one column and has optional due date, priority, labels and assignee. Strict Pydantic validation lives in `models.py` and mirrors `frontend/src/lib/kanban.ts`. Assignees must be the owner or a member.
- Persistence and concurrency: `database.py` stores board-scoped IDs and a board `revision`. `POST /api/boards/{id}` sends the full board with its revision; a stale revision returns 409 and nothing is written. `init_db` migrates older databases on startup without data loss. `PM_DB_PATH` overrides the default `backend/data/pm.db`. `docs/kanban-schema.json` must match the schema (a test checks it).
- AI flow: `POST /api/boards/{id}/ai` (owner/editor) loads the authoritative board server-side, builds a prompt (`ai.py`), calls OpenRouter (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`), parses a structured JSON reply of actions (`add_card`, `move_card`, `rename_card`, `update_card_details`, `delete_card`, `rename_column`, `add_column`, `delete_column`, `set_card_fields`), applies them, rechecks session and revision, then commits. The response returns the committed board plus applied and rejected actions; the client never POSTs an AI-produced board.
- Frontend: `page.tsx` restores the session and shows `LoginForm` (sign in or create account) or `Workspace`. `Workspace.tsx` owns the board list, current board, and the board/profile/admin views (`AppHeader`, `MembersPanel`, `ProfilePanel`, `AdminPanel`). `KanbanBoard.tsx` owns authoritative loading, a single in-flight mutation, retry on failure, reload on conflict, column controls and filters (`lib/filters.ts`). dnd-kit handles pointer and keyboard movement (disabled while a filter is active); cards also have a "Move to" selector. `src/lib/api.ts` wraps same-origin fetches.

## Testing notes

`.github/workflows/ci.yml` runs the backend tests (coverage at least 90%), lint, TypeScript, unit tests (coverage thresholds in `vitest.config.ts`) and browser tests on pushes to `main` and on pull requests. Browser specs share helpers in `frontend/tests/helpers.ts`; `POST /api/test/reset` (test server only) wipes and re-seeds the database before each test. Automated tests must never call the live OpenRouter provider; backend tests use mock transports and e2e mocks only the provider. Backend tests use isolated databases via `conftest.py`.
