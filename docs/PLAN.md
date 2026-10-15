# Project plan

The user authorized all remediation from `docs/review.md` on October 8, 2026. Current implementation and verification are recorded in `docs/REMEDIATION.md`; the review describes the original revision.

## Completed implementation

- [x] Combined Docker app with FastAPI serving the Next static export.
- [x] Backend demo login, expiring sessions and logout revocation.
- [x] Fixed renameable columns and direct card creation/editing/deletion.
- [x] Pointer and keyboard-accessible movement.
- [x] SQLite persistence with multi-user-scoped keys and legacy migration.
- [x] Strict board validation and revision conflict protection.
- [x] Authoritative loading, explicit save retry/reload and no seed overwrite.
- [x] OpenRouter wrapper with bounded requests and controlled errors.
- [x] Board-aware structured assistant with all supported actions and server-side commits.
- [x] Platform scripts that manage only the named Compose project.
- [x] Runtime artifact exclusions, dependency locking and updated documentation.

## Verified release checks

- [x] Production export, TypeScript and lint pass.
- [x] Backend tests: 40 pass.
- [x] Frontend unit tests: 20 pass.
- [x] Browser integration against the real API/database: 9 pass (provider mocked).
- [x] Docker build/startup, confined static serving, authentication and copied-data migration pass.
- [x] Board changes survive container recreation.
- [x] Frontend audit reports zero vulnerabilities.
- [x] PowerShell and Linux Bash script syntax pass.

## Environment-dependent follow-up

- [ ] Confirm Docker Desktop can directly share the checkout's data directory; this environment required copying the test database through Docker's API.
- [x] Live OpenRouter revalidated on October 12, 2026 (see docs/REMEDIATION.md); automated tests still use mocks.
- [ ] Run the lifecycle on a native macOS host; Linux Bash syntax and the shared Compose commands are verified.
- [ ] User final review and restart of any existing preview with the new code.

## Build-out (branch `feature/pm-buildout`)

Approved October 15, 2026: user management with an admin role, multiple boards, sharing, card fields, custom columns, search and filter. Each step is committed only when backend tests (coverage at least 90%), lint, TypeScript, unit tests (coverage thresholds) and browser tests pass.

- [x] 1-2. Schema migration, password auth, registration, admin/profile API, multiple boards, members, card fields and custom columns in the API; frontend registration and board create/switch/rename/delete.
- [x] 3. Custom columns UI (add, reorder, delete empty); columns share the width and the assistant stacks below the board under 1536px.
- [x] 4. Card fields UI (due date, priority, labels, assignee).
- [ ] 5. Sharing UI (members panel, roles) and viewer read-only checks in the browser.
- [ ] 6. Search and filter.
- [ ] 7. Profile and admin screens.
- [ ] 8. Assistant UI notes for new actions; browser test for the board-scoped assistant.
- [ ] 9. Documentation (AGENTS.md business rules, CLAUDE.md, DATABASE.md, kanban-schema.json) and coverage gaps.
- [ ] 10. Review pass, Docker build and run check, screenshots.
