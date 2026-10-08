$ErrorActionPreference = "Stop"

$processes = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if ($processes) {
    foreach ($process in $processes) {
        if ($process.OwningProcess) {
            Stop-Process -Id $process.OwningProcess -Force
        }
    }
}
