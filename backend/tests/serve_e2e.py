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
        from backend.app import main
        main.call_openrouter = fake_provider
        uvicorn.run(main.app, host="127.0.0.1", port=8765)
