param([string]$ScenarioRunnerRoot = (Join-Path $env:USERPROFILE 'scenario_runner'))
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$venvRoot = Join-Path $repoRoot 'worker\.venv-carla'
$python = Join-Path $venvRoot 'Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    py -3.12 -m venv $venvRoot
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.12 is required (py -3.12).' }
}
& $python -m pip install -r (Join-Path $repoRoot 'worker\requirements-carla-0.9.16.txt')
if ($LASTEXITCODE -ne 0) { throw 'CARLA dependencies could not be installed.' }
if (-not (Test-Path -LiteralPath $ScenarioRunnerRoot)) {
    git clone --depth 1 --branch v0.9.16 https://github.com/carla-simulator/scenario_runner.git $ScenarioRunnerRoot
    if ($LASTEXITCODE -ne 0) { throw 'ScenarioRunner clone failed.' }
}
if (-not (Test-Path -LiteralPath (Join-Path $ScenarioRunnerRoot 'scenario_runner.py'))) { throw 'SR_ROOT is not a ScenarioRunner checkout.' }
Write-Host 'Ready. Run scripts\dev-carla.ps1 -RestartBackend to use OpenSCENARIO from the web.'
