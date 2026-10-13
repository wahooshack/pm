# Assessment of `docs/oc_code_review.md`

Reviewed October 12, 2026 against revision `ae5bc97` (`main`). Each finding in `docs/oc_code_review.md` was checked against the cited code. No application code was changed.

## Summary

| ID | Verdict | Notes |
| --- | --- | --- |
| M1 | Agree | Real limit mismatch; the proposed 3 MB fix is too small because of multi-byte UTF-8 |
| M2 | Agree | Real; fixed (non-sliding) 8-hour sessions make it more likely than it sounds |
| L1 | Disagree | Same-column behavior is standard dnd-kit sortable semantics and matches the live preview |
| L2 | Disagree | The error is already cleared when the next assistant request starts |
| L3 | Agree | Transcript and model history both duplicate the retried prompt |
| L4 | Partially agree | True but a product choice; either option is fine |
| L5 | Agree | Low-cost diagnostic improvement |
| L6 | Agree | Most useful of the low items: it also breaks 401 detection |
| L7 | Partially agree | Cache headers worthwhile; frame protection mostly covered by SameSite=Strict |
| L8 | Agree | Hardening only |
| L9 | Agree | Cosmetic |
| L10 | Agree | Confirmed |
| L11 | Agree | Confirmed |
| L12 | Agree | Low priority for an MVP, but cheap |
| L13 | Agree | Accept as is |
| L14 | Agree | Decide whether the deletion of `docs/code_review.md` is intentional |

Net: 2 medium and 12 low findings stand (some with adjusted remedies); 2 low findings (L1, L2) should be dropped.

## Findings

### M1. Body-size cap vs. board model limits — Agree, with a corrected remedy

The arithmetic checks out: `MAX_BODY_BYTES = 1024 * 1024` (`backend/app/main.py:19`) while `models.py:7` allows 500 cards x 5000-character details (about 2.5 MB of ASCII). The AI path is not subject to `LimitRequestBody` because the board is built server-side (`main.py:151-152`).

Two refinements:

- **Reachability is narrower than stated.** The manual path alone cannot create the stuck state: every saved board passed through the 1 MB cap, so at worst the one edit that crosses the line fails and "Discard local edits and reload" restores a valid board. The permanent 413 only occurs after the assistant grows the board past 1 MB. At `max_tokens: 4000` per reply that takes dozens of turns, and the full board is embedded in every prompt, so the model would likely hit its context limit first. The inconsistency is real and a stuck board can't even delete cards manually, so Medium is fair, but it is an edge case.
- **The proposed "about 3 MB" is not enough.** Pydantic `max_length` counts code points, not bytes. CJK text is 3 bytes per character in UTF-8 and emoji are 4, so the worst-case valid board is roughly 500 x 5000 x 4 = 10 MB plus titles. Either size the cap from the worst-case byte count (about 11 MB) or, simpler and better for the AI prompt size, lower `MAX_CARDS`/`MAX_DETAILS` so the worst-case board fits under the existing cap. A cheaper alternative is to have the AI commit path reject boards whose serialized size exceeds `MAX_BODY_BYTES`, which guarantees every stored board can be saved manually.

The suggested max-size round-trip test is good; use multi-byte characters in it.

### M2. Session expiry during a failed save drops the edit silently — Agree

Confirmed: `reportFailure` (`KanbanBoard.tsx:70-74`) calls `expired.current?.()`, which runs `setStatus("signed-out")` in `page.tsx:51`. React batches that with `setUnsaved`/`setError`, so `KanbanBoard` unmounts and the login form appears with no explanation. The same applies to the load path at `KanbanBoard.tsx:50`.

It is more reachable than "after eight hours" suggests: `auth.py` sets a fixed expiry at login and `require_user` never extends it, so someone who signs in in the morning and keeps working is signed out mid-session regardless of activity. Passing a reason to the login screen (`page.tsx` already has an `error` slot) is the right, small fix. Optionally, consider a sliding expiry.

### L1. Same-column drops ignore `placeAfter` — Disagree

The probe results are accurate, but the behavior is intended and correct. Cards are rendered in a `SortableContext` with `verticalListSortingStrategy` (`KanbanColumn.tsx:70`). During a same-column drag, dnd-kit shifts the sibling cards to preview the final position, and the result is `arrayMove(oldIndex, overIndex)`. Moving down lands after the target and moving up lands before it, which is what the user sees just before dropping. `over.rect` is also the target's pre-drag measured rect, not its shifted position, so applying `placeAfter` here would make the drop disagree with the preview.

`placeAfter` exists for cross-column drops, where the target column has no preview because the dragged card isn't in that `SortableContext`.

Two parts are still worth doing:

- The `targetIndex === activeColumn.cardIds.length - 1` special case (`kanban.ts:79-81`) is dead code: when the target is the last card, `targetIndex` already equals `nextCardIds.length` after the removal. It can be removed.
- Adding a same-column unit test for a downward move (only an upward move is covered today) would pin the arrayMove behavior.

### L2. Stale error banner after a successful assistant retry — Disagree

`handleAiSubmit` calls `setError(null)` at the start of every request (`KanbanBoard.tsx:138`), so the previous failure's banner is cleared before the retry is sent. The only other errors that could be showing come with `unsaved` or `conflict` set, and both disable the assistant (`aiDisabled`, line 68), so a submit can't happen while those banners are visible. No fix is needed.

### L3. Retried assistant message is duplicated — Agree

Confirmed. On failure, `userMessage` stays in `conversation` and `aiPrompt` is restored. On resubmit the old message is in `conversation`, which is sent as history (line 146), and the same text goes out again as `prompt`. The model sees the request twice and the transcript shows it twice. Removing the trailing user message in the `catch` block is the minimal fix.

### L4. `actions` / `rejectedActions` unused by the client — Partially agree

Accurate: the client types the response as `{ response, board }` (line 144) and no API test asserts on these response fields. The backend still needs `result["actions"]` internally to decide whether to commit (`main.py:151`). Whether to show a summary is a product decision, not a defect. Showing rejected actions would help users when the model claims to have done something it didn't. If no UI is planned, dropping the fields from the response is the simpler contract.

### L5. Truncated provider output reported as a generic 502 — Agree

Confirmed: `call_openrouter` (`ai.py:224-245`) never reads `finish_reason`. Truncated JSON fails parsing and becomes the generic 502. A specific message for `finish_reason == "length"` is cheap. Low severity is right.

### L6. `api()` parses JSON before checking `ok` — Agree

Confirmed (`api.ts:15`). A non-JSON error body throws `SyntaxError`. That loses the status code and breaks the `ApiError` 401/409 handling in `KanbanBoard.tsx` and `page.tsx`. A proxy returning an HTML 401/502 page, or an empty 413 from an upstream proxy, would produce a generic error instead of sign-out or conflict handling. This is the most valuable of the low items. The suggested `.catch(() => null)` plus a status-based `ApiError` is correct.

### L7. No cache policy for static assets; minimal security headers — Partially agree

Caching: agreed. `FileResponse` sends `Last-Modified`/`ETag` with no `Cache-Control`, so browsers may heuristically cache `index.html` and serve a stale shell after a rebuild. `no-cache` for HTML and `immutable` for `_next/static/` is a small, safe change.

Security headers: lower value than implied. The session cookie is `SameSite=Strict`, so a cross-site page that frames the app gets an unauthenticated frame, which largely defeats clickjacking. `X-Frame-Options`/`frame-ancestors` and `Referrer-Policy` are harmless defense in depth, but not a gap that matters for a loopback MVP.

### L8. Migration uses positional `INSERT ... SELECT *` — Agree

The code is correct today, as the reviewer verified. Naming the columns is cheap hardening. Note that this path only runs for databases created before board-scoped IDs, so the practical risk is very low.

### L9. Cards ordered by `position` across the whole board — Agree

Correct as written, because positions are unique within a column and the comprehension filters per column. `ORDER BY column_id, position` states the intent better. Cosmetic.

### L10. Tests only work via `python -m pytest` — Agree

Reproduced: `.venv/Scripts/pytest.exe backend/tests -q` fails with `ModuleNotFoundError: No module named 'backend'` from `conftest.py:4`. The `sys.path.insert` in `test_ai.py:9` adds `backend/`, not the project root, so it has no effect on `backend.app.*` imports. Removing it and adding a `pythonpath = ["."]` pytest config is correct. `CLAUDE.md` documents `python -m pytest`, so this is a convenience fix, not a broken workflow.

### L11. Schema doc lists `DEFAULT 0` for positions — Agree

Confirmed at `docs/kanban-schema.json:137` and `:196`. `COLUMN_SQL`/`CARD_SQL` have no default. The `DEFAULT 0` at line 98 (`boards.revision`) is correct and should stay. Fix the documentation rather than the DDL, since positions are always written explicitly.

### L12. No CI — Agree

There is no `.github/` directory, and the repository has a GitHub remote. The suites are fast, so a workflow is cheap. The e2e job needs `npx playwright install --with-deps chromium`. Low priority for a single-developer MVP.

### L13. Seed board defined twice — Agree

Accept for now. The comment in `fixtures.ts` makes the coupling explicit and a drift would fail loudly in e2e.

### L14. Repository housekeeping — Agree

`docs/code_review.md` is deleted in the working tree, but `docs/REMEDIATION.md:60` still cites it ("From `docs/code_review.md`:"). It records the previous review that the October 12 remediation addresses, so restoring it (`git restore docs/code_review.md`) seems the better choice than editing the reference, unless the deletion was deliberate. `docs/oc_code_review.md` itself is untracked; commit it if it is meant to be kept. The note about ignored `__pycache__`/`tsbuildinfo` needs no action.

## Recommended order

1. M2 and L6 together: both concern correct handling of 401 and failed responses on the client.
2. M1: cap the serialized board size on the AI commit path (or lower the model limits), with a multi-byte max-size test.
3. L3, L5, L10, L11: small, isolated fixes.
4. L7 (cache headers), L8, L9, and removing the dead branch noted under L1.
5. L4 and L12 as product/process decisions; L14 when committing the review documents.
6. Drop L1 (behavior change) and L2.
