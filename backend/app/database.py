import os
import sqlite3
from contextlib import contextmanager

from .models import Board
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = PROJECT_ROOT / "backend" / "data" / "pm.db"

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


class BoardConflict(ValueError):
    pass


def get_database_path() -> Path:
    return Path(os.getenv("PM_DB_PATH", str(DEFAULT_DB_PATH)))


@contextmanager
def get_connection():
    path = get_database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        with connection:
            yield connection
    finally:
        connection.close()


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


def init_db() -> None:
    with get_connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        connection.execute("""CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL DEFAULT 'User',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)""")
        connection.execute("""CREATE TABLE IF NOT EXISTS boards (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE,
            name TEXT NOT NULL DEFAULT 'Main Board', revision INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id))""")
        if "revision" not in {row["name"] for row in connection.execute("PRAGMA table_info(boards)")}:
            connection.execute("ALTER TABLE boards ADD COLUMN revision INTEGER NOT NULL DEFAULT 0")
        column_info = connection.execute("PRAGMA table_info(columns)").fetchall()
        if column_info and not any(row["name"] == "board_id" and row["pk"] for row in column_info):
            # Rebuild in one transaction, retaining public IDs, data, and timestamps.
            connection.execute("ALTER TABLE cards RENAME TO cards_legacy")
            connection.execute("ALTER TABLE columns RENAME TO columns_legacy")
            connection.execute(COLUMN_SQL)
            connection.execute(CARD_SQL)
            connection.execute("INSERT INTO columns SELECT * FROM columns_legacy")
            connection.execute("INSERT INTO cards SELECT * FROM cards_legacy")
            connection.execute("DROP TABLE cards_legacy")
            connection.execute("DROP TABLE columns_legacy")
        elif not column_info:
            connection.execute(COLUMN_SQL)
            connection.execute(CARD_SQL)
        connection.execute("""CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id))""")
    ensure_seed_board("user")


def ensure_seed_board(username: str) -> dict[str, int]:
    with get_connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        connection.execute("INSERT OR IGNORE INTO users (username, display_name) VALUES (?, ?)",
                           (username, username.title()))
        user = connection.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        row = connection.execute("SELECT id FROM boards WHERE user_id = ?", (user["id"],)).fetchone()
        if row is None:
            cursor = connection.execute("INSERT INTO boards (user_id) VALUES (?)", (user["id"],))
            board_id = cursor.lastrowid
            _write_rows(connection, board_id, DEFAULT_BOARD)
        else:
            board_id = row["id"]
    return {"id": board_id, "user_id": user["id"]}


def _write_rows(connection, board_id: int, board: dict) -> None:
    for position, column in enumerate(board["columns"]):
        connection.execute("INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
                           (column["id"], board_id, column["title"], position))
        for card_position, card_id in enumerate(column["cardIds"]):
            card = board["cards"][card_id]
            connection.execute("""INSERT INTO cards
                (id, board_id, column_id, title, details, position) VALUES (?, ?, ?, ?, ?, ?)""",
                (card_id, board_id, column["id"], card["title"], card["details"], card_position))


def _read_board(connection, board_id: int) -> dict:
    row = connection.execute("SELECT revision FROM boards WHERE id = ?", (board_id,)).fetchone()
    columns = connection.execute("SELECT id, title FROM columns WHERE board_id = ? ORDER BY position",
                                 (board_id,)).fetchall()
    cards = connection.execute("SELECT id, column_id, title, details FROM cards WHERE board_id = ? ORDER BY position",
                               (board_id,)).fetchall()
    return {"revision": row["revision"],
            "columns": [{"id": column["id"], "title": column["title"],
                         "cardIds": [card["id"] for card in cards if card["column_id"] == column["id"]]}
                        for column in columns],
            "cards": {card["id"]: {"id": card["id"], "title": card["title"], "details": card["details"]}
                      for card in cards}}


def load_board_for_user(username: str) -> dict:
    board = ensure_seed_board(username)
    with get_connection() as connection:
        connection.execute("BEGIN")
        return _read_board(connection, board["id"])


def save_board_for_user(username: str, board_data: dict, session_hash: str | None = None) -> dict:
    board_data = Board.model_validate(board_data).model_dump()
    board = ensure_seed_board(username)
    with get_connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        if session_hash is not None:
            import time
            session = connection.execute("SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?",
                                         (session_hash, int(time.time()))).fetchone()
            if session is None or session["user_id"] != board["user_id"]:
                raise PermissionError("Session ended. Please sign in again.")
        current = connection.execute("SELECT revision FROM boards WHERE id = ?", (board["id"],)).fetchone()
        if current["revision"] != board_data["revision"]:
            raise BoardConflict("The board changed in another request. Reload before editing again.")
        connection.execute("DELETE FROM cards WHERE board_id = ?", (board["id"],))
        connection.execute("DELETE FROM columns WHERE board_id = ?", (board["id"],))
        _write_rows(connection, board["id"], board_data)
        connection.execute("UPDATE boards SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                           (board["id"],))
        return _read_board(connection, board["id"])
