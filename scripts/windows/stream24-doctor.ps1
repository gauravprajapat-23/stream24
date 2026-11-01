$ErrorActionPreference = 'Stop'
$checks = [System.Collections.Generic.List[object]]::new()
function Add-Check([string]$Name,[string]$Status,[string]$Detail) {
  $checks.Add([pscustomobject]@{Check=$Name;Status=$Status;Detail=$Detail})
}

$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  $nodeVersion = (node --version 2>$null).Trim()
  $parsed = [version]($nodeVersion -replace '^v','')
  $supported = $parsed -ge [version]'20.19.0'
  Add-Check 'Node.js 20.19+' $(if($supported){'PASS'}else{'FAIL'}) $nodeVersion
} else { Add-Check 'Node.js 20.19+' 'FAIL' 'Not found on PATH; install Node.js 20.19+ (Node.js 22 LTS recommended).' }

$ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
$ffprobe = Get-Command ffprobe -ErrorAction SilentlyContinue
Add-Check 'FFmpeg' $(if($ffmpeg){'PASS'}else{'WARN'}) $(if($ffmpeg){(ffmpeg -version 2>$null | Select-Object -First 1)}else{'Not found. Run npm run install:ffmpeg or scripts\windows\install-ffmpeg.ps1.'})
Add-Check 'FFprobe' $(if($ffprobe){'PASS'}else{'WARN'}) $(if($ffprobe){(ffprobe -version 2>$null | Select-Object -First 1)}else{'Not found. Install FFmpeg essentials; FFprobe is required too.'})

$configPath = 'apps\agent\config.json'
if (Test-Path $configPath) {
  try {
    $cfg = Get-Content -Raw $configPath | ConvertFrom-Json
    $tokenOk = -not [string]::IsNullOrWhiteSpace([string]$cfg.agentToken) -and $cfg.agentToken -ne 'PASTE_WORKER_TOKEN_HERE'
    Add-Check 'Worker config JSON' 'PASS' 'Valid JSON.'
    Add-Check 'Worker token' $(if($tokenOk){'PASS'}else{'WARN'}) $(if($tokenOk){'Configured'}else{'Missing placeholder token; create a worker in the dashboard and paste its token.'})
    try { $null = [uri]$cfg.serverUrl; Add-Check 'Worker server URL' 'PASS' ([string]$cfg.serverUrl) } catch { Add-Check 'Worker server URL' 'FAIL' 'Invalid serverUrl in config.json.' }
  } catch { Add-Check 'Worker config JSON' 'FAIL' $_.Exception.Message }
} else { Add-Check 'Worker config' 'WARN' 'Not created yet. Copy config.example.json to config.json after creating a dashboard worker.' }

$envFile = Test-Path '.env'
$envKey = -not [string]::IsNullOrWhiteSpace($env:APP_MASTER_KEY)
if ($envFile) {
  $envText = Get-Content -Raw '.env'
  if ($envText -match '(?m)^\s*APP_MASTER_KEY\s*=\s*([^\r\n#]+)') { $envKey = $true }
}
Add-Check 'APP_MASTER_KEY' $(if($envKey){'PASS'}else{'WARN'}) $(if($envKey){'Found in process environment or root .env'}else{'Not found. Run npm run keygen and save the key in root .env.'})
Add-Check 'Database' $(if(Test-Path 'data\db.json'){'PASS'}else{'INFO'}) $(if(Test-Path 'data\db.json'){'data\db.json exists'}else{'Created automatically on first server start.'})

$port = 3000
try {
  $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | Select-Object -First 1
  if ($listener) {
    $proc = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    Add-Check 'Port 3000' 'WARN' ("Already in use by PID {0} ({1}). Stop it only after confirming it is an old Stream24 process, or set PORT in .env." -f $listener.OwningProcess,$proc.ProcessName)
  } else { Add-Check 'Port 3000' 'PASS' 'Available.' }
} catch { Add-Check 'Port 3000' 'PASS' 'No listener detected.' }

$checks | Format-Table -Wrap -AutoSize
$failures = @($checks | Where-Object Status -eq 'FAIL')
$warnings = @($checks | Where-Object Status -eq 'WARN')
Write-Host ("Summary: {0} failure(s), {1} warning(s)." -f $failures.Count,$warnings.Count)
if ($failures.Count -gt 0) { exit 1 }
