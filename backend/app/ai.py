import json
import os
import re
from copy import deepcopy
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")

DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free"


def build_board_prompt(board: dict[str, Any], user_prompt: str, conversation: list[dict[str, Any]] | None = None) -> str:
    conversation_lines = []
    if conversation:
        for entry in conversation:
            if not isinstance(entry, dict):
                continue
            role = entry.get("role", "user")
            content = entry.get("content", "")
            if isinstance(content, str):
                conversation_lines.append(f"{role}: {content}")

    board_json = json.dumps(board, ensure_ascii=False, indent=2)
    history = "\n".join(conversation_lines) if conversation_lines else "No prior conversation."
    return (
        "You are a Kanban assistant for a project management app. "
        "Respond with valid JSON only. "
        "The JSON must include a 'message' string and an 'actions' array. "
        "Each action object must have a 'type' field and valid Kanban data. "
        "If there is no valid change, return an empty actions array.\n\n"
        f"Board state:\n{board_json}\n\n"
        f"Recent conversation:\n{history}\n\n"
        f"User request:\n{user_prompt}\n\n"
        "Return JSON in this shape: {\n"
        "  \"message\": \"Brief status update\",\n"
        "  \"actions\": [\n"
        "    {\"type\": \"move_card\", \"cardId\": \"card-1\", \"columnId\": \"col-done\"}\n"
        "  ]\n"
        "}"
    )


def _sanitize_action(action: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(action, dict):
        return None

    action_type = str(action.get("type") or "").strip()
    if not action_type:
        return None

    if action_type == "move_card":
        card_id = str(action.get("cardId") or action.get("card_id") or "")
        column_id = str(action.get("columnId") or action.get("column_id") or "")
        if card_id and column_id:
            return {"type": "move_card", "cardId": card_id, "columnId": column_id}
        return None

    if action_type in {"rename_card", "update_card_details"}:
        card_id = str(action.get("cardId") or action.get("card_id") or "")
        if not card_id:
            return None
        payload: dict[str, Any] = {"type": action_type, "cardId": card_id}
        if "title" in action:
            payload["title"] = str(action.get("title") or "")
        if "details" in action:
            payload["details"] = str(action.get("details") or "")
        return payload if payload.get("title") or payload.get("details") else None

    if action_type == "add_card":
        column_id = str(action.get("columnId") or action.get("column_id") or "")
        title = str(action.get("title") or "").strip()
        if not column_id or not title:
            return None
        payload = {"type": "add_card", "columnId": column_id, "title": title}
        if "details" in action:
            payload["details"] = str(action.get("details") or "No details yet.")
        return payload

    if action_type == "delete_card":
        card_id = str(action.get("cardId") or action.get("card_id") or "")
        if card_id:
            return {"type": "delete_card", "cardId": card_id}
        return None

    if action_type == "rename_column":
        column_id = str(action.get("columnId") or action.get("column_id") or "")
        title = str(action.get("title") or "").strip()
        if column_id and title:
            return {"type": "rename_column", "columnId": column_id, "title": title}
        return None

    return None


def _apply_move_card(board: dict[str, Any], card_id: str, column_id: str) -> bool:
    cards = board.get("cards", {})
    columns = board.get("columns", [])
    if not isinstance(cards, dict) or not isinstance(columns, list):
        return False
    if card_id not in cards:
        return False

    current_column_id = None
    for column in columns:
        if not isinstance(column, dict):
            continue
        card_ids = column.get("cardIds", [])
        if isinstance(card_ids, list) and card_id in card_ids:
            current_column_id = column.get("id")
            break

    target_column = next((column for column in columns if isinstance(column, dict) and column.get("id") == column_id), None)
    if not target_column or not isinstance(target_column.get("cardIds", []), list):
        return False

    if current_column_id == column_id:
        return True

    for column in columns:
        if not isinstance(column, dict):
            continue
        card_ids = column.get("cardIds", [])
        if isinstance(card_ids, list):
            column["cardIds"] = [existing_id for existing_id in card_ids if existing_id != card_id]

    target_column["cardIds"].append(card_id)
    return True


def _apply_rename_card(board: dict[str, Any], card_id: str, title: str | None = None, details: str | None = None) -> bool:
    cards = board.get("cards", {})
    if not isinstance(cards, dict) or card_id not in cards:
        return False
    card = cards[card_id]
    if not isinstance(card, dict):
        return False
    if title is not None:
        card["title"] = str(title).strip() or card["title"]
    if details is not None:
        card["details"] = str(details).strip() or card["details"]
    return True


def _apply_add_card(board: dict[str, Any], column_id: str, title: str, details: str | None = None) -> bool:
    columns = board.get("columns", [])
    if not isinstance(columns, list):
        return False

    target_column = next((column for column in columns if isinstance(column, dict) and column.get("id") == column_id), None)
    if target_column is None or not isinstance(target_column.get("cardIds", []), list):
        return False

    new_id = f"card-{len(board.get('cards', {})) + 1}"
    while new_id in board.get("cards", {}):
        new_id = f"{new_id}-copy"

    card = {"id": new_id, "title": str(title).strip(), "details": str(details or "No details yet.")}
    board.setdefault("cards", {})[new_id] = card
    target_column.setdefault("cardIds", []).append(new_id)
    return True


def _apply_delete_card(board: dict[str, Any], card_id: str) -> bool:
    cards = board.get("cards", {})
    if not isinstance(cards, dict) or card_id not in cards:
        return False
    del cards[card_id]

    for column in board.get("columns", []):
        if not isinstance(column, dict):
            continue
        card_ids = column.get("cardIds", [])
        if isinstance(card_ids, list):
            column["cardIds"] = [existing_id for existing_id in card_ids if existing_id != card_id]
    return True


def _apply_rename_column(board: dict[str, Any], column_id: str, title: str) -> bool:
    columns = board.get("columns", [])
    if not isinstance(columns, list):
        return False

    for column in columns:
        if isinstance(column, dict) and column.get("id") == column_id:
            column["title"] = str(title).strip() or column.get("title", "")
            return True
    return False


def apply_board_actions(board: dict[str, Any], actions: list[Any]) -> dict[str, Any]:
    next_board = deepcopy(board)
    if not isinstance(actions, list):
        return next_board

    for action in actions:
        sanitized = _sanitize_action(action)
        if sanitized is None:
            continue

        action_type = sanitized["type"]
        if action_type == "move_card":
            _apply_move_card(next_board, str(sanitized["cardId"]), str(sanitized["columnId"]))
        elif action_type == "rename_card":
            _apply_rename_card(next_board, str(sanitized["cardId"]), sanitized.get("title"), sanitized.get("details"))
        elif action_type == "add_card":
            _apply_add_card(next_board, str(sanitized["columnId"]), str(sanitized["title"]), sanitized.get("details"))
        elif action_type == "delete_card":
            _apply_delete_card(next_board, str(sanitized["cardId"]))
        elif action_type == "rename_column":
            _apply_rename_column(next_board, str(sanitized["columnId"]), str(sanitized["title"]))

    return next_board


def parse_structured_ai_response(raw_text: str) -> dict[str, Any]:
    if not isinstance(raw_text, str):
        return {"message": "I processed your request.", "actions": []}

    text = raw_text.strip()
    if not text:
        return {"message": "I processed your request.", "actions": []}

    if text.startswith("```"):
        fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, flags=re.DOTALL)
        if fenced:
            text = fenced.group(1)

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        text = text[start : end + 1]

    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return {"message": text, "actions": []}

    if not isinstance(payload, dict):
        return {"message": "I processed your request.", "actions": []}

    actions = payload.get("actions", [])
    if not isinstance(actions, list):
        return {"message": str(payload.get("message") or "I processed your request."), "actions": []}

    sanitized_actions = []
    for action in actions:
        sanitized = _sanitize_action(action)
        if sanitized is not None:
            sanitized_actions.append(sanitized)

    return {
        "message": str(payload.get("message") or "I processed your request."),
        "actions": sanitized_actions,
    }


async def generate_board_ai_response(
    prompt: str,
    board: dict[str, Any] | None = None,
    conversation: list[dict[str, Any]] | None = None,
    model: str | None = None,
    openrouter_client: Any | None = None,
) -> dict[str, Any]:
    if not prompt or not prompt.strip():
        raise ValueError("Prompt cannot be empty.")

    client = openrouter_client or call_openrouter

    if board is None:
        response = await client(prompt, model=model)
        return {"message": response["content"], "model": response["model"], "board": None, "actions": []}

    structured_prompt = build_board_prompt(board, prompt, conversation)
    response = await client(structured_prompt, model=model)
    parsed = parse_structured_ai_response(response["content"])
    next_board = apply_board_actions(board, parsed.get("actions", []))
    return {
        "message": str(parsed.get("message") or "I processed your request."),
        "model": response["model"],
        "board": next_board,
        "actions": parsed.get("actions", []),
    }


async def call_openrouter(prompt: str, model: str | None = None) -> dict[str, Any]:
    if not prompt or not prompt.strip():
        raise ValueError("Prompt cannot be empty.")

    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise ValueError("OPENROUTER_API_KEY is not configured.")

    selected_model = model or os.getenv("OPENROUTER_MODEL", DEFAULT_MODEL)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:8000",
        "X-Title": "Project Management MVP",
    }
    payload = {
        "model": selected_model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            json=payload,
            headers=headers,
        )

    if response.status_code >= 400:
        details = response.text
        raise RuntimeError(f"OpenRouter request failed ({response.status_code}): {details}")

    data = response.json()
    choices = data.get("choices", [])
    if not choices:
        raise RuntimeError("OpenRouter returned no choices.")

    message = choices[0].get("message", {})
    raw_content = message.get("content", "")
    if isinstance(raw_content, list):
        text_parts: list[str] = []
        for item in raw_content:
            if isinstance(item, dict) and "text" in item:
                text_parts.append(str(item["text"]))
        content = "\n".join(text_parts) if text_parts else ""
    else:
        content = str(raw_content)

    if not content.strip():
        raise RuntimeError("OpenRouter returned an empty response.")

    model_name = data.get("model") or selected_model
    return {"model": model_name, "content": content.strip()}
