[CmdletBinding()]
param(
  [string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$sourceRoot = Join-Path $projectRoot 'iprint-plus-cost-calculator'
if (-not $OutputPath) {
  $OutputPath = Join-Path $projectRoot 'deploy\hostinger-iprint'
}
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$deployRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'deploy'))

if (-not $resolvedOutput.StartsWith($deployRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "OutputPath must remain inside $deployRoot"
}

if (Test-Path -LiteralPath $resolvedOutput) {
  Remove-Item -LiteralPath $resolvedOutput -Recurse -Force
}

New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null

foreach ($file in @('index.html', '.htaccess')) {
  Copy-Item -LiteralPath (Join-Path $sourceRoot $file) -Destination $resolvedOutput
}

foreach ($directory in @('css', 'image', 'js')) {
  Copy-Item -LiteralPath (Join-Path $sourceRoot $directory) -Destination $resolvedOutput -Recurse
}

$files = Get-ChildItem -LiteralPath $resolvedOutput -Recurse -File
$totalBytes = ($files | Measure-Object -Property Length -Sum).Sum
Write-Output "Hostinger package ready: $resolvedOutput"
Write-Output "Files: $($files.Count)"
Write-Output "Bytes: $totalBytes"
