import os
import sqlite3
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


def get_database_path() -> Path:
    configured_path = os.getenv("PM_DB_PATH")
    if configured_path:
        return Path(configured_path)
    return DEFAULT_DB_PATH


def get_connection() -> sqlite3.Connection:
    database_path = get_database_path()
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db() -> None:
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL DEFAULT 'User',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS boards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE,
                name TEXT NOT NULL DEFAULT 'Main Board',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS columns (
                id TEXT PRIMARY KEY,
                board_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                position INTEGER NOT NULL,
                FOREIGN KEY (board_id) REFERENCES boards(id)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS cards (
                id TEXT PRIMARY KEY,
                board_id INTEGER NOT NULL,
                column_id TEXT NOT NULL,
                title TEXT NOT NULL,
                details TEXT NOT NULL DEFAULT 'No details yet.',
                position INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (board_id) REFERENCES boards(id),
                FOREIGN KEY (column_id) REFERENCES columns(id)
            )
            """
        )

    ensure_seed_board("user")


def get_or_create_user(username: str) -> dict[str, object]:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT id, username, display_name FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        if row is not None:
            return {"id": row["id"], "username": row["username"], "display_name": row["display_name"]}

        cursor = connection.execute(
            "INSERT INTO users (username, display_name) VALUES (?, ?)",
            (username, username.title()),
        )
        return {"id": cursor.lastrowid, "username": username, "display_name": username.title()}


def ensure_seed_board(username: str) -> dict[str, object]:
    user = get_or_create_user(username)
    user_id = user["id"]

    with get_connection() as connection:
        board = connection.execute(
            "SELECT id FROM boards WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if board is not None:
            return {"id": board["id"], "user_id": user_id}

        cursor = connection.execute(
            "INSERT INTO boards (user_id, name) VALUES (?, ?)",
            (user_id, "Main Board"),
        )
        board_id = cursor.lastrowid

        for position, column in enumerate(DEFAULT_BOARD["columns"]):
            connection.execute(
                "INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
                (column["id"], board_id, column["title"], position),
            )

        for column in DEFAULT_BOARD["columns"]:
            for position, card_id in enumerate(column["cardIds"]):
                card = DEFAULT_BOARD["cards"][card_id]
                connection.execute(
                    "INSERT INTO cards (id, board_id, column_id, title, details, position) VALUES (?, ?, ?, ?, ?, ?)",
                    (card_id, board_id, column["id"], card["title"], card["details"], position),
                )

        return {"id": board_id, "user_id": user_id}


def load_board_for_user(username: str) -> dict[str, object]:
    user = get_or_create_user(username)
    ensure_seed_board(username)

    with get_connection() as connection:
        board = connection.execute(
            "SELECT id FROM boards WHERE user_id = ?",
            (user["id"],),
        ).fetchone()

        if board is None:
            raise ValueError(f"No board found for user '{username}'")

        columns = connection.execute(
            "SELECT id, title, position FROM columns WHERE board_id = ? ORDER BY position ASC",
            (board["id"],),
        ).fetchall()
        cards = connection.execute(
            "SELECT id, column_id, title, details, position FROM cards WHERE board_id = ? ORDER BY position ASC",
            (board["id"],),
        ).fetchall()

    cards_by_id: dict[str, dict[str, str]] = {}
    for row in cards:
        cards_by_id[row["id"]] = {"id": row["id"], "title": row["title"], "details": row["details"]}

    ordered_columns: list[dict[str, object]] = []
    for row in columns:
        card_ids = [
            card_row["id"]
            for card_row in cards
            if card_row["column_id"] == row["id"]
        ]
        ordered_columns.append({
            "id": row["id"],
            "title": row["title"],
            "cardIds": card_ids,
        })

    return {"columns": ordered_columns, "cards": cards_by_id}


def save_board_for_user(username: str, board_data: dict[str, object]) -> dict[str, object]:
    user = get_or_create_user(username)
    board = ensure_seed_board(username)
    board_id = board["id"]

    columns = board_data.get("columns", [])
    cards = board_data.get("cards", {})

    with get_connection() as connection:
        connection.execute("DELETE FROM cards WHERE board_id = ?", (board_id,))
        connection.execute("DELETE FROM columns WHERE board_id = ?", (board_id,))

        for position, column in enumerate(columns):
            column_id = column["id"]
            column_title = column["title"]
            connection.execute(
                "INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
                (column_id, board_id, column_title, position),
            )

        for column in columns:
            card_ids = column.get("cardIds", [])
            for position, card_id in enumerate(card_ids):
                card = cards.get(card_id)
                if card is None:
                    continue
                connection.execute(
                    "INSERT INTO cards (id, board_id, column_id, title, details, position) VALUES (?, ?, ?, ?, ?, ?)",
                    (card_id, board_id, column["id"], card["title"], card.get("details", "No details yet."), position),
                )

        connection.execute(
            "UPDATE boards SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (board_id,),
        )

    return load_board_for_user(username)
