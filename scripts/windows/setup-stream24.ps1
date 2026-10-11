param(
  [ValidateSet('Server','Worker','Both')][string]$Mode='Both',
  [string]$InstallDir="$env:LOCALAPPDATA\Stream24",
  [string]$ServerUrl='http://localhost:3000',
  [string]$AgentToken='',
  [switch]$AllowInsecureLan,
  [switch]$EnableLanTls,
  [string]$CaCertPath='',
  [string[]]$WatchFolders=@("$env:USERPROFILE\Videos\Stream24"),
  [switch]$InstallStartupTasks
)
$ErrorActionPreference='Stop'
Write-Host "Stream24 Phase 14 setup" -ForegroundColor Cyan
if(-not (Get-Command node -ErrorAction SilentlyContinue)){throw 'Node.js 20+ is required. Install Node.js LTS first, then rerun this setup.'}
$nodeVersion=[version]((node -p "process.versions.node") -replace '-.*$','')
if($nodeVersion.Major -lt 20){throw "Node.js 20+ required; found $nodeVersion"}
$source=(Resolve-Path "$PSScriptRoot\..\..").Path
if((Resolve-Path $source).Path -ne [IO.Path]::GetFullPath($InstallDir)){
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  robocopy $source $InstallDir /E /XD .git node_modules /XF stream24-backup-*.json | Out-Null
  if($LASTEXITCODE -gt 7){throw "Copy failed with robocopy exit code $LASTEXITCODE"}
}
Set-Location $InstallDir
New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir 'data') | Out-Null
foreach($folder in $WatchFolders){New-Item -ItemType Directory -Force -Path $folder | Out-Null}
if($Mode -in @('Server','Both')){
  $envPath=Join-Path $InstallDir 'data\stream24.env.ps1'
  if(-not (Test-Path $envPath)){
    $key=(node scripts\generate-master-key.mjs | Select-Object -Last 1).Trim()
    if(-not $key){$bytes=New-Object byte[] 32;[Security.Cryptography.RandomNumberGenerator]::Fill($bytes);$key=[Convert]::ToHexString($bytes).ToLower()}
    "`$env:APP_MASTER_KEY='$key'`r`n`$env:HOST='0.0.0.0'`r`n`$env:PORT='3000'" | Set-Content -Encoding UTF8 $envPath
    try { icacls $envPath /inheritance:r /grant:r "$env:USERNAME:(R,W)" | Out-Null } catch { Write-Warning "Could not tighten ACL on $envPath: $($_.Exception.Message)" }
  }
}
$localCa=''
if($EnableLanTls -and $Mode -in @('Server','Both')){
  $tls=& "$InstallDir\scripts\windows\generate-lan-tls.ps1" -InstallDir $InstallDir
  $envPath=Join-Path $InstallDir 'data\stream24.env.ps1'
  $existing=@(Get-Content $envPath -ErrorAction SilentlyContinue | Where-Object {$_ -notmatch '^\$env:STREAM24_TLS_(CERT|KEY)_PATH='})
  $existing += "`$env:STREAM24_TLS_CERT_PATH='$($tls.CertPath)'"
  $existing += "`$env:STREAM24_TLS_KEY_PATH='$($tls.KeyPath)'"
  $existing | Set-Content -Encoding UTF8 $envPath
  $localCa=$tls.CaCertPath
  if($ServerUrl -eq 'http://localhost:3000'){$ServerUrl='https://localhost:3000'}
}
if($Mode -in @('Worker','Both')){
  if(-not $AgentToken){Write-Warning 'No worker token supplied. Create a worker in the dashboard and rerun with -AgentToken, or edit apps\agent\config.json.'}
  if(-not $CaCertPath -and $localCa){$CaCertPath=$localCa}
  $cfg=[ordered]@{serverUrl=$ServerUrl;agentToken=$AgentToken;ffmpegPath='ffmpeg';ffprobePath='ffprobe';autoRestart=$true;restartDelayMs=5000;recoverOnStart=$true;watchFolders=$WatchFolders;watchScanIntervalMs=60000;allowInsecureLan=[bool]$AllowInsecureLan;caCertPath=$CaCertPath}
  $cfg | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 'apps\agent\config.json'
  try { icacls (Join-Path $InstallDir 'apps\agent\config.json') /inheritance:r /grant:r "$env:USERNAME:(R,W)" | Out-Null } catch { Write-Warning "Could not tighten ACL on agent config: $($_.Exception.Message)" }
}
if(-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)){Write-Warning 'FFmpeg is not on PATH. Run scripts\windows\install-ffmpeg.ps1 before streaming.'}
if($InstallStartupTasks){
  if($Mode -in @('Server','Both')){& "$InstallDir\scripts\windows\install-server-service.ps1" -InstallDir $InstallDir}
  if($Mode -in @('Worker','Both')){& "$InstallDir\scripts\windows\install-agent-service.ps1" -InstallDir $InstallDir}
}
Write-Host "Installed to $InstallDir" -ForegroundColor Green
if($Mode -in @('Server','Both')){Write-Host 'Dashboard: http://localhost:3000'}
