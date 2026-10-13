# Code review

Reviewed on October 12, 2026. Revision: `b82d5a2` (`main`, in sync with `origin/main`). No application code or configuration was changed; this report is the only repository change.

> Status: M1-M3 were resolved on October 12, 2026, including a live OpenRouter check; see `docs/REMEDIATION.md`. Low findings remain open.

## Summary

The application is in good shape. The October 8 remediation (`review.md`, `docs/REMEDIATION.md`) holds up: authentication, static-file confinement, revision-checked writes, strict board validation and server-side AI commits are all correctly implemented and covered by tests. No critical or high-severity defects were found.

The remaining issues are concentrated in the AI path (one malformed field discards a whole valid batch with a misleading error, and the live provider path is still unverified), one in-tab lost-update case in the card editor, and a set of low-severity simplification, hygiene and test-quality items. Several of the low items are cases where the code is more defensive or more duplicated than the project's own "keep it simple" standard asks for.

| Severity | Count |
| --- | --- |
| Critical | 0 |
| High | 0 |
| Medium | 3 |
| Low | 13 |

## Scope and validation

Reviewed: all backend code (`backend/app`), backend tests, frontend source, unit and browser tests, lint/TypeScript/Vitest/Playwright configuration, Dockerfile, Compose file, start/stop scripts, ignore files, dependency manifests, and project documentation.

| Check | Result |
| --- | --- |
| Backend tests (`python -m pytest backend/tests -q`) | 37 passed; one third-party deprecation warning |
| Frontend lint | Passed |
| Frontend unit tests (Vitest) | 18 passed |
| Production build and browser tests (Playwright, real FastAPI/SQLite, mocked provider) | Build passed; 8 passed |
| Docker image rebuild and startup via `scripts/start.ps1` | Healthy |
| Docker smoke test (health, login page, anonymous 401, traversal 404, bad password 401, login, board read, logout revocation) | Passed from host and from inside the container |
| Targeted probes (isolated temporary database, mocked provider) | Confirmed findings M1, L1 and L2 below |

Not performed: live OpenRouter calls, macOS execution, load testing, dependency vulnerability audit.

## Findings and actions

Severity: Medium affects a required feature or can lose user changes; Low affects maintainability, diagnostics, test confidence or minor UX.

### M1. One over-long AI field discards the whole batch with a misleading error

**Location:** `backend/app/ai.py:53-108` (`_sanitize_action`), `backend/app/main.py:138-144`.

The sanitizer checks action shape but not the board's field limits (title 200 characters, details 5000, 500 cards). An out-of-range value is applied to the draft board, then `Board.model_validate` in the route raises a `ValidationError`, which is caught as `ValueError` and returned as `502 The assistant is unavailable or returned an invalid response.` Every other valid action in the batch is lost, and the user is told the assistant is unavailable when it actually responded.

**Confirmed:** a mocked response containing a valid `move_card` plus a `rename_card` with a 201-character title returned 502, and `card-1` remained in Backlog.

**Action:** Enforce the field limits per action (reject the offending action into `rejectedActions`, as for missing IDs), so valid actions still commit. The simplest way is to validate titles/details with the same constraints as `models.py` inside `_sanitize_action`. Add a test with a mixed valid/over-long batch.

### M2. Live AI path is unverified with the configured model

**Location:** `backend/app/ai.py:281-334`; `docs/PLAN.md` open items.

All automated tests mock the provider, and live OpenRouter connectivity has not been revalidated since remediation. The configured model, `nvidia/nemotron-3-super-120b-a12b:free`, is a large reasoning model on a free tier. The request uses a non-streaming call with a 30-second timeout and `max_tokens: 4000`. If the model spends its token budget on reasoning or responds slowly, users get an empty-content 502 or a timeout 504 on every request. This has not been observed; it is a risk that the current tests cannot detect.

**Action:** Make one manual live request through the running app with a real key (for example "move Align roadmap themes to Done") and record the latency and outcome in `docs/REMEDIATION.md`. If it times out or returns empty content, raise the timeout and/or token budget based on the measured behavior rather than guessing.

### M3. An open card editor can silently revert an AI change to the same card

**Location:** `frontend/src/components/KanbanCard.tsx:112-141`, `frontend/src/components/KanbanBoard.tsx:64,111-114`.

The card editor copies the title and details into local state when opened. Opening an editor does not set the board's `disabled` flag, so the AI assistant remains usable. If the assistant changes that card while the editor is open, the editor keeps showing the old values. Pressing "Save card" then writes them back. The save uses the current revision, so the server accepts it and the AI's change is overwritten without any conflict message. If the AI instead moves the card to another column, the card remounts and the open edit is discarded without notice.

**Found by inspection;** not reproduced in a test.

**Action:** Keep it simple: either disable the assistant while any card editor is open, or close open editors when the board is replaced by an AI result. Add a unit test for the chosen behavior.

### L1. Card timestamps are reset by every save

**Location:** `backend/app/database.py:168-170`; `docs/DATABASE.md`; `docs/kanban-schema.json`.

`save_board_for_user` deletes and re-inserts all cards and columns, so `cards.created_at` and `cards.updated_at` become the time of the most recent save of any part of the board. The schema and database documentation present these as meaningful columns, and the migration carefully preserves them, but normal use erases them.

**Confirmed:** after setting `created_at` to a marker value, renaming a column reset every card's `created_at` to the save time.

**Action:** Nothing reads these columns today. The simplest fix is to state in `docs/DATABASE.md` that card timestamps are not maintained, or remove them in a future schema change. Only if they are needed, preserve them by updating existing rows instead of deleting and re-inserting.

### L2. A missing API key is indistinguishable from a provider outage

**Location:** `backend/app/ai.py:285-287`, `backend/app/main.py:142-144`.

When `OPENROUTER_API_KEY` is unset, the route returns the same generic 502 as a provider failure, and the server log records only `AI provider failed: ValueError`. A user who skipped the `.env` step has no indication of the cause.

**Confirmed** with the key removed from the environment.

**Action:** Log the exception message (it contains no secret) and/or return a specific 503 such as "The assistant is not configured. Set OPENROUTER_API_KEY in .env."

### L3. A click is silently ignored when it triggers a column rename

**Location:** `frontend/src/components/KanbanColumn.tsx:53-57`, `frontend/src/components/KanbanBoard.tsx:98-123`.

A column rename saves on blur. If the user edits a title and then directly clicks another control (for example "Remove" or a "Move to" selector), the blur starts the rename save first, and the clicked action returns early because `busy.current` is set. The second action is dropped with no feedback.

**Action:** Acceptable for the MVP; if addressed, the simplest option is a brief status message rather than queuing actions.

### L4. The async AI route runs blocking SQLite calls on the event loop

**Location:** `backend/app/main.py:130-150`.

`ai_chat` is `async`, but it calls synchronous `load_board_for_user`, `require_user` and `commit_board` directly. These block the event loop, for up to the 10-second SQLite busy timeout under contention. With one local user the impact is negligible, but it is easy to avoid.

**Action:** Wrap the database calls in `await run_in_threadpool(...)` (from Starlette), or keep the route synchronous apart from the provider call.

### L5. Every board read takes a write lock

**Location:** `backend/app/database.py:106-119,147-151`.

`load_board_for_user` and `save_board_for_user` both call `ensure_seed_board`, which opens `BEGIN IMMEDIATE` and runs `INSERT OR IGNORE INTO users` on every request. Reads therefore serialize behind writes unnecessarily.

**Action:** Seed only in `init_db` and `create_session` (where users are introduced), and look up the board ID with a plain `SELECT` elsewhere.

### L6. More defensive code than the project standard allows

**Location:** `backend/app/ai.py`.

The board passed to the AI helpers has already been validated by `models.Board`, and the conversation by `models.ChatEntry`, yet the helpers repeat `isinstance` checks on every structure (`_apply_*`, `build_board_prompt`). Related leftovers:
- `generate_board_ai_response` has an unused `board is None` branch and an `openrouter_client or call_openrouter` fallback.
- `call_openrouter` repeats the empty-prompt check.
- AI-created card IDs use a different scheme (`card-N` plus `-copy` suffixes) from the frontend's `createId`.

`AGENTS.md` asks for no unnecessary defensive programming.

**Action:** Remove checks that the Pydantic models already guarantee, remove the unused branch, and generate AI card IDs the same way as the frontend (for example `card-` plus a random suffix). This should shrink `ai.py` noticeably without changing behavior. The existing tests cover these paths.

### L7. Dead and duplicated code

- `backend/static/index.html` is the original "Hello world" shell; nothing serves it.
- `frontend/src/components/LoginForm.tsx:91` exports `VALID_USERNAME`/`VALID_PASSWORD`, which nothing imports.
- `frontend/src/lib/kanban.ts:19-74` (`initialData`) is a test fixture living in production code. It duplicates `DEFAULT_BOARD` in `backend/app/database.py`, so the two can drift. The browser tests reset the board from the frontend copy.

**Action:** Delete the static shell and the unused exports, and move `initialData` into a test fixture. Optionally, have the browser tests reset from the backend seed instead.

### L8. Test gaps and one ineffective assertion

- `backend/tests/test_ai.py` (`test_all_supported_actions_and_empty_details`) deletes `card-1` after clearing its details. The details assertion therefore checks the newly added card, so clearing via `update_card_details` is not actually verified.
- No test covers M1 (AI output that fails board validation) or M2's failure modes beyond mocked shapes.
- `backend/app/ai.py:12` loads the real `.env` at import, so the developer's live API key is present in the environment during tests. Every current AI test mocks the provider, but a future test that forgets to mock would call OpenRouter with the real key, against the rule in `backend/AGENTS.md`.

**Action:** Fix the assertion to check `card-1` before deleting it, or drop the delete. Add the M1 test. In `backend/tests/conftest.py`, remove `OPENROUTER_API_KEY` from the environment (`monkeypatch.delenv`) with an autouse fixture so a missed mock fails instead of making a live call.

### L9. Container runs as root; `uv` is installed unpinned through pip

**Location:** `Dockerfile:12-23`.

The runtime image has no non-root user. On Linux hosts, the bind-mounted `backend/data/pm.db` is then created owned by root, so the user may need `sudo` to back it up or delete it. `uv` is installed with `pip install --upgrade pip uv` (unpinned) and then used once, which only partly meets the "use uv in the container" decision.

**Action:** Copy a pinned `uv` binary (for example `COPY --from=ghcr.io/astral-sh/uv:<version> /uv /bin/uv`) instead of installing it with pip. Optionally run as a non-root user, and check bind-mount ownership on Linux.

### L10. Start script error message is misleading when Docker is not on PATH

**Location:** `scripts/start.ps1:3-5`.

During this review, Docker Desktop was running, but `docker` was not on the PowerShell `PATH` (it is installed per-user under `AppData\Local\Programs\DockerDesktop`). The script would report "Start Docker Desktop and retry", which is the wrong remedy.

**Action:** Reword the message to "docker was not found on PATH. Install or start Docker Desktop, and make sure docker is on PATH."

### L11. Card deletion is immediate and irreversible

**Location:** `frontend/src/components/KanbanCard.tsx:128`.

"Remove" deletes the card on a single click, with no confirmation or undo. The AI can also delete cards. One mis-click loses the title and details permanently.

**Action:** For the MVP, a native `confirm()` before a manual delete is the simplest safeguard.

### L12. Cards cannot be dropped just above the last card of another column

**Location:** `frontend/src/lib/kanban.ts:157-166`.

When dropping onto a card in a different column, `moveCard` inserts before it, except for the last card, where it appends after. There is no drop position that places a card between a column's second-to-last and last cards. The user has to drop and then reorder within the column. Same-column reordering is unaffected.

**Action:** Low priority. If addressed, use the drag delta or dnd-kit's sortable index to decide before or after, rather than special-casing the last card.

### L13. Minor documentation, structure and accessibility items

- `review.md` is in the project root, but `AGENTS.md` places planning and review documents in `docs/`. Move it to `docs/` (and update the `.dockerignore` entry and the links in `docs/REMEDIATION.md`).
- Card titles are `h4` under an `h1`/`h2` hierarchy with no `h3`; use `h3` for card titles.
- `globals.css:38` overrides the palette's gray text (`#888888`) with `#656565` for contrast. This is a reasonable, documented choice, but `AGENTS.md` still lists `#888888`; update the color scheme note to reflect the deviation.

## Strengths worth keeping

- Static serving resolves and confines paths, rejects directories and backslash/drive paths, and is tested including symlink escapes.
- Sessions are opaque, hashed at rest, HttpOnly/SameSite=Strict, revoked on logout, and rechecked inside the same transaction that writes the board.
- Board invariants (fixed ordered columns, exactly one membership per card, ID/length limits) are enforced in one Pydantic model shared by manual and AI writes.
- Revision checks make stale tabs and slow AI responses fail loudly with 409 instead of overwriting data; the browser tests exercise both against the real API and SQLite.
- The frontend allows one write at a time, never renders writable seed data before the authoritative load, and aborts in-flight requests on logout/unmount.
- The legacy migration is transactional, repeatable and tested.

## Recommended order

1. M1: per-action field limits in the AI sanitizer, with a test.
2. M2: one manual live AI check; tune timeout/token budget only if the measurement shows a need.
3. M3: block or reset open card editors when the AI changes the board.
4. L8: neutralize the real API key in tests and fix the ineffective assertion.
5. L2, L10: clearer diagnostics for a missing API key and missing Docker on PATH.
6. L6, L7, L5: simplification pass (remove redundant checks, dead files and per-read write locks).
7. Remaining low items as convenient.
