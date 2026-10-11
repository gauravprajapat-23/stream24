$ErrorActionPreference = "Stop"
if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
  ffmpeg -version | Select-Object -First 1
  Write-Host "FFmpeg is already installed." -ForegroundColor Green
  exit 0
}
if (Get-Command winget -ErrorAction SilentlyContinue) {
  winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements
  Write-Host "FFmpeg installation requested. Open a new PowerShell window after installation." -ForegroundColor Green
} else {
  Write-Host "winget was not found. Install FFmpeg manually and add ffmpeg.exe to PATH." -ForegroundColor Yellow
}
