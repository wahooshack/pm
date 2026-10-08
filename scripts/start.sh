#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v uv >/dev/null 2>&1; then
  python3 -m pip install --user uv
fi

python3 -m venv .venv
source .venv/bin/activate
uv pip install --python .venv/bin/python -r backend/requirements.txt
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
