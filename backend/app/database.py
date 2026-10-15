import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

from .models import DEFAULT_COLUMNS, Board

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = PROJECT_ROOT / "backend" / "data" / "pm.db"
DEMO_USERNAME, DEMO_PASSWORD = "user", "password"

DEFAULT_BOARD = {
    "columns": [
        {"id": "col-backlog", "title": "Backlog", "cardIds": ["card-1", "card-2"]},
        {"id": "col-discovery", "title": "Discovery", "cardIds": ["card-3"]},
        {"id": "col-progress", "title": "In Progress", "cardIds": ["card-4", "card-5"]},
        {"id": "col-review", "title": "Review", "cardIds": ["card-6"]},
        {"id": "col-done", "title": "Done", "cardIds": ["card-7", "card-8"]},
    ],
    "cards": {
        "card-1": {"id": "card-1", "title": "Align roadmap themes", "details": "Draft quarterly themes with impact statements and metrics."},
        "card-2": {"id": "card-2", "title": "Gather customer signals", "details": "Review support tags, sales notes, and churn feedback."},
        "card-3": {"id": "card-3", "title": "Prototype analytics view", "details": "Sketch initial dashboard layout and key drill-downs."},
        "card-4": {"id": "card-4", "title": "Refine status language", "details": "Standardize column labels and tone across the board."},
        "card-5": {"id": "card-5", "title": "Design card layout", "details": "Add hierarchy and spacing for scanning dense lists."},
        "card-6": {"id": "card-6", "title": "QA micro-interactions", "details": "Verify hover, focus, and loading states."},
        "card-7": {"id": "card-7", "title": "Ship marketing page", "details": "Final copy approved and asset pack delivered."},
        "card-8": {"id": "card-8", "title": "Close onboarding sprint", "details": "Document release notes and share internally."},
    },
}
EMPTY_BOARD = {"columns": [{"id": column_id, "title": title, "cardIds": []} for column_id, title in DEFAULT_COLUMNS],
               "cards": {}}


class BoardConflict(ValueError):
    pass


class NotFound(LookupError):
    pass


class Forbidden(PermissionError):
    pass


class UserExists(ValueError):
    pass


class Invalid(ValueError):
    pass


def get_database_path() -> Path:
    return Path(os.getenv("PM_DB_PATH", str(DEFAULT_DB_PATH)))


@contextmanager
def get_connection(foreign_keys: bool = True):
    path = get_database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute(f"PRAGMA foreign_keys = {'ON' if foreign_keys else 'OFF'}")
    try:
        with connection:
            yield connection
    finally:
        connection.close()


# Passwords use stdlib scrypt with a per-user salt.
def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt, expected = stored.split("$")
        digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1)
    except ValueError:
        return False
    return hmac.compare_digest(digest.hex(), expected)


USERS_SQL = """CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL DEFAULT 'User',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"""
BOARDS_SQL = """CREATE TABLE boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT 'Main Board', revision INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id))"""
COLUMN_SQL = """CREATE TABLE columns (
    id TEXT NOT NULL, board_id INTEGER NOT NULL,
    title TEXT NOT NULL, position INTEGER NOT NULL,
    PRIMARY KEY (board_id, id),
    FOREIGN KEY (board_id) REFERENCES boards(id))"""
CARD_SQL = """CREATE TABLE cards (
    id TEXT NOT NULL, board_id INTEGER NOT NULL, column_id TEXT NOT NULL,
    title TEXT NOT NULL, details TEXT NOT NULL DEFAULT 'No details yet.',
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (board_id, id),
    FOREIGN KEY (board_id) REFERENCES boards(id),
    FOREIGN KEY (board_id, column_id) REFERENCES columns(board_id, id))"""
# Columns added after the first release; ALTER TABLE keeps existing rows.
ADDED_COLUMNS = {
    "users": [("password_hash", "TEXT NOT NULL DEFAULT ''"), ("is_admin", "INTEGER NOT NULL DEFAULT 0"),
              ("is_active", "INTEGER NOT NULL DEFAULT 1")],
    "boards": [("revision", "INTEGER NOT NULL DEFAULT 0")],
    "cards": [("due_date", "TEXT"), ("priority", "TEXT"), ("labels", "TEXT NOT NULL DEFAULT '[]'"),
              ("assignee_id", "INTEGER REFERENCES users(id)")],
}


def _table_columns(connection, table: str) -> list[sqlite3.Row]:
    return connection.execute(f"PRAGMA table_info({table})").fetchall()


def init_db() -> None:
    # Table rebuilds need foreign keys off; the check at the end proves nothing was orphaned.
    with get_connection(foreign_keys=False) as connection:
        connection.execute("BEGIN IMMEDIATE")
        connection.execute(USERS_SQL)
        if not _table_columns(connection, "boards"):
            connection.execute(BOARDS_SQL)
        elif any(index["unique"] and index["origin"] == "u"
                 for index in connection.execute("PRAGMA index_list(boards)")):
            # The first release allowed one board per user; rebuild without UNIQUE(user_id).
            if "revision" not in {row["name"] for row in _table_columns(connection, "boards")}:
                connection.execute("ALTER TABLE boards ADD COLUMN revision INTEGER NOT NULL DEFAULT 0")
            connection.execute(BOARDS_SQL.replace("CREATE TABLE boards", "CREATE TABLE boards_new"))
            connection.execute("""INSERT INTO boards_new (id, user_id, name, revision, created_at, updated_at)
                SELECT id, user_id, name, revision, created_at, updated_at FROM boards""")
            connection.execute("DROP TABLE boards")
            connection.execute("ALTER TABLE boards_new RENAME TO boards")
        column_info = _table_columns(connection, "columns")
        if column_info and not any(row["name"] == "board_id" and row["pk"] for row in column_info):
            # Rebuild in one transaction, retaining public IDs, data, and timestamps.
            connection.execute("ALTER TABLE cards RENAME TO cards_legacy")
            connection.execute("ALTER TABLE columns RENAME TO columns_legacy")
            connection.execute(COLUMN_SQL)
            connection.execute(CARD_SQL)
            connection.execute("""INSERT INTO columns (id, board_id, title, position)
                SELECT id, board_id, title, position FROM columns_legacy""")
            connection.execute("""INSERT INTO cards
                (id, board_id, column_id, title, details, position, created_at, updated_at)
                SELECT id, board_id, column_id, title, details, position, created_at, updated_at FROM cards_legacy""")
            connection.execute("DROP TABLE cards_legacy")
            connection.execute("DROP TABLE columns_legacy")
        elif not column_info:
            connection.execute(COLUMN_SQL)
            connection.execute(CARD_SQL)
        for table, additions in ADDED_COLUMNS.items():
            existing = {row["name"] for row in _table_columns(connection, table)}
            for name, definition in additions:
                if name not in existing:
                    connection.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")
        connection.execute("""CREATE TABLE IF NOT EXISTS board_members (
            board_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
            PRIMARY KEY (board_id, user_id),
            FOREIGN KEY (board_id) REFERENCES boards(id),
            FOREIGN KEY (user_id) REFERENCES users(id))""")
        connection.execute("""CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id))""")
        if connection.execute("PRAGMA foreign_key_check").fetchall():
            raise RuntimeError("Database migration found orphaned rows; nothing was changed.")
    ensure_demo_user()


def ensure_demo_user() -> None:
    """The demo account is an admin; it gets the sample board when first created or migrated."""
    with get_connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute("SELECT id, password_hash FROM users WHERE username = ?", (DEMO_USERNAME,)).fetchone()
        if row is None:
            user_id = connection.execute("INSERT INTO users (username, display_name) VALUES (?, ?)",
                                         (DEMO_USERNAME, "User")).lastrowid
        elif row["password_hash"]:
            return
        else:
            user_id = row["id"]
        connection.execute("UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
                           (hash_password(DEMO_PASSWORD), user_id))
        if connection.execute("SELECT 1 FROM boards WHERE user_id = ?", (user_id,)).fetchone() is None:
            _insert_board(connection, user_id, "Main Board", DEFAULT_BOARD)


# Users

def _public_user(row) -> dict:
    return {"id": row["id"], "username": row["username"], "displayName": row["display_name"],
            "isAdmin": bool(row["is_admin"]), "isActive": bool(row["is_active"])}


USER_FIELDS = "users.id, users.username, users.display_name, users.is_admin, users.is_active"


def create_user(username: str, display_name: str, password: str) -> dict:
    with get_connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        try:
            user_id = connection.execute("INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)",
                                         (username, display_name, hash_password(password))).lastrowid
        except sqlite3.IntegrityError as exc:
            raise UserExists("That username is taken.") from exc
        _insert_board(connection, user_id, "My Board", EMPTY_BOARD)
        return _public_user(connection.execute(f"SELECT {USER_FIELDS} FROM users WHERE id = ?", (user_id,)).fetchone())


def authenticate(username: str, password: str) -> dict | None:
    with get_connection() as connection:
        row = connection.execute(f"SELECT {USER_FIELDS}, password_hash FROM users WHERE username = ?",
                                 (username,)).fetchone()
    # Unknown users still pay for one hash so response timing does not reveal accounts.
    valid = verify_password(password, row["password_hash"] if row else _DUMMY_HASH)
    return _public_user(row) if row and valid and row["is_active"] else None


def create_session(user_id: int, token_hash: str, expires_at: int) -> None:
    with get_connection() as connection:
        connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (int(time.time()),))
        connection.execute("INSERT INTO sessions VALUES (?, ?, ?)", (token_hash, user_id, expires_at))


def user_for_session(token_hash: str) -> dict | None:
    with get_connection() as connection:
        row = connection.execute(f"""SELECT {USER_FIELDS} FROM sessions JOIN users ON users.id = sessions.user_id
            WHERE token_hash = ? AND expires_at > ? AND users.is_active = 1""",
            (token_hash, int(time.time()))).fetchone()
    return _public_user(row) if row else None


def delete_session(token_hash: str) -> None:
    with get_connection() as connection:
        connection.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))


def update_display_name(user_id: int, display_name: str) -> dict:
    with get_connection() as connection:
        connection.execute("UPDATE users SET display_name = ? WHERE id = ?", (display_name, user_id))
        return _public_user(connection.execute(f"SELECT {USER_FIELDS} FROM users WHERE id = ?", (user_id,)).fetchone())


def change_password(user_id: int, current: str, new: str, keep_session: str) -> None:
    with get_connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        stored = connection.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,)).fetchone()
        if not verify_password(current, stored["password_hash"]):
            raise Forbidden("Current password is incorrect.")
        connection.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(new), user_id))
        connection.execute("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?", (user_id, keep_session))


def list_users() -> list[dict]:
    with get_connection() as connection:
        return [_public_user(row) for row in
                connection.execute(f"SELECT {USER_FIELDS} FROM users ORDER BY username")]


def admin_update_user(admin_id: int, username: str, is_active: bool | None, is_admin: bool | None,
                      password: str | None) -> dict:
    with get_connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        if row is None:
            raise NotFound("User not found.")
        if row["id"] == admin_id and (is_active is False or is_admin is False):
            raise Forbidden("You cannot disable or demote your own account.")
        if is_active is not None:
            connection.execute("UPDATE users SET is_active = ? WHERE id = ?", (int(is_active), row["id"]))
        if is_admin is not None:
            connection.execute("UPDATE users SET is_admin = ? WHERE id = ?", (int(is_admin), row["id"]))
        if password is not None:
            connection.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(password), row["id"]))
        if is_active is False or password is not None:
            connection.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
        return _public_user(connection.execute(f"SELECT {USER_FIELDS} FROM users WHERE id = ?", (row["id"],)).fetchone())


# Boards

def _insert_board(connection, user_id: int, name: str, board: dict) -> int:
    board_id = connection.execute("INSERT INTO boards (user_id, name) VALUES (?, ?)", (user_id, name)).lastrowid
    _write_rows(connection, board_id, Board.model_validate({**board, "revision": 0}).model_dump())
    return board_id


def _write_rows(connection, board_id: int, board: dict) -> None:
    usernames = {card["assignee"] for card in board["cards"].values() if card.get("assignee")}
    user_ids = {row["username"]: row["id"] for row in connection.execute(
        f"SELECT id, username FROM users WHERE username IN ({','.join('?' * len(usernames))})", tuple(usernames))}
    for position, column in enumerate(board["columns"]):
        connection.execute("INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
                           (column["id"], board_id, column["title"], position))
        for card_position, card_id in enumerate(column["cardIds"]):
            card = board["cards"][card_id]
            connection.execute("""INSERT INTO cards (id, board_id, column_id, title, details, position,
                due_date, priority, labels, assignee_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (card_id, board_id, column["id"], card["title"], card["details"], card_position,
                 card.get("dueDate"), card.get("priority"), json.dumps(card.get("labels", [])),
                 user_ids.get(card.get("assignee"))))


def _read_board(connection, board_id: int, role: str) -> dict:
    row = connection.execute("SELECT id, name, revision FROM boards WHERE id = ?", (board_id,)).fetchone()
    columns = connection.execute("SELECT id, title FROM columns WHERE board_id = ? ORDER BY position",
                                 (board_id,)).fetchall()
    cards = connection.execute("""SELECT cards.id, column_id, title, details, due_date, priority, labels,
        users.username AS assignee FROM cards LEFT JOIN users ON users.id = cards.assignee_id
        WHERE board_id = ? ORDER BY column_id, position""", (board_id,)).fetchall()
    return {"id": row["id"], "name": row["name"], "role": role, "revision": row["revision"],
            "columns": [{"id": column["id"], "title": column["title"],
                         "cardIds": [card["id"] for card in cards if card["column_id"] == column["id"]]}
                        for column in columns],
            "cards": {card["id"]: {"id": card["id"], "title": card["title"], "details": card["details"],
                                   "dueDate": card["due_date"], "priority": card["priority"],
                                   "labels": json.loads(card["labels"]), "assignee": card["assignee"]}
                      for card in cards}}


def _role(connection, board_id: int, user_id: int) -> str:
    """Owner, editor or viewer; a board the user cannot see is reported as missing."""
    row = connection.execute("""SELECT CASE WHEN boards.user_id = ? THEN 'owner' ELSE board_members.role END AS role
        FROM boards LEFT JOIN board_members ON board_members.board_id = boards.id AND board_members.user_id = ?
        WHERE boards.id = ?""", (user_id, user_id, board_id)).fetchone()
    if row is None or row["role"] is None:
        raise NotFound("Board not found.")
    return row["role"]


def _participants(connection, board_id: int) -> set[str]:
    return {row["username"] for row in connection.execute("""SELECT username FROM users
        WHERE id = (SELECT user_id FROM boards WHERE id = ?)
        OR id IN (SELECT user_id FROM board_members WHERE board_id = ?)""", (board_id, board_id))}


def list_boards(user_id: int) -> list[dict]:
    with get_connection() as connection:
        rows = connection.execute("""SELECT boards.id, boards.name, users.username AS owner,
            CASE WHEN boards.user_id = ? THEN 'owner' ELSE board_members.role END AS role
            FROM boards JOIN users ON users.id = boards.user_id
            LEFT JOIN board_members ON board_members.board_id = boards.id AND board_members.user_id = ?
            WHERE boards.user_id = ? OR board_members.user_id = ?
            ORDER BY boards.user_id != ?, boards.created_at, boards.id""",
            (user_id, user_id, user_id, user_id, user_id)).fetchall()
    return [dict(row) for row in rows]


def create_board(user_id: int, name: str) -> dict:
    with get_connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        board_id = _insert_board(connection, user_id, name, EMPTY_BOARD)
        return _read_board(connection, board_id, "owner")


def load_board(board_id: int, user_id: int) -> dict:
    with get_connection() as connection:
        connection.execute("BEGIN")
        return _read_board(connection, board_id, _role(connection, board_id, user_id))


def board_participants(board_id: int, user_id: int) -> list[str]:
    with get_connection() as connection:
        _role(connection, board_id, user_id)
        return sorted(_participants(connection, board_id))


def save_board(board_id: int, user_id: int, board_data: dict, session_hash: str | None = None) -> dict:
    board_data = Board.model_validate(board_data).model_dump()
    with get_connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        if session_hash is not None:
            session = connection.execute("""SELECT sessions.user_id FROM sessions JOIN users ON users.id = sessions.user_id
                WHERE token_hash = ? AND expires_at > ? AND users.is_active = 1""",
                (session_hash, int(time.time()))).fetchone()
            if session is None or session["user_id"] != user_id:
                raise PermissionError("Session ended. Please sign in again.")
        role = _role(connection, board_id, user_id)
        if role == "viewer":
            raise Forbidden("You have view-only access to this board.")
        current = connection.execute("SELECT revision FROM boards WHERE id = ?", (board_id,)).fetchone()
        if current["revision"] != board_data["revision"]:
            raise BoardConflict("The board changed in another request. Reload before editing again.")
        participants = _participants(connection, board_id)
        if any(card["assignee"] and card["assignee"] not in participants for card in board_data["cards"].values()):
            raise Invalid("Cards can only be assigned to the board owner or members.")
        connection.execute("DELETE FROM cards WHERE board_id = ?", (board_id,))
        connection.execute("DELETE FROM columns WHERE board_id = ?", (board_id,))
        _write_rows(connection, board_id, board_data)
        connection.execute("""UPDATE boards SET name = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?""", (board_data["name"], board_id))
        return _read_board(connection, board_id, role)


def delete_board(board_id: int, user_id: int) -> None:
    with get_connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        if _role(connection, board_id, user_id) != "owner":
            raise Forbidden("Only the board owner can delete it.")
        for table in ("cards", "columns", "board_members"):
            connection.execute(f"DELETE FROM {table} WHERE board_id = ?", (board_id,))
        connection.execute("DELETE FROM boards WHERE id = ?", (board_id,))


# Members

def _require_owner(connection, board_id: int, user_id: int) -> None:
    if _role(connection, board_id, user_id) != "owner":
        raise Forbidden("Only the board owner can manage members.")


def _members(connection, board_id: int) -> list[dict]:
    return [dict(row) for row in connection.execute("""SELECT users.username, users.display_name AS displayName,
        board_members.role FROM board_members JOIN users ON users.id = board_members.user_id
        WHERE board_id = ? ORDER BY users.username""", (board_id,))]


def list_members(board_id: int, user_id: int) -> list[dict]:
    with get_connection() as connection:
        _require_owner(connection, board_id, user_id)
        return _members(connection, board_id)


def add_member(board_id: int, user_id: int, username: str, role: str) -> list[dict]:
    with get_connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        _require_owner(connection, board_id, user_id)
        member = connection.execute("SELECT id FROM users WHERE username = ? AND is_active = 1", (username,)).fetchone()
        if member is None:
            raise NotFound("No active user has that username.")
        if member["id"] == user_id:
            raise Invalid("You already own this board.")
        connection.execute("""INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)
            ON CONFLICT (board_id, user_id) DO UPDATE SET role = excluded.role""", (board_id, member["id"], role))
        return _members(connection, board_id)


def remove_member(board_id: int, user_id: int, username: str) -> list[dict]:
    with get_connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        _require_owner(connection, board_id, user_id)
        member = connection.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        if member is None or connection.execute("DELETE FROM board_members WHERE board_id = ? AND user_id = ?",
                                                (board_id, member["id"])).rowcount == 0:
            raise NotFound("That user is not a member of this board.")
        # Their cards stay; unassign them so assignees are always participants.
        if connection.execute("UPDATE cards SET assignee_id = NULL WHERE board_id = ? AND assignee_id = ?",
                              (board_id, member["id"])).rowcount:
            connection.execute("UPDATE boards SET revision = revision + 1 WHERE id = ?", (board_id,))
        return _members(connection, board_id)
