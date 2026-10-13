"""Isolated exported-frontend integration server; never included in the image."""
import asyncio
import json
import os
import tempfile
from pathlib import Path

import uvicorn


async def fake_provider(prompt, model=None):
    await asyncio.sleep(0.3)
    return {"model": "integration-mock", "content": json.dumps({"message": "Moved the card to Done.",
        "actions": [{"type": "move_card", "cardId": "card-1", "columnId": "col-done"}]})}


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="pm-e2e-", dir=Path(__file__).resolve().parents[3]) as scratch:
        os.environ["PM_DB_PATH"] = str(Path(scratch) / "pm.db")
        from fastapi import Depends
        from backend.app import database, main
        from backend.app.auth import require_user
        main.call_openrouter = fake_provider

        # Browser tests reset to the backend's own seed board, so no frontend copy can drift.
        @main.app.post("/api/test/reset")
        def reset_board(username: str = Depends(require_user)):
            revision = database.load_board_for_user(username)["revision"]
            return database.save_board_for_user(username, {**database.DEFAULT_BOARD, "revision": revision})

        uvicorn.run(main.app, host="127.0.0.1", port=8765)
