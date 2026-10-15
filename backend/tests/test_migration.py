import sqlite3

from backend.app import database


def demo_board(user="user"):
    with database.get_connection() as connection:
        row = connection.execute("""SELECT boards.id, users.id AS user_id FROM boards
            JOIN users ON users.id = boards.user_id WHERE username = ?""", (user,)).fetchone()
    return database.load_board(row["id"], row["user_id"])


def test_first_release_database_migrates_without_data_loss(tmp_path, monkeypatch):
    legacy = tmp_path / "legacy.db"
    monkeypatch.setenv("PM_DB_PATH", str(legacy))
    with sqlite3.connect(legacy) as connection:
        connection.executescript("""
        CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, display_name TEXT, created_at TEXT);
        CREATE TABLE boards (id INTEGER PRIMARY KEY, user_id INTEGER UNIQUE, name TEXT, created_at TEXT, updated_at TEXT);
        CREATE TABLE columns (id TEXT PRIMARY KEY, board_id INTEGER, title TEXT, position INTEGER);
        CREATE TABLE cards (id TEXT PRIMARY KEY, board_id INTEGER, column_id TEXT, title TEXT, details TEXT,
                            position INTEGER, created_at TEXT, updated_at TEXT);
        INSERT INTO users VALUES (1,'user','User','original');
        INSERT INTO boards VALUES (1,1,'Main','original','original');
        """)
        for position, column in enumerate(database.DEFAULT_BOARD["columns"]):
            connection.execute("INSERT INTO columns VALUES (?, 1, ?, ?)", (column["id"], column["title"], position))
            for card_position, card_id in enumerate(column["cardIds"]):
                connection.execute("INSERT INTO cards VALUES (?, 1, ?, 'Existing custom title', 'd', ?, 'original', 'original')",
                                   (card_id, column["id"], card_position))
    database.init_db()
    before = demo_board()
    assert before["name"] == "Main" and before["revision"] == 0
    assert before["cards"]["card-1"]["title"] == "Existing custom title"
    assert before["cards"]["card-1"]["labels"] == []
    database.init_db()
    assert demo_board() == before
    # The demo account gets its password and admin role; a second board is now allowed.
    assert database.authenticate("user", "password")["isAdmin"] is True
    database.create_board(1, "Second")
    with database.get_connection() as connection:
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
        assert connection.execute("SELECT created_at FROM cards WHERE board_id=1").fetchone()[0] == "original"
        assert connection.execute("SELECT COUNT(*) FROM boards WHERE user_id = 1").fetchone()[0] == 2


def test_single_board_release_migrates_and_keeps_revision(tmp_path, monkeypatch):
    path = tmp_path / "v2.db"
    monkeypatch.setenv("PM_DB_PATH", str(path))
    with sqlite3.connect(path) as connection:
        connection.executescript(f"""
        CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL DEFAULT 'User', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE boards (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE,
            name TEXT NOT NULL DEFAULT 'Main Board', revision INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id));
        {database.COLUMN_SQL};
        CREATE TABLE cards (id TEXT NOT NULL, board_id INTEGER NOT NULL, column_id TEXT NOT NULL,
            title TEXT NOT NULL, details TEXT NOT NULL DEFAULT 'No details yet.', position INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (board_id, id), FOREIGN KEY (board_id) REFERENCES boards(id),
            FOREIGN KEY (board_id, column_id) REFERENCES columns(board_id, id));
        CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL);
        INSERT INTO users (username, display_name) VALUES ('user', 'User');
        INSERT INTO boards (user_id, revision) VALUES (1, 7);
        INSERT INTO columns VALUES ('col-a', 1, 'Only', 0);
        INSERT INTO cards (id, board_id, column_id, title, position) VALUES ('card-a', 1, 'col-a', 'Kept', 0);
        """)
    database.init_db()
    board = demo_board()
    assert board["revision"] == 7 and board["cards"]["card-a"]["title"] == "Kept"
    assert [column["id"] for column in board["columns"]] == ["col-a"]


def test_fresh_database_seeds_demo_admin_with_sample_board(client):
    board = demo_board()
    assert board["name"] == "Main Board" and len(board["cards"]) == 8
    # Restarting does not reseed a demo user whose boards were deleted.
    database.delete_board(board["id"], database.authenticate("user", "password")["id"])
    database.init_db()
    with database.get_connection() as connection:
        assert connection.execute("SELECT COUNT(*) FROM boards").fetchone()[0] == 0
