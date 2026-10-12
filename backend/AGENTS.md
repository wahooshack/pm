# Backend guide

FastAPI serves the Next static export and the same-origin API. Use relative imports within `backend.app`; run from the project root.

- `main.py`: app lifespan, bounded JSON requests, login/session/logout routes, protected board/AI routes, and confined static file serving.
- `models.py`: strict nested board/request validation; five fixed columns and exactly one membership per card.
- `auth.py`: opaque HttpOnly session cookie; hashed tokens and eight-hour expiry in SQLite.
- `database.py`: connection lifecycle, startup migration from global to board-scoped IDs, transactional revision-checked writes.
- `ai.py`: provider wrapper, structured response parsing, supported action dispatch and rejection reporting.
- `tests/`: isolated database/security/API/provider tests and a test-only exported-frontend server.

`PM_DB_PATH` selects a database; otherwise `backend/data/pm.db` is used. Runtime data is ignored. Back up existing data before migration. Writes must validate before modifying rows and check the submitted revision atomically. AI reads the authenticated user's authoritative board, then rechecks session/revision after provider completion.

Run `python -m pytest backend/tests -q` using the root `.venv` and `backend/requirements-dev.txt`. Production installs only pinned runtime requirements. Never call the live provider in automated tests or expose secrets in logs/errors.
