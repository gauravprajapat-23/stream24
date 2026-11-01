param(
  [string]$InstallDir="$env:LOCALAPPDATA\Stream24\tools\ffmpeg",
  [switch]$Force
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Find-FFmpeg {
  $ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
  $ffprobe = Get-Command ffprobe -ErrorAction SilentlyContinue
  if ($ffmpeg -and $ffprobe) { return $true }
  return $false
}

if (-not $Force -and (Find-FFmpeg)) {
  Write-Host "FFmpeg and FFprobe are already available." -ForegroundColor Green
  ffmpeg -version | Select-Object -First 1
  ffprobe -version | Select-Object -First 1
  exit 0
}

$downloadUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
$tempRoot = Join-Path $env:TEMP ("stream24-ffmpeg-" + [guid]::NewGuid().ToString('N'))
$archive = Join-Path $tempRoot 'ffmpeg.zip'
$extract = Join-Path $tempRoot 'extract'
$target = [IO.Path]::GetFullPath($InstallDir)
try {
  New-Item -ItemType Directory -Force -Path $tempRoot,$extract | Out-Null
  Write-Host 'Downloading the Gyan.dev FFmpeg essentials build...' -ForegroundColor Cyan
  Invoke-WebRequest -Uri $downloadUrl -OutFile $archive -UseBasicParsing
  Expand-Archive -LiteralPath $archive -DestinationPath $extract -Force
  $bin = Get-ChildItem -LiteralPath $extract -Directory | ForEach-Object { Join-Path $_.FullName 'bin' } | Where-Object { (Test-Path (Join-Path $_ 'ffmpeg.exe')) -and (Test-Path (Join-Path $_ 'ffprobe.exe')) } | Select-Object -First 1
  if (-not $bin) { throw 'The downloaded archive did not contain both ffmpeg.exe and ffprobe.exe.' }

  $parent = Split-Path -Parent $target
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  if (Test-Path $target) { Remove-Item -LiteralPath $target -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  Copy-Item -Path (Join-Path $bin '*') -Destination $target -Recurse -Force
  foreach ($exe in @('ffmpeg.exe','ffprobe.exe')) {
    if (-not (Test-Path (Join-Path $target $exe))) { throw "Installation verification failed: $exe is missing." }
  }

  $userPath = [Environment]::GetEnvironmentVariable('Path','User')
  $entries = @($userPath -split ';' | Where-Object { $_ })
  if ($entries -notcontains $target) {
    $newPath = (@($entries) + $target) -join ';'
    [Environment]::SetEnvironmentVariable('Path',$newPath,'User')
  }
  if (($env:Path -split ';') -notcontains $target) { $env:Path = "$target;$env:Path" }

  & (Join-Path $target 'ffmpeg.exe') -version | Select-Object -First 1
  & (Join-Path $target 'ffprobe.exe') -version | Select-Object -First 1
  Write-Host "FFmpeg and FFprobe installed to $target" -ForegroundColor Green
  Write-Host 'Open a new PowerShell window so the updated user PATH is loaded.' -ForegroundColor Yellow
}
catch {
  Write-Error ("FFmpeg installation failed: " + $_.Exception.Message)
  exit 1
}
finally {
  if (Test-Path $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue }
}
