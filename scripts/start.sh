#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
if ! command -v docker >/dev/null 2>&1; then
  echo "docker was not found on PATH. Install Docker (with Compose) and make sure docker is on PATH, then retry." >&2
  exit 1
fi
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env. Set OPENROUTER_API_KEY there to enable the assistant."
fi
docker compose -p pm-mvp up --build --detach --wait
echo "Project Management MVP: http://127.0.0.1:8000"
