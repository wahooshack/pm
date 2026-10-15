# Frontend guide

Next.js/React/TypeScript with dnd-kit. Production uses static export served by FastAPI. See the root README for startup; Next development alone has no backend API.

- `src/app/page.tsx`: restores the backend session, signs in or registers (`LoginForm.tsx`), revokes logout.
- `src/lib/api.ts`: same-origin JSON API calls (including DELETE with a JSON body) and controlled errors.
- `src/lib/kanban.ts`: board types (including revision and role) and movement helpers; `cards.ts` card-field helpers; `filters.ts` card filtering. The seed board for tests is in `src/test/fixtures.ts`.
- `Workspace.tsx`: board list, current board (last board remembered in localStorage as a convenience), create/delete, and board/profile/admin views; `AppHeader.tsx`, `MembersPanel.tsx`, `ProfilePanel.tsx`, `AdminPanel.tsx`.
- `src/components/KanbanBoard.tsx`: authoritative loading, one in-flight mutation, explicit retry/reload, server-committed AI results, board rename, column controls, filters and viewer read-only mode.
- `KanbanColumn.tsx`: rename on blur/Enter, Escape to cancel; move left/right; delete when empty.
- `KanbanCard.tsx`: card editor with due date, priority, labels and assignee (one open at a time; the assistant is disabled while it is open), drag handle (disabled while filtering), keyboard-accessible movement and confirmed removal.
- `tests/`: real exported-frontend/FastAPI/SQLite integration, with only the provider mocked; shared helpers in `tests/helpers.ts`.

Never treat browser storage as authorization. Do not render writable seed data during loading/failure, send stale full-board snapshots without revisions, or POST an AI replacement from the client. Abort pending requests on unmount. Preserve the palette, readable text, explicit control labels, and keyboard operation.

Checks: `npm run lint`, `npm run test:unit` (or `npm run test:coverage` with thresholds), `npm run test:e2e` (includes production build). Browser tests reset the database before each test; wait for the board (not the app header) before acting in a newly opened tab. E2E needs root `.venv` with development requirements; it owns port 8765 and must not reuse an unrelated server. Runtime/build/report files are ignored.
