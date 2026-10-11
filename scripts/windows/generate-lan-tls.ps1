param(
  [string]$InstallDir=(Resolve-Path "$PSScriptRoot\..\..").Path,
  [string]$DnsName=$env:COMPUTERNAME,
  [string[]]$IpAddress=@()
)
$ErrorActionPreference='Stop'
$openssl=(Get-Command openssl -ErrorAction SilentlyContinue).Source
if(-not $openssl){
  $gitOpenSsl='C:\Program Files\Git\usr\bin\openssl.exe'
  if(Test-Path $gitOpenSsl){$openssl=$gitOpenSsl}
}
if(-not $openssl){throw 'OpenSSL was not found. Install Git for Windows or OpenSSL, then rerun generate-lan-tls.ps1.'}
$tlsDir=Join-Path $InstallDir 'data\tls';New-Item -ItemType Directory -Force -Path $tlsDir | Out-Null
$caKey=Join-Path $tlsDir 'ca-key.pem';$caCert=Join-Path $tlsDir 'ca-cert.pem';$serverKey=Join-Path $tlsDir 'server-key.pem';$serverCert=Join-Path $tlsDir 'server-cert.pem';$csr=Join-Path $tlsDir 'server.csr';$ext=Join-Path $tlsDir 'server-ext.cnf'
if(-not $IpAddress.Count){
  $IpAddress=@(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {$_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*'} | Select-Object -ExpandProperty IPAddress -Unique)
}
$san=@("DNS:$DnsName",'DNS:localhost','IP:127.0.0.1') + @($IpAddress | ForEach-Object {"IP:$_"})
@("subjectAltName=$($san -join ',')",'basicConstraints=CA:FALSE','keyUsage=digitalSignature,keyEncipherment','extendedKeyUsage=serverAuth') | Set-Content -Encoding Ascii $ext
if(-not (Test-Path $caKey) -or -not (Test-Path $caCert)){
  & $openssl req -x509 -newkey rsa:3072 -sha256 -nodes -keyout $caKey -out $caCert -days 3650 -subj '/CN=Stream24 Local CA'
  if($LASTEXITCODE -ne 0){throw 'Failed to generate Stream24 local CA.'}
}
& $openssl req -new -newkey rsa:3072 -sha256 -nodes -keyout $serverKey -out $csr -subj "/CN=$DnsName"
if($LASTEXITCODE -ne 0){throw 'Failed to generate Stream24 server key/CSR.'}
& $openssl x509 -req -in $csr -CA $caCert -CAkey $caKey -CAcreateserial -out $serverCert -days 825 -sha256 -extfile $ext
if($LASTEXITCODE -ne 0){throw 'Failed to sign Stream24 server certificate.'}
Remove-Item $csr,$ext -Force -ErrorAction SilentlyContinue
try{icacls $caKey /inheritance:r /grant:r "$env:USERNAME:(R,W)" | Out-Null;icacls $serverKey /inheritance:r /grant:r "$env:USERNAME:(R,W)" | Out-Null}catch{Write-Warning "Could not tighten TLS key ACLs: $($_.Exception.Message)"}
Write-Host "TLS created for: $($san -join ', ')" -ForegroundColor Green
Write-Host "Server cert: $serverCert"
Write-Host "Server key : $serverKey"
Write-Host "Worker CA  : $caCert"
[pscustomobject]@{CertPath=$serverCert;KeyPath=$serverKey;CaCertPath=$caCert}
