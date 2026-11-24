[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputDirectory,
    [switch]$Build
)
$ErrorActionPreference = 'Stop'
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$inputFile = (Resolve-Path -LiteralPath $InputPath -ErrorAction Stop).Path
$outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $outputRoot) { throw 'OUTPUT_EXISTS: choose a new output directory' }

Push-Location $repositoryRoot
try {
    if ($Build) {
        & (Join-Path $repositoryRoot 'mvnw.cmd') -B '-DskipTests' compile
        if ($LASTEXITCODE -ne 0) { throw 'MAVEN_COMPILE_FAILED' }
    }
    if (-not (Test-Path -LiteralPath (Join-Path $repositoryRoot 'target/classes/com/vsos/core/failureanalysis/OfflineDiagnosticAnalysis.class'))) {
        throw 'COMPILED_CLASSES_MISSING: compile the repository or pass -Build'
    }
    $diagnostics = Join-Path $outputRoot 'diagnostics'
    & java -Xmx2g -cp target/classes com.vsos.core.failureanalysis.OfflineDiagnosticAnalysis $inputFile $diagnostics
    if ($LASTEXITCODE -ne 0) { throw 'DIAGNOSTIC_EXPORT_FAILED: inspect CLI error/intake manifest' }
    $intakePath = Join-Path $diagnostics '_input_manifest.json'
    if (Test-Path -LiteralPath $intakePath) {
        $intake = Get-Content -LiteralPath $intakePath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($intake.status -ne 'COMPLETE') { throw 'INCOMPLETE_INPUT_POPULATION: diagnostic output retained; no handoff created' }
    }
    $handoff = Join-Path $outputRoot 'handoff.json'
    & java -Xmx2g -cp target/classes com.vsos.core.failureanalysis.OfflineMoboHandoff $inputFile $diagnostics $handoff $repositoryRoot
    if ($LASTEXITCODE -ne 0) { throw 'HANDOFF_EXPORT_FAILED' }
    $handoffSha = (Get-FileHash -LiteralPath $handoff -Algorithm SHA256).Hash.ToLowerInvariant()
    $compatibility = Join-Path $outputRoot 'compatibility.json'
    & java -Xmx2g -cp target/classes com.vsos.core.failureanalysis.OfflineConsumerCompatibility $handoff $handoffSha $repositoryRoot $compatibility
    if ($LASTEXITCODE -ne 0) { throw 'COMPATIBILITY_VALIDATION_FAILED' }
    Write-Output ('OFFLINE_EXPORT_COMPLETE_NO_DISPATCH: ' + $outputRoot)
    Write-Output 'Read compatibility.json and eligibility_manifest; this script never runs MOBO.'
}
finally { Pop-Location }
