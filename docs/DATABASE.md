# Database design

SQLite holds users, boards, board members, ordered columns and cards, and expiring server sessions. The runtime file defaults to `backend/data/pm.db`; `PM_DB_PATH` can override it. Docker mounts only this data directory, preserving the image's frontend export. `docs/kanban-schema.json` lists every table and column.

## Users and sessions

`users` stores a unique lowercase username, display name, an scrypt password hash (`scrypt$<salt>$<hash>`, stdlib `hashlib.scrypt`, per-user salt), `is_admin` and `is_active`. Registration creates a user with one empty board. The demo account `user` / `password` is created (or migrated) as an admin with the sample board. Other users carried over from older databases have no password and cannot sign in until an admin resets it.

`sessions` stores SHA-256 hashes of random opaque tokens, the user and an expiry eight hours ahead. The browser receives an HttpOnly, SameSite=Strict cookie; logout deletes the server token. Sessions of disabled users are ignored. Disabling a user or an admin password reset deletes all of that user's sessions; a user's own password change deletes their other sessions.

## Boards, members and access

`boards.user_id` is the owner; a user may own any number of boards. `board_members` adds other users as `editor` or `viewer` (primary key `(board_id, user_id)`). Every board route derives the role from the session: owner, editor, viewer, or none. A board the user cannot see is reported as 404, so IDs do not reveal other users' boards. Viewers get 403 on writes; only owners manage members or delete a board. Removing a member unassigns their cards on that board.

## Columns and cards

Columns and cards use composite primary keys `(board_id, id)`. Cards reference columns through `(board_id, column_id)`, so public IDs may repeat across boards without collisions or cross-board associations. Boards have 1 to 20 columns in any order. Cards carry `due_date` (ISO date or null), `priority` (`low`, `medium`, `high` or null), `labels` (JSON array, up to 10 unique labels of 1-30 characters) and `assignee_id` (the owner or a member, or null).

Boards have an integer `revision` incremented by each successful write. Each write replaces the board's column and card rows in one transaction, so card `created_at`/`updated_at` record the last board save rather than per-card history; nothing reads them. The API validates nested types and limits, unique column IDs, exactly one column membership per card, and assignees before modifying data. A stale revision returns 409 and nothing changes.

## Migration

Startup runs in one transaction with foreign keys off and finishes with `PRAGMA foreign_key_check`; any orphaned row aborts the migration without changes. It adds missing columns (`revision`, user password/admin/active fields, card fields), rebuilds the first-release global-ID column/card tables, and rebuilds `boards` without the old `UNIQUE(user_id)` constraint. Public IDs, titles, details, positions, revisions and timestamps are retained, and the migration is repeatable. Back up the database before upgrading.

Runtime databases and backups are ignored and excluded from Docker build inputs. Automated tests use temporary databases.
