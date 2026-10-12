$ErrorActionPreference = "Stop"
$rootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker with Compose is required. Start Docker Desktop and retry."
}
if (-not (Test-Path -LiteralPath (Join-Path $rootDir ".env"))) {
    Copy-Item -LiteralPath (Join-Path $rootDir ".env.example") -Destination (Join-Path $rootDir ".env")
    Write-Host "Created .env. Set OPENROUTER_API_KEY there to enable the assistant."
}
Push-Location $rootDir
try {
    docker compose -p pm-mvp up --build --detach --wait
    if ($LASTEXITCODE -ne 0) { throw "Docker startup failed (exit $LASTEXITCODE)." }
    Write-Host "Project Management MVP: http://127.0.0.1:8000"
} finally { Pop-Location }
