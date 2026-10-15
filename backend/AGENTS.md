# Backend guide

FastAPI serves the Next static export and the same-origin API. Use relative imports within `backend.app`; run from the project root.

- `main.py`: app lifespan, bounded JSON requests, error mapping (404/403/409/422), auth, profile, admin, board, member and AI routes, and confined static file serving.
- `models.py`: strict request and board validation; 1-20 unique columns, exactly one membership per card, card fields.
- `auth.py`: opaque HttpOnly session cookie, `require_user` and `require_admin`.
- `database.py`: connection lifecycle, scrypt passwords, users and sessions, board access roles, members, startup migration, transactional revision-checked writes.
- `ai.py`: provider wrapper, structured response parsing, supported action dispatch and rejection reporting.
- `tests/`: isolated database/security/API/provider tests (`test_users`, `test_boards`, `test_migration`, `test_api`, `test_ai`) and a test-only exported-frontend server.

`PM_DB_PATH` selects a database; otherwise `backend/data/pm.db` is used. Runtime data is ignored. Back up existing data before migration. Writes must validate before modifying rows and check the submitted revision and the caller's role atomically. A board the caller cannot see must be reported as 404. AI reads the authoritative board for an owner or editor, then rechecks session/revision after provider completion. Keep `docs/kanban-schema.json` in step with schema changes.

Run `python -m pytest backend/tests -q --cov=backend.app --cov-fail-under=90` using the root `.venv` and `backend/requirements-dev.txt`. Production installs only pinned runtime requirements. Never call the live provider in automated tests or expose secrets in logs/errors.
