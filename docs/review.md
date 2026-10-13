# Project code review

Reviewed on October 8, 2026. Project: `D:\projects\pm`. Revision: `074dcd0`.

> Remediation was authorized on October 8, 2026. This report describes the original revision; see [REMEDIATION.md](REMEDIATION.md) for implemented changes and current validation.

## Original assessment

The MVP implements the principal board, persistence, and assistant workflows, but is not ready to pass its release gate. The most urgent problems are arbitrary file disclosure, missing backend authentication, and several ways to overwrite or discard board data. Passing tests do not cover these failure modes.

This review covers backend application code, database schema and persistence, frontend components and board logic, tests, dependency manifests, Docker configuration, platform scripts, and project documentation. Findings account for the intended local, single-user MVP: hardcoded credentials and the selected model are intentional requirements, not defects by themselves. Supporting multiple users in the database is also an explicit requirement.

No application code or configuration was changed. Database probes used temporary databases, and AI calls in probes were mocked. The existing application database and secret values were not used in the probes. This report is the only intended repository change; validation generated normal ignored build/test artifacts.

## Validation results

| Check | Result | Limits |
| --- | --- | --- |
| Backend tests | 9 passed | Existing virtual environment; one dependency deprecation warning. Initial restricted attempt could not access pytest's temporary directory; approved rerun passed. |
| Frontend unit tests | 12 passed | API responses are mocked and resolve promptly. |
| Playwright tests | 5 passed | Next development server; some requests are intercepted. Does not establish actual SQLite persistence or Docker integration. Output was directed outside the repository. |
| ESLint | Failed | One `react-hooks/set-state-in-effect` error at `frontend/src/app/page.tsx:15`. |
| Production build | Passed | Initial restricted attempt failed downloading Google Fonts; approved network-enabled rerun passed, including TypeScript checks and static export. |
| Docker availability | Engine available, version 29.8.2 | Image build/container startup was not run. Docker findings below are based on configuration inspection. |
| Additional backend probes | Confirmed file traversal, unauthenticated access, invalid-board acceptance/data loss, second-user failure, dropped AI action, and unhandled failures | FastAPI TestClient, isolated SQLite files, mocked AI. |
| Additional browser probe | Confirmed old save response overwrites a newer edit | Controlled interception delayed the first POST response until after the second response. |

No live OpenRouter requests, dependency vulnerability scan, load test, or macOS/Linux execution was performed. No claim is made that the dependencies are vulnerability-free. Historical validation statements in `docs/PLAN.md` are not substituted for current results.

## Findings and remedial actions

Severity: Critical requires immediate correction because it exposes sensitive host/container files; High blocks reliable or secure MVP use; Medium affects required functionality or operational reliability; Low affects checks and maintainability. Each finding includes a proposed verification step, not a test added during this review.

### 1. Critical — Static file route permits traversal outside the export directory

**Location:** `backend/app/main.py:111–114`.

The catch-all route combines a request-controlled path with `FRONTEND_DIST_DIR` and checks only whether the result exists. It neither resolves and confines the path nor rejects directories. Encoded parent-directory segments reach files outside the intended public tree.

**Confirmed:** `GET /%2e%2e/%2e%2e/backend/requirements.txt` returned HTTP 200 with bytes exactly matching the backend requirements file. This used a harmless known file. The same root escape can expose readable project files, including the root `.env` and SQLite database when present. Secret files were not requested. `GET /_next/` returned 500 because a directory was passed to `FileResponse`.

**Remedy:** Serve public assets through a confined static-file implementation, or resolve the candidate path, require containment under the resolved export root, and require a regular file. Handle directory indexes explicitly and return suitable 404 responses for missing assets rather than returning the application HTML for all missing files.

**Verify:** Reject encoded traversal, platform-specific separators, absolute paths, directory requests, and escapes through symlinks; preserve loading of `/`, JavaScript, CSS, and legitimate assets. Prove files outside the export root cannot be fetched.

### 2. High — Login is a browser flag; backend access is unrestricted

**Locations:** `frontend/src/app/page.tsx:13–30`; `backend/app/main.py:33–97`; `docker-compose.yml:7–8`; `scripts/start.ps1:29`; `scripts/start.sh:14`.

Credentials are checked only in JavaScript, and authentication is represented by a freely writable session-storage value. Board GET/POST and AI endpoints have no authentication dependency. Logging out changes only the UI. Callers can read or replace the board and invoke OpenRouter without signing in. A probe confirmed unauthenticated board GET returned 200. All startup paths also bind/publish the backend on all interfaces, extending exposure beyond the intended local machine where networking permits it.

**Remedy:** Keep the required demo credentials but validate them on the backend, issue a server-verifiable session, require it on board and AI routes, and derive board ownership from that session. Invalidate the session on logout. Bind native startup to loopback and publish Docker on `127.0.0.1` for the stated local deployment.

**Verify:** Anonymous requests receive 401; browser storage manipulation does not authorize API access; logout prevents further operations; callers cannot select another user's board through a username parameter.

### 3. High — Concurrent saves overwrite newer edits

**Locations:** `frontend/src/components/KanbanBoard.tsx:110–119,141–149`; `frontend/src/components/KanbanColumn.tsx:53–56`; `backend/app/database.py:193–229`.

Despite its name, `queueBoardSave` starts every save immediately. Each response replaces current UI state with its entire submitted snapshot. Renaming a column triggers a POST on each keystroke. Requests and responses can complete out of order; an old response can erase a newer edit in the UI, and an old request processed last can overwrite it in SQLite. The full-board replacement API has no revision/conflict check, so separate tabs also silently overwrite each other.

**Confirmed:** A browser probe delayed the response for “First edit,” completed “Second edit,” then released the old response. The input reverted from “Second edit” to “First edit.”

**Remedy:** Serialize/coalesce pending saves and avoid applying stale responses to newer local state. Commit column renames on blur/submit or debounce them. Add a board revision checked atomically by the backend to reject stale full-board writes across tabs. Preserve unsaved local edits and provide an explicit retry path after failure.

**Verify:** Delay/reorder requests and responses, edit rapidly, and use two clients with the same starting revision. The latest edit must survive; stale saves must be rejected rather than silently replacing it.

### 4. High — Assistant responses can overwrite edits made while AI is running

**Location:** `frontend/src/components/KanbanBoard.tsx:191–242`.

The assistant receives the board captured at submission and returns a replacement based on that snapshot. Manual board controls remain usable while the AI is busy. If the user adds, deletes, moves, or renames a card before the response returns, saving `payload.board` discards those intervening edits. The comparison uses the captured board, not the current board. An already submitted request also continues through its save path after logout/unmount.

**Remedy:** Associate AI work with a board revision, reject/recompute stale results, or apply validated actions to the latest authoritative board using the same conflict checks as manual changes. Cancel outstanding work and prevent follow-up saves after logout/unmount. A minimal interim approach can disable conflicting edits while the request is active, but must also handle other tabs.

**Verify:** Delay AI completion, make a manual change, and ensure both changes survive or an explicit conflict is reported. Logout during AI processing must prevent a subsequent board write.

### 5. High — Initial loading and load failure expose a writable seed board

**Location:** `frontend/src/components/KanbanBoard.tsx:52,66–96,317–339`.

The UI renders `initialData` immediately and never gates editing on `isLoading`. Any edit before GET completes can POST seed data over an existing board; the eventual GET can also replace local edits. After a failed GET, the same seed remains editable and is incorrectly described as the “last local copy,” although there is no local persisted-board cache. A later successful POST can replace real saved data with those defaults.

**Remedy:** Keep mutations and AI disabled until authoritative data has loaded. On load failure, show a retry state without allowing the seed to be saved over an unknown board. Only describe a local copy if an actual validated cached board exists.

**Verify:** Delay GET and attempt an edit; no POST should occur. Fail GET for a previously customized board, retry, and confirm the stored board remains unchanged.

### 6. High — Board validation permits silent data loss and structural corruption

**Locations:** `backend/app/main.py:41–66`; `backend/app/database.py:198–221`.

Validation checks only the outer `columns` list and `cards` dictionary. Nested IDs, titles, card membership, uniqueness, and fixed-column invariants are unchecked. The saver deletes the existing board rows and reconstructs only cards referenced by columns. Missing references are silently skipped, and unreferenced card objects are discarded. Invalid nested fields instead produce uncaught exceptions/500s.

**Confirmed:** Removing `card-1` from the cards map while leaving its column reference returned 200 and reduced the saved board from eight cards to seven. An empty columns/cards payload returned 200 and permanently emptied the board. A column `{}` returned 500. That exception did roll back the transaction, so this review does not claim malformed exceptions universally delete data.

**Remedy:** Use validated nested request models and check board invariants before any write: the fixed column set, unique IDs, map-key/card-ID agreement, every reference present, each card assigned exactly once, and appropriate string types/limits. Reject inconsistent input with 400/422 and retain transactional writes.

**Verify:** Missing/orphaned/duplicate cards, duplicate columns, invalid nested types, and altered fixed columns are rejected without changing the existing database.

### 7. High — Compose hides the frontend built into the image

**Locations:** `docker-compose.yml:11–12`; `Dockerfile:16`; `backend/app/main.py:111–120`.

The image contains the static export at `/app/frontend/out`, but Compose mounts the entire host checkout over `/app`. A fresh checkout has no `frontend/out` because it is ignored. The mount hides the image's export, causing FastAPI to serve the placeholder backend page despite a successful image build. An old host export can similarly replace the freshly built frontend. Current local output can mask this defect.

**Remedy:** Mount only the SQLite data directory or a named data volume. Preserve image-owned application files and frontend output. If a development bind mount is needed, provide a separate development configuration with an explicit build process.

**Verify:** Build and start Compose from a checkout with no local frontend output. The login page and its assets must load, and board changes must survive container recreation.

### 8. Medium — A second user cannot receive a board

**Location:** `backend/app/database.py:69–92,116–145`; `docs/kanban-schema.json`.

Columns and cards use globally unique primary keys, but every newly seeded board inserts the same `col-backlog`/`card-1` identifiers. Once the demo board exists, creating another board fails on the column uniqueness constraint. This contradicts the promised multi-user-capable database even though the frontend currently supports only the demo login.

**Confirmed:** `GET /api/board?username=second` returned 500 on an isolated initialized database.

**Remedy:** Scope public IDs by board with composite keys and matching ownership-aware foreign keys, or generate unique internal IDs per board and map them consistently to the client. Update the schema proposal and provide a migration for existing databases. Until more accounts are supported, reject unsupported usernames rather than creating arbitrary users on reads.

**Verify:** Seed two users, edit each board independently, and prove IDs do not collide and cross-board associations cannot be created.

### 9. Medium — `update_card_details` is accepted but never applied

**Location:** `backend/app/ai.py:63–72,193–217`.

The sanitizer accepts `update_card_details`, but the action dispatcher has no branch for it. The API can return this action and a success message while leaving the card unchanged. A direct isolated probe confirmed this no-op. Application helpers also return success/failure flags that the dispatcher discards, so actions targeting missing entities are returned as though they were applicable.

**Remedy:** Dispatch every supported action type, report only applied actions or explicit rejections, and document every action's required fields in the prompt/schema. Allow clearing details intentionally; the current truthiness checks and fallback in `_apply_rename_card` prevent this.

**Verify:** Cover all supported action types, empty-details behavior, nonexistent targets, and mixed valid/invalid batches. Messages and action results must accurately reflect the committed changes.

### 10. Medium — Cards have no direct editing control

**Locations:** `frontend/src/components/KanbanCard.tsx:20–50`; `frontend/src/components/KanbanBoard.tsx:141–187`.

Existing cards display their title/details and offer removal, but expose no editor or manual update handler. Card editing is an explicit business requirement. Depending on an external AI service for all edits makes ordinary correction unavailable without a working API key/network/model.

**Remedy:** Add a simple title/details editor that uses the normal persistence path with the conflict/error handling described above.

**Verify:** Edit an existing card without AI, refresh, and confirm both fields persist. Cancelled edits must not save.

### 11. Medium — Unix startup does not build the frontend

**Location:** `scripts/start.sh:11–14`; compare `scripts/start.ps1:21–27`.

The macOS/Linux script installs only Python dependencies and starts Uvicorn. A fresh checkout has no static export, so it serves the placeholder page. It also does not use the Docker configuration required for the packaged runtime. The Windows script builds the frontend, so platform behavior differs.

**Remedy:** Have all start/stop scripts consistently manage the packaged Docker app, or clearly support a native mode that installs/builds the frontend on every supported platform. Check native-command exit codes in PowerShell; `$ErrorActionPreference = 'Stop'` alone does not reliably stop Windows PowerShell after a failed external build/install.

**Verify:** Start from clean Windows/macOS/Linux checkouts and confirm the real login UI loads. Failed installation/build must stop startup with a clear failure.

### 12. Medium — Stop scripts kill unrelated processes by port

**Locations:** `scripts/stop.ps1:3–7`; `scripts/stop.sh:4–7`.

Both scripts target whatever uses port 8000, without establishing that it belongs to this app. The PowerShell query also includes connections rather than only the listening server. On Unix the command selects port users broadly. An unrelated service or client can therefore be terminated. `xargs -r` also assumes an implementation that should be checked for the supported macOS environment.

**Remedy:** Stop the known Compose service, or track and verify the exact native process created by startup. Use portable commands for supported operating systems.

**Verify:** An unrelated listener/client on port 8000 remains running; repeated stop is harmless; normal app shutdown works on each platform. No kill command was executed for this review.

### 13. Medium — AI boundary validation and transport errors are incomplete

**Locations:** `backend/app/main.py:69–97`; `backend/app/ai.py:17–28,290–345`; `frontend/src/components/KanbanBoard.tsx:204–216`.

AI requests accept unvalidated board/history values. A string board with no actions was returned successfully, while an integer history raised a 500. HTTPX timeouts/network errors bypass the route's `ValueError`/`RuntimeError` handlers; a mocked `ReadTimeout` returned 500. Upstream response shapes are only partly checked, and upstream failure bodies are exposed directly in API error details. The entire unbounded conversation and board are resent on every prompt, with no limits or output-token budget.

**Remedy:** Validate board and conversation models; cap request/history sizes and model output; normalize upstream transport and response-format failures into controlled errors, using 504 for timeout and 502 for upstream failure. Log diagnostic details server-side and return concise safe messages. Provide frontend retry feedback that distinguishes AI generation failure from board-save failure, and acknowledge success only after persistence succeeds.

**Verify:** Invalid history/board is rejected before provider calls. Timeout, network failure, invalid JSON/choices, empty content, oversized history, and persistence failure produce predictable responses without misleading success messages.

### 14. Medium — Card movement is inaccessible from the keyboard

**Location:** `frontend/src/components/KanbanBoard.tsx:102–106`; `frontend/src/components/KanbanCard.tsx:29–30`.

Only `PointerSensor` is configured. The card exposes drag attributes/listeners but has neither a keyboard sensor nor an alternative move control. Keyboard-only users cannot perform the required movement workflow. The assistant/new-card inputs also lack explicit labels beyond placeholders, and column title labels are identical across columns.

**Remedy:** Add a keyboard sensor with sortable coordinates or an accessible move-to-column control. Give inputs stable descriptive labels and keep visible focus indication. Check text contrast, particularly the shared gray text, during accessibility validation.

**Verify:** Move and reorder cards using only the keyboard, preserve focus after operations, and check control names with an accessibility inspection.

### 15. Low — Required lint check currently fails

**Location:** `frontend/src/app/page.tsx:13–17`.

The current ESLint configuration rejects synchronous state-setting inside the mount effect. This is a failed repository check, not evidence that sign-in itself is broken. Production compilation passes independently.

**Remedy:** Rework session initialization consistently with backend authentication and the configured React lint rules, or explicitly document a narrowly justified rule exception. Avoid globally disabling the rule to conceal the failure.

**Verify:** `npm run lint`, hydration, initial login rendering, session restoration, and logout all pass.

### 16. Low — Runtime artifacts and Docker input are not adequately separated

**Locations:** tracked `backend/data/pm.db`; root `.gitignore`; `Dockerfile:5–6`; missing `.dockerignore`.

The live database is tracked even though initialization can seed a new database. Ordinary application use can therefore change a binary repository file and distribute local board data. Docker sends the checkout as build context without exclusions, and copies the entire frontend directory, potentially including host `node_modules`, stale output, and local frontend environment files. `npm install` also allows dependency resolution instead of enforcing the committed lockfile.

**Remedy:** Back up any desired data, remove the runtime database from version control, ignore database sidecar files, and persist data in a dedicated volume. Add `.dockerignore` exclusions for secrets, dependency directories, build/test artifacts, virtual environments, and repository metadata. Use `npm ci`; consider locking Python transitive dependencies for repeatable builds. Separate test-only Python dependencies from the runtime image.

**Verify:** A fresh checkout initializes correctly, normal edits do not dirty Git, and Docker builds use the lockfile without host dependency/generated files. No secrets are present in build inputs or final image layers.

### 17. Low — Documentation and tests overstate integration readiness

**Locations:** `frontend/AGENTS.md`; `backend/AGENTS.md`; `frontend/README.md`; `docs/PLAN.md`; `frontend/playwright.config.ts:19–24`; `frontend/tests/kanban.spec.ts`.

Frontend guidance still says authentication and API integration are absent; backend guidance remains a placeholder; the README advertises standalone Next development without a backend/proxy. That server has no configured API implementation. The first three browser tests can pass on optimistic seed-state interactions even when board requests fail, and the remaining tests intercept APIs. None establishes real reload persistence or the Docker serving path. The plan simultaneously leaves persistence/release items unchecked and claims full workflow/lint validation.

**Remedy:** Document the actual combined startup, required environment variables without values, persistence location, and test commands. Correct plan/checklist status to the verified state. Add a small integration suite against FastAPI with an isolated database and the exported frontend, including reload persistence, login enforcement, and AI updates with a mocked provider. Add the failure/conflict/security cases specified above to the appropriate existing suites.

**Verify:** Follow documented steps on a clean checkout. Integration tests must fail if the backend is unavailable, saves are not persisted, or Compose serves the placeholder.

## Recommended remediation order

1. Fix the file-serving escape and backend access control; keep the intended deployment on loopback.
2. Protect board integrity: nested validation, loading gates, ordered saves, revision conflicts, and stale AI handling.
3. Correct Compose/static startup and platform lifecycle scripts; verify from a clean checkout.
4. Complete direct card editing, supported AI actions, provider error handling, and keyboard movement.
5. Resolve lint, clean up runtime/build artifacts, update documentation, and add meaningful backend/export integration checks.

Keep fixes small and tied to the current requirements. Re-run the existing checks and targeted regression cases after remediation; do not consider the release gate complete solely because the current success-path suites pass.
