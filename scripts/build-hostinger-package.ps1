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

foreach ($directory in @('css', 'image', 'js', 'shared', 'pricing', 'catalog', 'business-card', 'cards', 'cart', 'brief', 'staff', 'material-preview')) {
  Copy-Item -LiteralPath (Join-Path $sourceRoot $directory) -Destination $resolvedOutput -Recurse
}

# Notes and dev files are not part of the site (.htaccess also refuses them, but they need not be uploaded at all).
# (-Include is ignored together with -LiteralPath in Windows PowerShell 5.1, so filter on the extension instead.)
Get-ChildItem -LiteralPath $resolvedOutput -Recurse -File |
  Where-Object { @('.md', '.mjs', '.toml') -contains $_.Extension.ToLowerInvariant() } |
  Remove-Item -Force

# Card originals (.png) are not used by the pages when a .webp of the same picture exists.
$cardAssets = Join-Path (Join-Path $resolvedOutput 'cards') 'assets'
if (Test-Path -LiteralPath $cardAssets) {
  Get-ChildItem -LiteralPath $cardAssets -File -Filter '*.png' |
    Where-Object { Test-Path -LiteralPath ([System.IO.Path]::ChangeExtension($_.FullName, '.webp')) } |
    Remove-Item -Force
}

$files = Get-ChildItem -LiteralPath $resolvedOutput -Recurse -File
$totalBytes = ($files | Measure-Object -Property Length -Sum).Sum
Write-Output "Hostinger package ready: $resolvedOutput"
Write-Output "Files: $($files.Count)"
Write-Output "Bytes: $totalBytes"
