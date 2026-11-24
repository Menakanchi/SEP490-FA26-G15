# Author-workspace maintenance only. Not needed to install/run the curated handover.
# Default is a read-only preview. The agent did NOT execute -Apply: automatic
# review rejected bulk deletion. A user may inspect and run this locally.
[CmdletBinding()]
param(
    [string]$PlanPath = 'target/fa-handover-cleanup-plan.json',
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'
$cleanupPlan = Get-Content -LiteralPath $PlanPath -Raw -Encoding UTF8 | ConvertFrom-Json
$cleanupRoot = (Resolve-Path -LiteralPath 'docs/failure-analysis-v3').Path
$cleanupPrefix = $cleanupRoot + [System.IO.Path]::DirectorySeparatorChar
if ($cleanupRoot -ne $cleanupPlan.allowed_root) { throw 'Plan belongs to a different workspace' }
if ((Get-FileHash -LiteralPath $cleanupPlan.archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $cleanupPlan.archive_sha256) { throw 'Verified backup is missing or changed' }
$linkedDirs = @(Get-ChildItem -LiteralPath $cleanupRoot -Directory -Recurse -Force | Where-Object { ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 })
if ($linkedDirs.Count -gt 0) { throw 'Reparse-point directory in cleanup scope; inspect manually' }
$existing = @()
foreach ($cleanupEntry in $cleanupPlan.deletions) {
    if (-not (Test-Path -LiteralPath $cleanupEntry.path)) { continue }
    $cleanupPath = (Resolve-Path -LiteralPath $cleanupEntry.path -ErrorAction Stop).Path
    if (-not $cleanupPath.StartsWith($cleanupPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Target outside cleanup root: $cleanupPath" }
    $cleanupFile = Get-Item -LiteralPath $cleanupPath -Force
    if ($cleanupFile.PSIsContainer -or (($cleanupFile.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)) { throw "Unsafe cleanup target: $cleanupPath" }
    if ((Get-FileHash -LiteralPath $cleanupPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $cleanupEntry.sha256_before) { throw "File changed since inventory: $cleanupPath" }
    $existing += $cleanupPath
}
Write-Output ('Verified redundant files in plan: ' + $existing.Count)
Write-Output ('Backup: ' + $cleanupPlan.archive)
if (-not $Apply) { Write-Output 'PREVIEW_ONLY: no files removed. Inspect plan and backup before using -Apply.'; return }
foreach ($cleanupPath in $existing) { Remove-Item -LiteralPath $cleanupPath -Force -ErrorAction Stop }
# Only empty directories; never recursive directory removal.
foreach ($cleanupDirectory in @(Get-ChildItem -LiteralPath $cleanupRoot -Directory -Recurse -Force | Sort-Object { $_.FullName.Length } -Descending)) {
    $cleanupDirPath = [System.IO.Path]::GetFullPath($cleanupDirectory.FullName)
    if (-not $cleanupDirPath.StartsWith($cleanupPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Directory outside cleanup root' }
    if (@(Get-ChildItem -LiteralPath $cleanupDirPath -Force).Count -eq 0) { Remove-Item -LiteralPath $cleanupDirPath -Force -ErrorAction Stop }
}
Write-Output ('REMOVED: ' + $existing.Count)
