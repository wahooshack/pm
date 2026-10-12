$ErrorActionPreference = "Stop"
$rootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $rootDir
try {
    docker compose -p pm-mvp stop
    if ($LASTEXITCODE -ne 0) { throw "Docker stop failed (exit $LASTEXITCODE)." }
} finally { Pop-Location }
