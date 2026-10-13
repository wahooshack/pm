# Review remediation

The user authorized all recommended changes from `docs/review.md` on October 8, 2026. The original report remains a historical record of revision `074dcd0`.

## Implemented

| Review finding | Resolution |
| --- | --- |
| 1: static traversal | Resolve paths, confine them to the export, require files, handle directory indexes, return 404 for missing assets. |
| 2: authentication | Server-issued opaque sessions, hashed tokens, HttpOnly/SameSite cookies, API ownership from session, logout revocation and loopback publishing. |
| 3: overlapping writes | One browser mutation in flight; rename on blur/Enter; atomic board revision checks across clients; explicit retry/reload. |
| 4: stale AI | Server loads and commits the authoritative board; rechecks revision/session after the provider call; client blocks manual writes and aborts on unmount. |
| 5: seed overwrite | No writable board until authoritative loading succeeds; failure offers retry without seed data. |
| 6: board corruption | Strict nested models, fixed ordered columns, ID/type/length limits and exactly one membership per card before writes. |
| 7: Docker export hidden | Mount only data, retain the image export and use locked dependency installation. |
| 8: multi-user IDs | Transactional migration to board-scoped composite keys and scoped card-to-column foreign keys; preserve legacy data. |
| 9: dropped actions | Dispatch all six action types; allow empty details; distinguish applied/rejected actions; reject malformed output. |
| 10: editing | Manual card title/details editor, Save and Cancel. |
| 11: platform startup | All scripts manage Compose project pm-mvp; Windows checks native exit codes and preserves working directory. |
| 12: unsafe stop | Stop only the named Compose project; no port-based process killing. |
| 13: provider boundary | Bounded JSON bodies/history/prompts/output, strict request models, controlled 502/504 errors, success only after persistence. |
| 14: accessibility | Dedicated drag handle/keyboard sensor, Move to selector, labelled controls, focus outline and readable supporting text. |
| 15: lint | Session restoration is asynchronous; current TypeScript/React Hooks/accessibility checks replace the vulnerable lint dependency chain. |
| 16: artifacts | Database backup retained locally and removed from Git tracking; runtime/report ignores, Docker exclusions, pinned runtime/test dependency separation. |
| 17: integration/documentation | Updated guides/schema/README/plan; browser suite uses exported frontend, real FastAPI and SQLite with only the provider mocked. |

System fonts replace network-downloaded fonts, making production builds independent of Google Fonts. Frontend dependencies were audited and upgraded after the first image build exposed additional vulnerabilities. Updated backend runtime packages are validated in a separate virtual environment because the existing native server locks its executable.

## Validation

Validated on October 8, 2026:

| Check | Result |
| --- | --- |
| Backend tests on current pinned packages | 37 passed; one Starlette test-client deprecation warning. |
| Frontend unit tests on Vitest 5 | 18 passed. |
| Exported frontend/FastAPI/SQLite browser integration | 8 passed, including login revocation, manual editing, pointer and keyboard movement, AI persistence, stale-tab rejection and delayed AI conflicts. |
| TypeScript and production export | Passed with Next 16.4.0 / React 19.3.0; no font downloads. |
| TypeScript/React Hooks/accessibility lint | Passed. |
| Frontend dependency audit | Zero reported vulnerabilities after updates; also confirmed by the clean Docker npm-ci install. |
| Docker image build and startup | Passed with Node 24 / Python 3.12 and pinned backend runtime dependencies. |
| Docker static serving and security | Export served; anonymous board access rejected; traversal returned 404; image excludes .env, backend tests and pytest. Only data is mounted, with loopback port publishing. |
| Docker migration and recreation | A copied legacy database retained every card ID/title; a board update survived container recreation. The isolated container/network were removed afterward. |
| Platform scripts | PowerShell parser and Linux Bash syntax checks passed. Unix files use LF, enforced by .gitattributes. |
| Repository checks | git diff --check passed. Runtime databases and generated reports are no longer tracked. |

The user's `.env` values and original local database are preserved. A backup is retained at `backend/data/pm.pre-remediation.sqlite3`. Only removal from Git tracking is staged for that database and the old generated test report; the files remain on disk.

### Practical limits

- Docker Desktop must be able to share the checkout's data directory for the production bind mount. This environment could not read the workspace bind source directly, so the legacy database was copied into the isolated test container through Docker's API. Migration and persistence passed there; direct host-file sharing still requires working Docker Desktop configuration.
- The actual macOS lifecycle was not run. Bash syntax was checked in Linux, and the scripts call the same project-scoped Compose lifecycle verified by the Docker test.
- Automated tests mock the provider. Live OpenRouter was revalidated manually on October 12, 2026 (below).
- The original native virtual environment was retained/restored after its locked Uvicorn executable prevented an upgrade. Current pinned dependencies were tested in `D:/projects/pm-validation-venv`; the Docker image installs those versions cleanly. Stop native preview processes before upgrading that original environment. Restart the app to load the remediated code.

The updated API requires a backend session and board revision; old unauthenticated clients and username-selected writes are intentionally unsupported. Invalid/stale writes return 422/409 without changing the authoritative board.

## Code review medium findings (October 12, 2026)

From `docs/code_review.md`:

| Finding | Resolution |
| --- | --- |
| M1: one over-long AI field failed the whole batch with 502 | Board limits are defined once in `models.py`; the AI sanitizer rejects over-limit titles/details and adds beyond the card cap per action, so valid actions still commit. Tests cover a mixed batch and the card cap. |
| M2: live AI path unverified | Measured, no code change needed (see below). |
| M3: an open card editor could revert an AI change | Editor state is lifted to the board, one editor at a time; the assistant is disabled with an explanation while an editor is open. Unit test added. |

Validation: backend 39 passed; frontend lint, TypeScript and 19 unit tests passed; production build and 8 browser tests passed; Docker image rebuilt, healthy, smoke test passed, existing board untouched.

Live OpenRouter (`nvidia/nemotron-3-super-120b-a12b:free`, real key, isolated temporary database): 7 of 7 requests succeeded in 2.2-5.3 seconds, covering move, add, rename/delete, a six-action batch, long generated details, a follow-up relying on conversation history, and a read-only question (no write, revision unchanged). Every returned board matched the stored board. A direct provider call from inside the Docker container succeeded in 1.0 seconds. The 30-second timeout and 4000-token budget are adequate at these latencies.

## Code review low findings (October 12, 2026)

| Finding | Resolution |
| --- | --- |
| L1: card timestamps reset by every save | Documented in `docs/DATABASE.md` and the schema; nothing reads them, so the save path is unchanged. |
| L2: missing API key looked like an outage | The provider wrapper raises a dedicated error; the API returns 503 naming `OPENROUTER_API_KEY`, and provider failures are logged with their message. Tested. |
| L3: a click during a blur-triggered rename is ignored | Accepted for the MVP. The rename save takes milliseconds locally, and queuing actions would add complexity the standards rule out. |
| L4: blocking SQLite on the event loop | Database calls in the AI route run in the threadpool. |
| L5: every read took a write lock | Reads and writes look up the board with a plain query in their own transaction; seeding happens only at startup and sign-in. |
| L6: redundant defensive code in `ai.py` | Removed checks already guaranteed by the Pydantic models, the unused no-board branch and duplicate prompt checks; AI card IDs are random like the frontend's. Model output is still fully sanitized. |
| L7: dead and duplicated code | Removed `backend/static/index.html` and unused credential exports; the seed board moved to `frontend/src/test/fixtures.ts`. |
| L8: test gaps | Tests run with `OPENROUTER_API_KEY` removed (autouse fixture); the supported-actions test now verifies clearing details on the edited card. |
| L9: unpinned uv, root container | uv is copied from the pinned `ghcr.io/astral-sh/uv:0.13.0` image. The container still runs as root: on Linux a non-root user cannot write a bind-mounted data directory created by root unless UIDs match, and that could not be verified on this Windows host. |
| L10: misleading Docker message | Start scripts say docker was not found on PATH. |
| L11: one-click irreversible delete | Removal asks for confirmation. Unit and browser tests cover it. |
| L12: no drop position above another column's last card | Drops onto a card in another column go before or after it based on the drop position. Unit and browser tests added. |
| L13: structure and accessibility | `review.md` moved to `docs/`; card titles are `h3`; `AGENTS.md` notes the darker supporting-text gray. |

Validation: backend 40 passed; frontend lint, TypeScript and 20 unit tests passed; production build and 9 browser tests passed; Docker image rebuilt with pinned uv, healthy, smoke test passed, existing board untouched. Live OpenRouter: 7 of 7 scenarios succeeded in 1.5-8.1 seconds against the simplified `ai.py`, and a provider call from inside the container succeeded.
