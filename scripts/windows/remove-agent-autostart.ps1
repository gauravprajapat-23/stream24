$ErrorActionPreference = "Stop"
$taskName = "Stream24 Agent"
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Host "Removed '$taskName'." -ForegroundColor Green
} else {
  Write-Host "'$taskName' is not installed." -ForegroundColor Yellow
}
