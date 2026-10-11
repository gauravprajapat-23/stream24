$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $root
if (-not (Test-Path ".\apps\agent\config.json")) {
  Copy-Item ".\apps\agent\config.example.json" ".\apps\agent\config.json"
  Write-Host "Created apps\agent\config.json. Paste the worker token from the dashboard, then run this script again." -ForegroundColor Yellow
  exit 1
}
node .\apps\agent\agent.mjs
