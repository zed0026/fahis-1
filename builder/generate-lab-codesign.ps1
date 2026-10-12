# Creates a self-signed code-signing cert for lab Authenticode (authorized testing only).
param(
  [string]$Subject = "CN=Software Update Publisher, O=Corporate IT Services, L=Redmond, S=WA, C=US",
  [string]$PfxPath = "",
  [string]$CerPath = "",
  [string]$Password = "lab-sign-change-me"
)

$ErrorActionPreference = "Stop"
if (-not $PfxPath -or -not $CerPath) { throw "PfxPath and CerPath required" }

$dir = Split-Path -Parent $PfxPath
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject $Subject `
  -KeyAlgorithm RSA `
  -KeyLength 2048 `
  -HashAlgorithm SHA256 `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -NotAfter (Get-Date).AddYears(5) `
  -FriendlyName "FAHIS Lab Code Signing"

Export-Certificate -Cert $cert -FilePath $CerPath -Force | Out-Null

$sec = ConvertTo-SecureString -String $Password -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $PfxPath -Password $sec -Force | Out-Null

Write-Host "Created $PfxPath and $CerPath"
