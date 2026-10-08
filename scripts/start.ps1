$ErrorActionPreference = "Stop"

$rootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $rootDir

$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCommand) {
    throw "Python is required but was not found on PATH. Install Python 3.12 and retry."
}

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    & $pythonCommand.Source -m pip install --user uv
}

if (-not (Test-Path ".venv")) {
    & $pythonCommand.Source -m venv .venv
}

. .\.venv\Scripts\Activate.ps1
uv pip install --python .\.venv\Scripts\python.exe -r .\backend\requirements.txt
if (Test-Path ".\frontend\package.json") {
    Set-Location .\frontend
    if (-not (Test-Path "node_modules")) {
        npm install
    }
    npm run build
    Set-Location $rootDir
}
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
