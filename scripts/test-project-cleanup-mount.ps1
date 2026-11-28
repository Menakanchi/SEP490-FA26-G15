<#
.SYNOPSIS
Exercise real mount loss and retry in disposable Docker containers.
.DESCRIPTION
Build the backend JAR first with .\mvnw.cmd -B -DskipTests package. Docker must
have mysql:8.4 and a Java 21 runtime image available. The script does not bind
host paths or expose ports. It grants SYS_ADMIN only to the disposable app
container, whose mount namespace is used for both bind mounts and unmounts.
#>
param(
    [string]$JavaImage = 'eclipse-temurin:21-jre',
    [string]$MysqlImage = 'mysql:8.4'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$jar = Join-Path $repo 'target/vehicsim-backend-1.0.0.jar'
if (-not (Test-Path -LiteralPath $jar -PathType Leaf)) { throw 'Build target/vehicsim-backend-1.0.0.jar first.' }
$suffix = [guid]::NewGuid().ToString('N').Substring(0, 12)
$networkName = "vsos-mount-net-$suffix"
$dbName = "vsos-mount-db-$suffix"
$appName = "vsos-mount-app-$suffix"
$storageId = [guid]::NewGuid().ToString()
$networkId = $null
$dbId = $null
$appId = $null

function Invoke-Docker {
    param([string[]]$Arguments)
    $output = & docker @Arguments
    if ($LASTEXITCODE -ne 0) { throw "docker $($Arguments[0]) failed ($LASTEXITCODE)" }
    return $output
}
function Sql([string]$query) {
    $output = & docker exec -e MYSQL_PWD=vsos-demo-only $dbId mysql -N -uroot vsos_mount_demo -e $query 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Demo MySQL query failed: $output" }
    return @($output)
}
function App([string]$command) { Invoke-Docker -Arguments @('exec', $appId, 'sh', '-c', $command) }
function Wait-Until([scriptblock]$condition, [int]$seconds, [string]$description) {
    $until = [DateTime]::UtcNow.AddSeconds($seconds)
    do {
        if (& $condition) { return }
        Start-Sleep -Seconds 2
    } while ([DateTime]::UtcNow -lt $until)
    throw "Timed out: $description"
}
function Warning-Count {
    $output = App "grep -c 'Chưa thể thử lại dọn file project:' /tmp/app.log || true"
    return [int]($output | Select-Object -Last 1)
}
function Check-Pending([long]$id) {
    $pending = @(Sql "SELECT COUNT(*) FROM project_local_cleanup WHERE run_id=$id")
    if ([int]$pending[0] -ne 1) { throw "Cleanup job $id disappeared while the mount was absent (count: $pending)." }
    $other = @(Sql 'SELECT COUNT(*) FROM projects WHERE id=2; SELECT COUNT(*) FROM simulation_runs WHERE project_id=2')
    if ([int]$other[0] -ne 1 -or [int]$other[1] -ne 1) { throw 'Other project data changed.' }
    App "test -f /tmp/source/$id/result.txt && test `"`$(cat /tmp/source/2/result.txt)`" = demo-b" | Out-Null
}

try {
    $networkId = (Invoke-Docker -Arguments @('network', 'create', $networkName) | Select-Object -Last 1).Trim()
    $dbId = (Invoke-Docker -Arguments @('run', '-d', '--name', $dbName, '--network', $networkName,
            '-e', 'MYSQL_ROOT_PASSWORD=vsos-demo-only', '-e', 'MYSQL_ROOT_HOST=%',
            '-e', 'MYSQL_DATABASE=vsos_mount_demo', $MysqlImage) | Select-Object -Last 1).Trim()
    $appId = (Invoke-Docker -Arguments @('run', '-d', '--name', $appName, '--network', $networkName,
            '--cap-add', 'SYS_ADMIN', '--security-opt', 'seccomp=unconfined', '--user', 'root',
            '--entrypoint', 'sh', $JavaImage, '-c', 'sleep 3600') | Select-Object -Last 1).Trim()
    Invoke-Docker -Arguments @('cp', $jar, "${appId}:/tmp/backend.jar") | Out-Null
    Wait-Until { & docker exec -e MYSQL_PWD=vsos-demo-only $dbId mysql -N -uroot vsos_mount_demo -e 'SELECT 1' 2>$null | Out-Null; $LASTEXITCODE -eq 0 } 90 'demo MySQL startup'
    Sql "CREATE TABLE project_local_storage (id TINYINT PRIMARY KEY, storage_id CHAR(36)); CREATE TABLE project_local_cleanup (run_id BIGINT PRIMARY KEY, storage_id CHAR(36), created_at DATETIME DEFAULT CURRENT_TIMESTAMP); CREATE TABLE simulation_runs (id BIGINT PRIMARY KEY, project_id BIGINT); CREATE TABLE projects (id BIGINT PRIMARY KEY, name VARCHAR(64)); INSERT INTO project_local_storage VALUES (1,'$storageId'); INSERT INTO projects VALUES (2,'preserved'); INSERT INTO simulation_runs VALUES (2,2);" | Out-Null
    App "mkdir -p /tmp/root-source/runs /tmp/data-root /tmp/source/1 /tmp/source/2 /tmp/source/3; printf $storageId > /tmp/root-source/.vsos-storage-id; printf $storageId > /tmp/source/.vsos-storage-id; printf demo-a > /tmp/source/1/result.txt; printf demo-b > /tmp/source/2/result.txt; printf demo-c > /tmp/source/3/result.txt; mount --bind /tmp/root-source /tmp/data-root; mount --bind /tmp/source /tmp/data-root/runs; mountpoint -q /tmp/data-root; mountpoint -q /tmp/data-root/runs" | Out-Null
    $start = "cd /tmp && java -jar /tmp/backend.jar --spring.datasource.url=jdbc:mysql://${dbName}:3306/vsos_mount_demo --spring.datasource.username=root --spring.datasource.password=vsos-demo-only --server.port=0 --vehicsim.recover-on-startup=false --vehicsim.data-root=/tmp/data-root > /tmp/app.log 2>&1"
    Invoke-Docker -Arguments @('exec', '-d', $appId, 'sh', '-c', $start) | Out-Null
    Wait-Until { & docker exec $appId sh -c "grep -q 'Started VsosApplication' /tmp/app.log"; $LASTEXITCODE -eq 0 } 120 'demo backend startup'

    foreach ($case in @(@{ Id = 1; Root = $false }, @{ Id = 3; Root = $true })) {
        $before = Warning-Count
        App 'umount /tmp/data-root/runs && ! mountpoint -q /tmp/data-root/runs' | Out-Null
        if ($case.Root) { App 'umount /tmp/data-root && ! mountpoint -q /tmp/data-root' | Out-Null }
        Sql "INSERT INTO project_local_cleanup (run_id,storage_id) VALUES ($($case.Id),'$storageId')" | Out-Null
        Wait-Until { (Warning-Count) -gt $before } 60 'worker notices missing mount'
        Check-Pending $case.Id
        if ($case.Root) { App 'mount --bind /tmp/root-source /tmp/data-root && mountpoint -q /tmp/data-root' | Out-Null }
        App 'mount --bind /tmp/source /tmp/data-root/runs && mountpoint -q /tmp/data-root/runs' | Out-Null
        Wait-Until { $count = @(Sql "SELECT COUNT(*) FROM project_local_cleanup WHERE run_id=$($case.Id)"); [int]$count[0] -eq 0 } 60 'retry after remount'
        App "test ! -e /tmp/source/$($case.Id) && test `"`$(cat /tmp/source/2/result.txt)`" = demo-b" | Out-Null
        $other = @(Sql 'SELECT COUNT(*) FROM projects WHERE id=2; SELECT COUNT(*) FROM simulation_runs WHERE project_id=2')
        if ([int]$other[0] -ne 1 -or [int]$other[1] -ne 1) { throw 'Other project data changed.' }
        Write-Output "PASS: $(if ($case.Root) { 'data root' } else { 'runs submount' }) unmounted and remounted; retry completed, other project intact."
    }
} finally {
    if ($appId) { & docker rm -f -v $appId | Out-Null }
    if ($dbId) { & docker rm -f -v $dbId | Out-Null }
    if ($networkId) { & docker network rm $networkId | Out-Null }
}
