<#
Start VehicSim locally on Windows:
  Docker Desktop -> MySQL + Redis (docker compose)
  Celery worker (queue vehicsim.simulation, --pool=solo)
  Backend  http://localhost:8001  (FastAPI)
  Frontend http://localhost:3000  (Next.js dev)

Each service opens in its own PowerShell window; close the window to stop it.
Services that are already running are skipped, so running this twice is safe.
Usage: double-click scripts\dev-up.cmd, or
       powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1
(ASCII only on purpose: Windows PowerShell 5.1 misreads UTF-8 without BOM.)
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$uv = (Get-Command uv -ErrorAction SilentlyContinue).Source
if (-not $uv) { $uv = Join-Path $env:APPDATA 'Python\Python311\Scripts\uv.exe' }
if (-not (Test-Path $uv)) { throw "uv not found. Install it with: pip install --user uv" }

# Run a native command silently and return success. Goes through cmd.exe because
# Windows PowerShell 5.1 turns redirected stderr (e.g. compose warnings) into errors.
function Test-Quiet([string]$commandLine) {
    cmd /c "$commandLine >nul 2>&1"
    return $LASTEXITCODE -eq 0
}

function Test-Port([int]$port) {
    [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Start-Window([string]$title, [string]$dir, [string]$command) {
    $script = "`$host.UI.RawUI.WindowTitle = '$title'; Set-Location '$dir'; $command"
    Start-Process powershell -WorkingDirectory $dir -ArgumentList '-NoExit', '-NoProfile', '-Command', $script | Out-Null
    Write-Host "  started: $title"
}

# 1. Docker Desktop
if (-not (Test-Quiet 'docker info')) {
    Write-Host 'Starting Docker Desktop...'
    Start-Process (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe')
    $deadline = (Get-Date).AddMinutes(4)
    do { Start-Sleep -Seconds 2 } until ((Test-Quiet 'docker info') -or (Get-Date) -gt $deadline)
    if (-not (Test-Quiet 'docker info')) { throw 'Docker did not start within 4 minutes.' }
}

# 2. MySQL + Redis
Write-Host 'Starting MySQL + Redis...'
$compose = "docker compose -f `"$(Join-Path $root 'docker-compose.yml')`""
if (-not (Test-Quiet "$compose up -d mysql redis")) { throw 'docker compose up failed.' }
$deadline = (Get-Date).AddMinutes(2)
do { Start-Sleep -Seconds 2 } until ((Test-Quiet "$compose exec -T mysql mysqladmin ping -h 127.0.0.1 --silent") -or (Get-Date) -gt $deadline)
Write-Host '  MySQL + Redis ready'

# 3. App services
Write-Host 'Starting app services...'
$env:PYTHONIOENCODING = 'utf-8'
$workerRunning = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'celery -A src\.celery_app worker' }
if ($workerRunning) { Write-Host '  skip: Celery worker already running' }
else { Start-Window 'VehicSim worker' $root "& '$uv' run celery -A src.celery_app worker --pool=solo --loglevel=INFO -Q vehicsim.simulation" }

if (Test-Port 8001) { Write-Host '  skip: port 8001 already in use (backend running?)' }
else { Start-Window 'VehicSim backend :8001' $root "& '$uv' run uvicorn src.main:app --host 127.0.0.1 --port 8001" }

if (Test-Port 3000) { Write-Host '  skip: port 3000 already in use (frontend running?)' }
else { Start-Window 'VehicSim frontend :3000' (Join-Path $root 'frontend') "`$env:NEXT_PUBLIC_API_URL = 'http://localhost:8001'; npm run dev -- --port 3000" }

Write-Host ''
Write-Host 'Open http://localhost:3000 (backend health: http://localhost:8001/health)'
