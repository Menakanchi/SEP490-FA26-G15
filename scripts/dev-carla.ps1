param(
    [string]$CarlaRoot = 'C:\Carla_package',
    [string]$ScenarioRunnerRoot = (Join-Path $env:USERPROFILE 'scenario_runner'),
    [switch]$RestartBackend
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repoRoot 'worker\.venv-carla\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'Run scripts\setup-carla.ps1 first.' }
if (-not (Test-Path -LiteralPath (Join-Path $ScenarioRunnerRoot 'scenario_runner.py'))) { throw 'ScenarioRunner is missing. Run scripts\setup-carla.ps1.' }
$env:CARLA_ROOT = $CarlaRoot
$env:SR_ROOT = $ScenarioRunnerRoot
$env:VEHICSIM_WORKER_PYTHON = $python
$env:VEHICSIM_SIMULATOR = 'carla-xosc'
$env:VEHICSIM_CARLA_VERSION = '0.9.16'
$env:SIMULATION_TIMEOUT_S = '300'
$env:VEHICSIM_CARLA_COMMAND = ConvertTo-Json -Compress -InputObject @($python, (Join-Path $repoRoot 'worker\run_xosc.py'), '--camera')
if (-not (Get-NetTCPConnection -LocalPort 2000 -State Listen -ErrorAction SilentlyContinue)) {
    $server = Join-Path $CarlaRoot 'CarlaUE4.exe'
    if (-not (Test-Path -LiteralPath $server)) { throw "CARLA server not found at $server" }
    Start-Process -FilePath $server -ArgumentList '/Game/Carla/Maps/Town04','-windowed','-ResX=800','-ResY=600','-quality-level=Low' -WorkingDirectory $CarlaRoot -WindowStyle Hidden
}
$listener = Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
    if (-not $RestartBackend) { throw 'Backend is already running. Use -RestartBackend to apply the CARLA configuration.' }
    $backendProcess = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $listener.OwningProcess)
    $backendCommand = $backendProcess.CommandLine
    # spring-boot:run co the dat classpath trong Java @argfile, voi dau \\ escape.
    if ($backendCommand -match '@(?:"([^"]+)"|([^\s"]+))') {
        $argumentFile = if ($Matches[1]) { $Matches[1] } else { $Matches[2] }
        if (Test-Path -LiteralPath $argumentFile -PathType Leaf) {
            $backendCommand += ' ' + [IO.File]::ReadAllText($argumentFile).Replace('\\', '\')
        }
    }
    if ($backendProcess.Name -ne 'java.exe' -or $backendCommand.IndexOf($repoRoot, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
        throw 'Port 8001 belongs to another application; it was not stopped.'
    }
    Stop-Process -Id $listener.OwningProcess
}
& (Join-Path $PSScriptRoot 'dev-up.ps1') -Hidden
Write-Host 'Open http://localhost:3000/analysis/carla. Scenario files are .xosc; results and sensor data are saved automatically.'
