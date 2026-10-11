$ErrorActionPreference='SilentlyContinue'
foreach($name in @('Stream24 Server','Stream24 Agent')){Stop-ScheduledTask -TaskName $name;Unregister-ScheduledTask -TaskName $name -Confirm:$false}
Write-Host 'Stream24 startup tasks removed.'
