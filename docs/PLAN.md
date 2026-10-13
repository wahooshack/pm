# Project plan

The user authorized all remediation from `review.md` on October 8, 2026. Current implementation and verification are recorded in `docs/REMEDIATION.md`; the review describes the original revision.

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
- [x] Backend tests: 39 pass.
- [x] Frontend unit tests: 19 pass.
- [x] Browser integration against the real API/database: 8 pass (provider mocked).
- [x] Docker build/startup, confined static serving, authentication and copied-data migration pass.
- [x] Board changes survive container recreation.
- [x] Frontend audit reports zero vulnerabilities.
- [x] PowerShell and Linux Bash script syntax pass.

## Environment-dependent follow-up

- [ ] Confirm Docker Desktop can directly share the checkout's data directory; this environment required copying the test database through Docker's API.
- [x] Live OpenRouter revalidated on October 12, 2026 (see docs/REMEDIATION.md); automated tests still use mocks.
- [ ] Run the lifecycle on a native macOS host; Linux Bash syntax and the shared Compose commands are verified.
- [ ] User final review and restart of any existing preview with the new code.
