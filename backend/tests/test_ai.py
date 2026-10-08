import asyncio
import json
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ai import (
    DEFAULT_MODEL,
    call_openrouter,
    generate_board_ai_response,
)


def make_board():
    return {
        "columns": [
            {"id": "col-backlog", "title": "Backlog", "cardIds": ["card-1"]},
            {"id": "col-done", "title": "Done", "cardIds": []},
        ],
        "cards": {
            "card-1": {"id": "card-1", "title": "Alpha", "details": "Test"},
        },
    }


def test_call_openrouter_sends_configured_request_and_parses_response(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-api-key")
    monkeypatch.delenv("OPENROUTER_MODEL", raising=False)
    request_details = {}

    def handle_request(request):
        request_details["url"] = str(request.url)
        request_details["authorization"] = request.headers["Authorization"]
        request_details["payload"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "model": DEFAULT_MODEL,
                "choices": [{"message": {"content": "4"}}],
            },
        )

    original_async_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda timeout: original_async_client(
            timeout=timeout,
            transport=httpx.MockTransport(handle_request),
        ),
    )

    result = asyncio.run(call_openrouter("What is 2 + 2?"))

    assert request_details["url"] == "https://openrouter.ai/api/v1/chat/completions"
    assert request_details["authorization"] == "Bearer test-api-key"
    assert request_details["payload"]["model"] == DEFAULT_MODEL
    assert request_details["payload"]["messages"] == [
        {"role": "user", "content": "What is 2 + 2?"}
    ]
    assert result == {"model": DEFAULT_MODEL, "content": "4"}


def test_generate_board_ai_response_includes_board_prompt_and_applies_fenced_actions():
    board = make_board()
    conversation = [{"role": "user", "content": "We finished the first task."}]
    request = {}

    async def fake_openrouter(prompt, model=None):
        request["prompt"] = prompt
        return {
            "model": "mock-model",
            "content": (
                "```json\n"
                '{"message":"Moved Alpha to Done.","actions":['
                '{"type":"move_card","cardId":"card-1","columnId":"col-done"}'
                "]}\n```"
            ),
        }

    result = asyncio.run(
        generate_board_ai_response(
            "Move Alpha to Done",
            board=board,
            conversation=conversation,
            openrouter_client=fake_openrouter,
        )
    )

    assert '"title": "Alpha"' in request["prompt"]
    assert "We finished the first task." in request["prompt"]
    assert "User request:\nMove Alpha to Done" in request["prompt"]
    assert result["message"] == "Moved Alpha to Done."
    assert result["model"] == "mock-model"
    assert result["board"]["columns"][0]["cardIds"] == []
    assert result["board"]["columns"][1]["cardIds"] == ["card-1"]
    assert result["actions"] == [
        {"type": "move_card", "cardId": "card-1", "columnId": "col-done"}
    ]
    assert board["columns"][0]["cardIds"] == ["card-1"]


def test_generate_board_ai_response_ignores_invalid_actions_and_preserves_board():
    board = make_board()
    original_board = json.loads(json.dumps(board))

    async def fake_openrouter(prompt, model=None):
        return {
            "model": "mock-model",
            "content": json.dumps(
                {
                    "message": "I could not identify a valid change.",
                    "actions": [
                        {
                            "type": "move_card",
                            "cardId": "missing-card",
                            "columnId": "col-done",
                        },
                        {
                            "type": "rename_column",
                            "columnId": "missing-column",
                            "title": "Renamed",
                        },
                        {"type": "unknown_action"},
                    ],
                }
            ),
        }

    result = asyncio.run(
        generate_board_ai_response(
            "Move the missing card",
            board=board,
            openrouter_client=fake_openrouter,
        )
    )

    assert result["board"] == original_board
    assert board == original_board
    assert result["actions"] == [
        {"type": "move_card", "cardId": "missing-card", "columnId": "col-done"},
        {"type": "rename_column", "columnId": "missing-column", "title": "Renamed"},
    ]


def test_generate_board_ai_response_returns_noop_for_malformed_and_empty_actions():
    board = make_board()

    async def malformed_response(prompt, model=None):
        return {"model": "mock-model", "content": '{"message": "partial", "actions": ['}

    malformed = asyncio.run(
        generate_board_ai_response(
            "Move Alpha",
            board=board,
            openrouter_client=malformed_response,
        )
    )
    assert malformed["actions"] == []
    assert malformed["board"] == board

    async def no_op_response(prompt, model=None):
        return {
            "model": "mock-model",
            "content": '{"message":"No changes needed.","actions":[]}',
        }

    no_op = asyncio.run(
        generate_board_ai_response(
            "Is anything urgent?",
            board=board,
            openrouter_client=no_op_response,
        )
    )
    assert no_op["message"] == "No changes needed."
    assert no_op["actions"] == []
    assert no_op["board"] == board
