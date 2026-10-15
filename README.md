# Kanban Studio

A local project management app: user accounts with an admin role, multiple boards per user, board sharing (editor or viewer), custom columns, cards with due dates, priorities, labels and assignees, search and filters, and an AI assistant.

Run locally with Docker and Compose, then open http://127.0.0.1:8000. Create an account, or sign in with the demo admin `user` / `password`.

- Windows: `powershell -ExecutionPolicy Bypass -File scripts/start.ps1`
- macOS/Linux: `bash scripts/start.sh`
- Stop: the matching `scripts/stop.ps1` or `bash scripts/stop.sh`.

The start script creates `.env` from `.env.example` when absent. Set `OPENROUTER_API_KEY` there to enable the assistant. The default model is `nvidia/nemotron-3-super-120b-a12b:free`. Existing `.env` values are preserved.

The database is `backend/data/pm.db`, mounted separately from image-owned frontend/code. Docker Desktop must have file-sharing access to this checkout/data directory. Startup migrates older databases transactionally, retaining card/column IDs and data. Back up the data directory before upgrading. Local sessions expire after eight hours and are revoked on logout. The demo admin credentials are deliberately shared; change the password from Profile if others can reach the app, and keep it on loopback.

## Development checks

Create a Python 3.12 virtual environment at `.venv` and install `backend/requirements-dev.txt`. Activate it before native backend commands. Stop existing native preview processes before upgrading their environment. In `frontend`, run `npm ci` using Node 24, then:

```text
npm run lint
npm run test:unit        # or npm run test:coverage
npm run test:e2e
```

From the project root, run `python -m pytest backend/tests -q --cov=backend.app`.

End-to-end tests build the static frontend and start an isolated FastAPI/SQLite server on port 8765 with a mocked AI provider. They do not access the live database or OpenRouter. Set `PM_TEST_PYTHON` to an alternate Python executable if using a separate validation environment. Install the browser once with `npx playwright install chromium` if needed.

For a native full-app preview, build with `npm run build` in `frontend`, then run `python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000` from the project root. `npm run dev` is for frontend-only development and does not provide the backend API. Production builds use system fonts and do not download fonts.

Board names and column titles save on blur/Enter; Escape cancels a rename. Columns can be added, moved left or right, and deleted when empty. Cards offer Edit (title, details, due date, priority, labels, assignee), Delete, drag handles, and a keyboard-accessible Move to selector. Dragging pauses while a filter is active. Owners share boards from Share; admins manage users from Admin. One write runs at a time. Failed manual edits remain visible with Retry save; conflicts require reloading the authoritative board. AI changes are committed on the server before success is shown.
