"""Isolated exported-frontend integration server; never included in the image."""
import asyncio
import json
import os
import tempfile
from pathlib import Path

import uvicorn


async def fake_provider(prompt, model=None):
    await asyncio.sleep(0.3)
    request = prompt.split("User request:\n", 1)[1].split("\n\n", 1)[0].lower()
    if "priority" in request:
        reply = {"message": "Marked the card as high priority.", "actions": [
            {"type": "set_card_fields", "cardId": "card-1", "priority": "high", "labels": "Assistant", "assignee": "user"}]}
    else:
        reply = {"message": "Moved the card to Done.",
                 "actions": [{"type": "move_card", "cardId": "card-1", "columnId": "col-done"}]}
    return {"model": "integration-mock", "content": json.dumps(reply)}


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="pm-e2e-", dir=Path(__file__).resolve().parents[3]) as scratch:
        os.environ["PM_DB_PATH"] = str(Path(scratch) / "pm.db")
        from backend.app import database, main
        main.call_openrouter = fake_provider

        # Browser tests start from the backend's own seed data, so no frontend copy can drift.
        @main.app.post("/api/test/reset")
        def reset():
            with database.get_connection() as connection:
                for table in ("sessions", "board_members", "cards", "columns", "boards", "users"):
                    connection.execute(f"DELETE FROM {table}")
            database.ensure_demo_user()
            return {"ok": True}

        uvicorn.run(main.app, host="127.0.0.1", port=8765)
