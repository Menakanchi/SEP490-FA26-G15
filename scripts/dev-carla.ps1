param(
    [string]$CarlaRoot = 'C:\Carla_package',
    [string]$ScenarioRunnerRoot = (Join-Path $env:USERPROFILE 'scenario_runner'),
    [switch]$RestartBackend,
    # Dev: hien cua so CARLA va ve toc do/ban dap canh xe (follow_hero --hud). Chu chi o cua so server, khong vao anh camera.
    [switch]$Hud
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repoRoot 'worker\.venv-carla\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'Run scripts\setup-carla.ps1 first.' }
if (-not (Test-Path -LiteralPath (Join-Path $ScenarioRunnerRoot 'scenario_runner.py'))) { throw 'ScenarioRunner is missing. Run scripts\setup-carla.ps1.' }
# Controller Python gọi lõi Java qua cầu nối (ADR-042): cần lõi đã biên dịch. Thiếu thì biên dịch một lần.
$core = Join-Path $repoRoot 'target\classes\com\vsos\core\bridge\BridgeMain.class'
if (-not (Test-Path -LiteralPath $core)) {
    & (Join-Path $repoRoot 'mvnw.cmd') -q -B compile
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $core)) { throw 'Could not compile the Java core (mvnw compile).' }
}
$env:CARLA_ROOT = $CarlaRoot
$env:SR_ROOT = $ScenarioRunnerRoot
$env:VEHICSIM_WORKER_PYTHON = $python
$env:VEHICSIM_SIMULATOR = 'carla-xosc'
$env:VEHICSIM_CARLA_VERSION = '0.9.16'
$env:SIMULATION_TIMEOUT_S = '300'
$runner = @($python, (Join-Path $repoRoot 'worker\run_xosc.py'), '--camera')
if ($Hud) { $runner += '--hud' }
$env:VEHICSIM_CARLA_COMMAND = ConvertTo-Json -Compress -InputObject $runner
if (-not (Get-NetTCPConnection -LocalPort 2000 -State Listen -ErrorAction SilentlyContinue)) {
    $server = Join-Path $CarlaRoot 'CarlaUE4.exe'
    if (-not (Test-Path -LiteralPath $server)) { throw "CARLA server not found at $server" }
    $window = if ($Hud) { 'Normal' } else { 'Hidden' }
    $resolution = if ($Hud) { @('-ResX=1280','-ResY=720') } else { @('-ResX=800','-ResY=600') }
    Start-Process -FilePath $server -ArgumentList (@('/Game/Carla/Maps/Town04','-windowed') + $resolution + '-quality-level=Low') -WorkingDirectory $CarlaRoot -WindowStyle $window
} elseif ($Hud) {
    # Server da bat an (lan chay truoc khong co -Hud): hien lai cua so thay vi khoi dong lai CARLA.
    Add-Type -Namespace VehicSim -Name Win32 -MemberDefinition @'
public delegate bool EnumProc(System.IntPtr h, System.IntPtr p);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, System.IntPtr p);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern int GetWindowTextLength(System.IntPtr h);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int cmd);
'@
    $ids = @(Get-Process -Name 'CarlaUE4*' -ErrorAction SilentlyContinue | ForEach-Object Id)
    $shown = 0
    [void][VehicSim.Win32]::EnumWindows({ param($h, $p)
        $windowPid = [uint32]0
        [void][VehicSim.Win32]::GetWindowThreadProcessId($h, [ref]$windowPid)
        if ($ids -contains [int]$windowPid -and [VehicSim.Win32]::GetWindowTextLength($h) -gt 0) {
            [void][VehicSim.Win32]::ShowWindow($h, 5); $script:shown++
        }
        $true }, [IntPtr]::Zero)
    if ($shown -eq 0) { Write-Warning 'CARLA is running but its window was not found; restart CARLA to see the HUD.' }
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
