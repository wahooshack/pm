# Database design

SQLite holds users, one board per user, ordered columns/cards, and expiring server sessions. The runtime file defaults to `backend/data/pm.db`; `PM_DB_PATH` can override it. Docker mounts only this data directory, preserving the image's frontend export.

Columns and cards use composite primary keys `(board_id, id)`. Cards reference columns through `(board_id, column_id)`, so public seed IDs may be reused across users without collisions or cross-board associations. Boards have an integer revision incremented by each successful write. The API validates the fixed column order, nested types/limits, and exactly one column membership per card before modifying data. A stale revision returns 409, retaining existing rows.

Startup transactionally adds revisions and rebuilds legacy global-ID tables while retaining public IDs, titles, details, positions, and timestamps. The migration is repeatable. Back up the database before upgrading; initialization never discards existing boards. New users may be seeded internally, but API ownership comes exclusively from the authenticated session and the MVP exposes only the demo account.

Sessions store SHA-256 hashes of random opaque tokens, user ownership, and expiration. The browser receives an HttpOnly, SameSite=Strict cookie; logout deletes the server token. The same transaction that saves a board verifies the session is still valid.

Runtime databases and backups are ignored and excluded from Docker build inputs. A pre-remediation local backup is retained as `backend/data/pm.pre-remediation.sqlite3` for this workspace. Automated tests use temporary databases.
