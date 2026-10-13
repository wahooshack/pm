# Code review

Reviewed October 12, 2026 against revision `ae5bc97` (`main`). Scope: all backend code and tests, frontend source, unit/browser tests and config, Docker/Compose, scripts, docs. No application code or configuration was changed; this report is the only repository change.

## Summary

The project is in good shape. The October 8 remediation (`docs/review.md`, `docs/REMEDIATION.md`) and the October 12 follow-up review hold up under re-inspection: authentication, static-file confinement, revision-checked writes, strict board validation, server-side AI commits and test isolation are all correctly implemented. No critical or high-severity defects were found.

The two medium findings are limit/UX edge cases rather than security issues: the API's own body-size cap can permanently block manual saves of a board the validation model accepts, and an 8-hour session expiry during a failed save drops the user's pending edit without any message. The low items are consistency, diagnostics, tests and housekeeping.

| Severity | Count |
| --- | --- |
| Critical | 0 |
| High | 0 |
| Medium | 2 |
| Low | 14 |

## Scope and validation

| Check | Result |
| --- | --- |
| Backend tests (`python -m pytest backend/tests -q`) | 40 passed (1 third-party deprecation warning) |
| Frontend lint (`npm run lint`) | Passed |
| Frontend unit tests (`npm run test:unit`) | 20 passed |
| TypeScript (`npx tsc --noEmit`) | Clean |
| Production build + browser tests (`npm run test:e2e`) | Build passed; 9 passed |
| Probe: maximum-size board through `POST /api/board` | 2,543,094-byte board returned 413 (see M1) |
| Probe: `moveCard` drop position, same vs cross column | `placeAfter` ignored within a column (see L1) |
| Probe: legacy DDL at `074dcd0` vs migration `INSERT ... SELECT *` | Column order matches today (see L8) |
| Probe: `pytest backend/tests` (console script, not `python -m`) | Fails with `ModuleNotFoundError: backend` (see L10) |

Not performed: live OpenRouter calls, Docker build/startup, macOS execution, `npm audit`, load testing.

## Findings

Severity: Medium affects a required feature or can lose user changes; Low affects maintainability, diagnostics, test confidence or minor UX.

### M1. A board the validation model allows cannot be saved manually — permanent 413

**Location:** `backend/app/main.py:19,39-41` (`MAX_BODY_BYTES`), `backend/app/models.py:7` (`MAX_CARDS`, `MAX_DETAILS`), AI commit path `backend/app/main.py:151-152`.

`MAX_BODY_BYTES` is 1 MB, but the board model permits 500 cards x 5000-character details, about 2.5 MB. **Confirmed:** a valid 500-card board (JSON payload 2,543,094 bytes) returns `413 {"detail": "Request is too large."}`. The AI path is not subject to the body limit because it builds the board server-side: **confirmed** an AI-grown 2,510,613-byte board committed successfully (revision 1). After that, every manual edit to that board fails with 413 — `saveBoard` keeps the edits in `unsaved`, "Retry save" fails identically forever, and the only way out is "Discard local edits and reload", so the user's edit is lost with no path to persist it. The threshold is reachable at about 200 cards at the full details limit.

**Action:** Make the limits consistent — either raise `MAX_BODY_BYTES` above the maximal board (about 3 MB) or lower `MAX_CARDS`/`MAX_DETAILS` so the largest valid board always fits. Add a test that the maximum-size board round-trips through `POST /api/board`.

### M2. Session expiry during a failed save silently discards the user's edits

**Location:** `frontend/src/components/KanbanBoard.tsx:70-74,90-94`; `frontend/src/app/page.tsx:51`.

A 401 during a save runs `reportFailure` then `onSessionExpired()`, and `page.tsx` sets `signed-out`, which unmounts `KanbanBoard` immediately. The `setError`/`setUnsaved` updates in the same tick never render, so the user's pending edit vanishes with no "session expired" notice — the error banner they would otherwise see (with "Retry save") never appears. Reachable whenever an edit is saved after the eight-hour expiry.

**Action:** Carry a reason to the login screen (for example "Your session expired. Sign in again — your unsaved edit was not stored."), or delay the unmount until the pending state has been surfaced.

### L1. Same-column drops ignore the drop position

**Location:** `frontend/src/lib/kanban.ts:58-90`; `frontend/src/components/KanbanBoard.tsx:104-107`; tests `frontend/src/lib/kanban.test.ts:9-20`.

`handleDragEnd` computes `placeAfter` ("dropped below the middle means place after it") and `moveCard` honors it only for cross-column moves. **Confirmed by probe:** within a column, top-half and bottom-half drops produce identical results, and the outcome depends on drag direction instead — dragging down onto a card's top half lands after it (`["c2","c3","c1","c4"]`), dragging up lands before it (`["c1","c4","c2","c3"]`). Unit tests only assert cross-column placement.

**Action:** Use `placeAfter` in the same-column branch (adjusting the index for the removal) and drop the `targetIndex === cardIds.length - 1` special case; add same-column unit tests for both halves.

### L2. A stale error banner survives a successful assistant retry

**Location:** `frontend/src/components/KanbanBoard.tsx:148-151` (compare `:46` and `:85`).

Load and save successes call `setError(null)`; the AI success branch does not. After a failed assistant request followed by a successful retry, the banner still shows "The assistant request did not complete…" with a "Reload saved board" button next to a working reply.

**Action:** Clear `error` on AI success; add a unit test.

### L3. Retrying a failed assistant message duplicates it in the transcript

**Location:** `frontend/src/components/KanbanBoard.tsx:139-156`.

On failure only `aiPrompt` is restored; the user message appended at line 141 stays in `conversation`. Resubmitting appends the same text again, so the visible transcript — and the history sent to the model on the retry — contains the request twice.

**Action:** Remove the last user message on failure, or append it only on success.

### L4. `actions` / `rejectedActions` are computed but never used by the client

**Location:** `backend/app/main.py:157-158`; `frontend/src/components/KanbanBoard.tsx:144`.

The response carries applied and rejected action lists, but the client types the payload as `{response, board}` only. The user cannot see what the assistant actually changed (for example an unintended `delete_card`) beyond watching the board move, and any applied/rejected summary disappears once the model's own message is displayed.

**Action:** Either display a short server-derived summary ("3 changes applied: moved…, deleted…; 1 skipped") or drop the fields from the response contract.

### L5. Provider output truncation surfaces as a generic 502

**Location:** `backend/app/ai.py:211` (`max_tokens: 4000`), `:224-244`.

`call_openrouter` never inspects `choices[0].finish_reason`. If the model hits the token budget, the JSON is cut off, `parse_structured_ai_response` raises, and the user gets `502 The assistant is unavailable or returned an invalid response.` — misleading for a "reply too long" case, and retrying unchanged reproduces it.

**Action:** Detect `finish_reason == "length"` and return a specific message (for example "The assistant's reply was too long — ask for fewer changes"), or raise `max_tokens`.

### L6. `api()` assumes every response body is JSON

**Location:** `frontend/src/lib/api.ts:15-19`.

`await response.json()` runs before the `ok` check. A non-JSON error body (gateway/proxy error, empty body) throws `SyntaxError`, so callers' `cause instanceof ApiError` checks fail — including the 401 session-expiry detection at `KanbanBoard.tsx:50,71` — and the user gets a generic message with no sign-out.

**Action:** Parse with `await response.json().catch(() => null)` and build the `ApiError` from `response.status` regardless.

### L7. No cache policy for static assets and no security headers

**Location:** `backend/app/main.py:77-81`.

`Cache-Control: no-store` is set only for `/api/`; the exported `index.html` and hashed `_next/static` assets get no caching guidance, so a browser may heuristically serve a stale shell after an upgrade (stale HTML referencing removed hashed chunks). Only `X-Content-Type-Options` is set; there is no frame or referrer policy.

**Action:** `no-cache` for HTML, `public, max-age=31536000, immutable` for `_next/static`, plus `X-Frame-Options: SAMEORIGIN` and `Referrer-Policy: same-origin`.

### L8. Migration copies rows positionally with `INSERT ... SELECT *`

**Location:** `backend/app/database.py:93-94`.

Verified correct against the legacy DDL at `074dcd0` (identical column order) and covered by the migration test, but positional copies silently mis-map data if either schema's column order ever changes.

**Action:** Name the columns explicitly in both `INSERT` statements, matching `_write_rows`' style.

### L9. Board reads rely on a subtle ordering property

**Location:** `backend/app/database.py:136-139`.

Cards are selected `ORDER BY position` across the whole board while positions restart per column, so the result interleaves columns; per-column order survives only because the list comprehension filters afterwards. It is correct, just fragile to read.

**Action:** Use `ORDER BY column_id, position` — no behavior change, intent explicit.

### L10. Tests only run via `python -m pytest`, and the `sys.path` hack is ineffective

**Location:** `backend/tests/test_ai.py:9`; no pytest config file.

`sys.path.insert(0, parents[1])` adds `backend/` (exposing `import app`, which nothing uses); the tests import `backend.app.*` and get the project root from `python -m pytest`. **Confirmed:** running `.venv\Scripts\pytest.exe backend/tests` fails with `ModuleNotFoundError: No module named 'backend'`, and that insert does not fix it.

**Action:** Remove line 9 and add a minimal pytest config (`[tool.pytest.ini_options] pythonpath = ["."]`) so both invocation styles work.

### L11. Schema document drifts from the DDL

**Location:** `docs/kanban-schema.json:133-139,191-197`.

Both entries list `DEFAULT 0` for `columns.position` and `cards.position`; `COLUMN_SQL`/`CARD_SQL` declare `position INTEGER NOT NULL` with no default (values always come from `_write_rows`).

**Action:** Drop the `DEFAULT 0` entries or add the defaults to the DDL.

### L12. No continuous integration

All gates — backend tests, lint, TypeScript, unit tests, production build, browser tests — are manual commands documented in `README.md`/`CLAUDE.md`. Nothing runs them on push, so regressions can land unnoticed.

**Action:** Add a minimal workflow running the five documented commands; the suites are fast (backend 0.8 s, unit 5 s, e2e about 18 s).

### L13. Seed board is defined twice

**Location:** `frontend/src/test/fixtures.ts:3` and `backend/app/database.py:12-30`.

The comment acknowledges the mirror, but drift would break the browser suite in confusing ways (the earlier optional suggestion to reset from the backend seed was not taken).

**Action:** Accept for now, or have `kanban.spec.ts`'s `beforeEach` fetch/reseed through the API instead of posting the fixture.

### L14. Repository housekeeping

- `docs/code_review.md` is deleted in the working tree (unstaged) while `docs/REMEDIATION.md:60` still links to it. Restore it, or update the references when this report lands.
- `backend/tests/__pycache__/` and `frontend/tsconfig.tsbuildinfo` exist on disk; both are ignored — fine, just noting they are not part of the repository state.

## Strengths worth keeping

- Static serving resolves and confines paths, rejects backslash/drive paths, and is tested including symlink escapes.
- Sessions are opaque, hashed at rest, HttpOnly/SameSite=Strict, revoked on logout, and re-validated inside the same transaction that writes the board.
- Board invariants live in one Pydantic model shared by manual and AI writes; the AI sanitizer enforces the same field limits per action so valid actions in a batch still commit.
- Revision checks make stale tabs and slow AI responses fail loudly with 409; the browser suite exercises both against real FastAPI/SQLite.
- The client allows one mutation at a time, never renders seed data before the authoritative load, blocks manual writes while an AI request is pending, and aborts in-flight requests on unmount.
- Test hygiene is genuinely good: `OPENROUTER_API_KEY` is removed for all backend tests via an autouse fixture, e2e runs an isolated database on port 8765 with only the provider mocked, and the browser suite covers login/logout revocation, both drag and keyboard movement, persistence across reload, two-tab conflicts and delayed-AI conflicts.

## Accepted for the MVP (not findings)

- Hardcoded single credential with no rate limiting; the cookie lacks `Secure` because the app is HTTP on loopback.
- The container still runs as root (deferred in the prior review: bind-mount UID matching could not be verified on this host).
- Card `created_at`/`updated_at` reset on every save (documented in `docs/DATABASE.md` and the schema).
- `docs/PLAN.md` still lists three open environment-dependent items (Docker file sharing, macOS run, final user review).

## Recommended order

1. M1: reconcile `MAX_BODY_BYTES` with the board model limits, with a maximum-size round-trip test.
2. M2: surface session expiry instead of silently dropping the pending edit.
3. L1: honor `placeAfter` for same-column drops, with unit tests for both halves.
4. L2, L3, L6: small client fixes (clear the error on AI success, deduplicate the retried message, tolerate non-JSON errors).
5. L4, L5: assistant transparency (surface applied actions, detect truncated replies).
6. L7-L11: header/caching, migration and ordering clarity, pytest config, schema doc.
7. L12-L14: CI and housekeeping.
