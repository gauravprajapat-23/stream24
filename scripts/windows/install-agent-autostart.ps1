$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$config = Join-Path $root "apps\agent\config.json"
if (-not (Test-Path $config)) {
  Write-Host "Missing apps\agent\config.json. Configure the agent first." -ForegroundColor Red
  exit 1
}
$node = (Get-Command node -ErrorAction Stop).Source
$agent = Join-Path $root "apps\agent\agent.mjs"
$taskName = "Stream24 Agent"
$action = New-ScheduledTaskAction -Execute $node -Argument "`"$agent`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Starts Stream24 local YouTube streaming agent at Windows logon." -Force | Out-Null
Write-Host "Installed '$taskName'. The Stream24 agent will start at Windows logon." -ForegroundColor Green
Write-Host "Run now with: Start-ScheduledTask -TaskName '$taskName'" -ForegroundColor Cyan
