# Frontend agent guide

This directory contains the web frontend for the project management MVP.

## Current state

The app is a working client-side Kanban demo built with Next.js, React, TypeScript, and the dnd-kit drag-and-drop library. The project is not yet integrated with the FastAPI backend or Docker environment; it currently runs as a standalone frontend experience.

## App structure

- `src/app/page.tsx`: main page entry; renders the Kanban board.
- `src/components/KanbanBoard.tsx`: top-level board UI, state management, drag start/end handlers, add/delete card logic.
- `src/components/KanbanColumn.tsx`: renders each column, handles drop zones, card lists, and add-card form.
- `src/components/KanbanCard.tsx`: draggable card item with delete button.
- `src/components/KanbanCardPreview.tsx`: overlay for drag preview while dragging a card.
- `src/components/NewCardForm.tsx`: form used to add a card to a column.
- `src/lib/kanban.ts`: board model, seed data, card movement logic, helper functions such as `moveCard` and `createId`.
- `tests/`: UI and logic tests for the Kanban behavior.

## Key behavior already implemented

- Five fixed Kanban columns with editable titles.
- Cards can be moved between columns using drag and drop.
- Cards can be added and removed.
- Board state is stored in local React state.
- Drag preview is shown while dragging.
- Styling uses a custom palette defined in the root project AGENTS.md.

## Tests and validation

Use the package scripts defined in `package.json`:

- `npm run test` or `npm run test:unit`: run unit tests
- `npm run test:e2e`: run Playwright end-to-end tests
- `npm run build`: verify the production build
- `npm run lint`: run ESLint checks

## Working conventions

- Keep the app simple and consistent with the project requirements.
- Prefer small, direct changes over broad rewrites.
- Preserve the existing CSS and color-system conventions.
- Do not add backend dependencies or new architecture patterns unless a later plan step requires them.
- When adding functionality for the backend integration phase, keep the frontend behavior consistent with the persistent API model.

## Important notes

- The current board is purely client-side; no authentication or API persistence is yet implemented.
- The root project plan expects the frontend to later be served by the FastAPI backend, with login gating and integration to a SQLite-backed Kanban model.
- The existing UI should be treated as the base experience to preserve while adding persistence, login flow, AI chat, and Docker packaging.
