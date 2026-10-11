param([string]$InstallDir=(Resolve-Path "$PSScriptRoot\..\..").Path)
$ErrorActionPreference='Stop'
$name='Stream24 Server'
$script=Join-Path $InstallDir 'scripts\windows\start-server.ps1'
$arg="-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -InstallDir `"$InstallDir`""
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
$trigger=New-ScheduledTaskTrigger -AtLogOn
$settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Description 'Stream24 local control server' -Force | Out-Null
Start-ScheduledTask -TaskName $name
Write-Host "$name installed and started." -ForegroundColor Green
