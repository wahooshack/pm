# Frontend guide

Next.js/React/TypeScript with dnd-kit. Production uses static export served by FastAPI. See the root README for startup; Next development alone has no backend API.

- `src/app/page.tsx`: restores the backend session, authenticates login, revokes logout.
- `src/lib/api.ts`: same-origin JSON API calls and controlled errors.
- `src/lib/kanban.ts`: board types (including revision), seed fixture, movement helpers.
- `src/components/KanbanBoard.tsx`: authoritative loading, one in-flight mutation, explicit retry/reload, server-committed AI results.
- `KanbanColumn.tsx`: fixed columns; rename on blur/Enter, Escape to cancel.
- `KanbanCard.tsx`: card editor, drag handle, keyboard-accessible movement and removal.
- `tests/`: real exported-frontend/FastAPI/SQLite integration, with only the provider mocked.

Never treat browser storage as authorization. Do not render writable seed data during loading/failure, send stale full-board snapshots without revisions, or POST an AI replacement from the client. Abort pending requests on unmount. Preserve the palette, readable text, explicit control labels, and keyboard operation.

Checks: `npm run lint`, `npm run test:unit`, `npm run test:e2e` (includes production build). E2E needs root `.venv` with development requirements; it owns port 8765 and must not reuse an unrelated server. Runtime/build/report files are ignored.
