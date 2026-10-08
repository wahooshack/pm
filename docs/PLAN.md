# Project plan

This plan breaks the MVP into sequential parts with explicit acceptance criteria, test expectations, and execution checklists. The work should proceed in order unless a later phase explicitly depends on earlier work.

## Part 1: Planning and repository handoff

Goal: confirm the implementation approach, document the current frontend state, and align the project structure before any code changes.

Checklist
- [x] Review the root project requirement document and confirm scope.
- [x] Review the existing frontend implementation and identify the current Kanban demo behavior.
- [x] Create a frontend-focused AGENTS.md file that documents current code and test entry points.
- [ ] Review the detailed plan below with the user and obtain approval before modifying the app.

Tests and success criteria
- The project has a clear architecture summary in the repo.
- The frontend AGENTS.md reflects actual files and current behavior.
- The user understands the intended phases and milestones before implementation begins.

## Part 2: Scaffolding the app runtime

Goal: establish the local run environment with Docker, FastAPI backend, and helper scripts. The backend should serve a sample page and a sample API response before app integration begins.

Checklist
- [x] Create the Docker configuration for the combined app stack.
- [x] Add the Python FastAPI backend package structure under `backend/`.
- [x] Add backend startup configuration and health route(s).
- [x] Create start and stop scripts in `scripts/` for the supported platforms.
- [x] Confirm the app serves a basic HTML page at `/` and an API response at `/api/health` or equivalent.
- [x] Validate the local container or local process starts successfully.

Tests and success criteria
- `curl` or browser checks confirm the app is reachable on localhost.
- HTTP response from the backend is successful and includes the expected JSON.
- The startup script can be rerun without manual damage to the environment.

## Part 3: Frontend serving and static app integration

Goal: integrate the existing Next.js frontend into the production-serving path so it is displayed at `/` when the backend runs.

Checklist
- [x] Configure the backend to serve the built frontend static output.
- [x] Ensure the frontend production build works with the backend deployment pattern.
- [x] Verify the Kanban demo page renders at `/` without requiring a separate dev server.
- [x] Add or update tests for the static integration path.

Tests and success criteria
- Production build succeeds.
- The root page loads and shows the Kanban board UI.
- The app runs from the backend container rather than only from the frontend dev environment.

## Part 4: Fake sign-in flow

Goal: add the required login gate before the Kanban board is visible, using the dummy credentials `user` and `password`.

Checklist
- [x] Add a login screen that appears on first load when unauthenticated.
- [x] Require the hardcoded credentials to access the board.
- [x] Add logout behavior that clears the session state.
- [x] Prevent the Kanban board from being visible without valid authentication.
- [x] Add unit and component tests for the authenticated and unauthenticated states.

Tests and success criteria
- Unauthenticated users cannot view the board.
- Valid credentials allow access.
- Logout returns the user to the login state.
- Session behavior is reliable and testable.

## Part 5: Database modeling and schema approval

Goal: model the Kanban data shape in a SQLite-friendly structure and document it for approval before API integration.

Checklist
- [x] Define the board schema for users, columns, cards, and card movement data.
- [x] Save the schema proposal to a JSON file under `docs/`.
- [x] Document the database approach and assumptions in the docs folder.
- [x] Confirm the schema supports future multi-user expansion without increasing current MVP complexity.
- [x] Present the schema for user signoff before implementation continues.

Tests and success criteria
- Schema JSON is valid and internally consistent.
- The design supports one board per user for MVP and can be extended to multiple users later.
- The user reviews and approves the database approach before backend persistence work.

## Part 6: Backend API for Kanban persistence

Goal: expose API routes that allow reading and writing the Kanban board for a given user, using SQLite and auto-creating the database if needed.

Checklist
- [ ] Create the SQLite database layer and schema initialization logic.
- [ ] Add routes to fetch the user’s board state.
- [ ] Add routes to update columns and card data for a given user.
- [ ] Ensure the database is created automatically when absent.
- [ ] Validate the API with backend unit and integration tests.

Tests and success criteria
- Database initializes with no manual setup.
- CRUD-style API calls behave correctly for board state.
- Edge cases such as empty boards and missing users are handled predictably.
- Backend tests pass consistently.

## Part 7: Frontend-to-backend persistence

Goal: replace local React-only state with backend-backed board data so the Kanban persists across refreshes and user sessions.

Checklist
- [ ] Connect the frontend to the backend API for loading the board.
- [ ] Save board updates after card moves, renames, and deletions.
- [ ] Handle loading and error states gracefully.
- [ ] Ensure the app behaves correctly after a refresh.
- [ ] Run end-to-end validation for the full board workflow.

Tests and success criteria
- The board loads from backend data.
- Local interactions persist correctly.
- The same user sees consistent board state after refresh.
- UI tests and API tests both pass.

## Part 8: AI connectivity

Goal: enable backend access to OpenRouter and verify networking, authentication, and model call functionality using a simple prompt.

Checklist
- [ ] Configure the backend environment to use the OpenRouter API key.
- [ ] Add a minimal AI connectivity endpoint or service wrapper.
- [ ] Validate a simple `2 + 2` or equivalent prompt returns a supported response.
- [ ] Confirm the chosen model and API configuration are working.

Tests and success criteria
- The backend can call OpenRouter successfully.
- The response is returned in a format the app can handle.
- The AI service is proven working before integration into the Kanban workflow.

## Part 9: AI structured board-aware assistant

Goal: integrate AI into the Kanban workflow by sending board JSON, the user request, and conversation context, and requiring structured output that can include both a text response and board edits.

Checklist
- [ ] Build the prompt payload with the current board state and user message.
- [ ] Include conversation history in the AI request.
- [ ] Require structured output fields for text response and optional board update actions.
- [ ] Parse AI results and apply valid board updates safely.
- [ ] Add tests covering valid updates, invalid payloads, and no-op responses.

Tests and success criteria
- AI responses include both a user-facing message and optional board modifications.
- Invalid or partial AI outputs do not corrupt board state.
- Structured outputs are validated before board changes are applied.

## Part 10: AI chat sidebar and automatic refresh

Goal: deliver the full MVP user experience with a chat sidebar, AI-driven updates, and automatic refresh of the board when the assistant changes tasks.

Checklist
- [ ] Add a sidebar AI chat widget to the authenticated frontend.
- [ ] Send user prompts to the backend AI route.
- [ ] Render the AI response in chat history.
- [ ] Apply structured board change instructions from the AI when valid.
- [ ] Refresh the frontend board automatically after AI-driven card edits or moves.
- [ ] Run the full UI and backend validation suite.

Tests and success criteria
- The user can request board operations through the chat interface.
- AI changes are reflected in the current Kanban state without a manual page reload.
- The experience works end-to-end with authentication, persistence, and AI integration.

## Release gate

Before the project is considered complete, all of the following must hold:
- [ ] The app runs locally in Docker and serves the frontend through the backend.
- [ ] Authentication is enforced and works with the required dummy credentials.
- [ ] Board persistence works through SQLite.
- [ ] AI connectivity and structured output workflow are validated.
- [ ] Full frontend and backend tests pass.
- [ ] The project is ready for a final user review.
