param([string]$InstallDir = (Resolve-Path "$PSScriptRoot\..\..").Path)
$ErrorActionPreference = 'Stop'
Set-Location $InstallDir
$envFile = Join-Path $InstallDir 'data\stream24.env.ps1'
if (Test-Path $envFile) { . $envFile }
$node = (Get-Command node -ErrorAction Stop).Source
& $node 'apps\server\server.mjs'
