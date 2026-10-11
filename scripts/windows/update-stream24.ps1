param(
  [Parameter(Mandatory=$true)][string]$Package,
  [Parameter(Mandatory=$true)][string]$Sha256,
  [string]$InstallDir="$env:LOCALAPPDATA\Stream24"
)
$ErrorActionPreference='Stop'
$temp=Join-Path $env:TEMP ('stream24-update-'+[guid]::NewGuid())
New-Item -ItemType Directory -Force -Path $temp | Out-Null
$zip=Join-Path $temp 'update.zip'
if($Package -match '^https?://'){Invoke-WebRequest -UseBasicParsing $Package -OutFile $zip}else{Copy-Item $Package $zip}
$actual=(Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
if($actual -ne $Sha256.ToLower()){throw "SHA-256 mismatch. Expected $Sha256, got $actual"}
$unpack=Join-Path $temp 'unpack';Expand-Archive $zip $unpack -Force
$source=(Get-ChildItem $unpack -Directory | Select-Object -First 1).FullName;if(-not $source){$source=$unpack}
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss';$rollback="$InstallDir.rollback-$stamp"
foreach($task in @('Stream24 Agent','Stream24 Server')){Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue}
if(Test-Path $InstallDir){Move-Item $InstallDir $rollback}
try{Move-Item $source $InstallDir;foreach($task in @('Stream24 Server','Stream24 Agent')){Start-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue};Write-Host "Updated successfully. Rollback copy: $rollback" -ForegroundColor Green}
catch{if(Test-Path $InstallDir){Remove-Item $InstallDir -Recurse -Force};if(Test-Path $rollback){Move-Item $rollback $InstallDir};throw}
finally{Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue}
