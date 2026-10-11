$checks=@()
function Add-Check($Name,$Ok,$Detail){$script:checks += [pscustomobject]@{Check=$Name;OK=$Ok;Detail=$Detail}}
$node=Get-Command node -ErrorAction SilentlyContinue;Add-Check 'Node.js' ([bool]$node) $(if($node){node --version}else{'Not found'})
$ffmpeg=Get-Command ffmpeg -ErrorAction SilentlyContinue;Add-Check 'FFmpeg' ([bool]$ffmpeg) $(if($ffmpeg){'Found'}else{'Not found'})
$ffprobe=Get-Command ffprobe -ErrorAction SilentlyContinue;Add-Check 'FFprobe' ([bool]$ffprobe) $(if($ffprobe){'Found'}else{'Not found'})
Add-Check 'Agent config' (Test-Path 'apps\agent\config.json') $(if(Test-Path 'apps\agent\config.json'){'Present'}else{'Missing'})
Add-Check 'Database' (Test-Path 'data\db.json') $(if(Test-Path 'data\db.json'){'Present'}else{'Missing'})
$checks | Format-Table -AutoSize
if($checks.OK -contains $false){exit 1}
