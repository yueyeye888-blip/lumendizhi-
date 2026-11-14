[CmdletBinding()]
param(
  [string]$InstallRoot = "C:\SafeTGDemo"
)

$ErrorActionPreference = "Stop"
$plainText = [Console]::In.ReadToEnd().Trim()
if (-not $plainText -or $plainText.Length -lt 40) { throw "Outlook 刷新令牌无效。" }
$secretRoot = Join-Path $InstallRoot "secrets"
$secretPath = Join-Path $secretRoot "outlook-refresh-token.dpapi"
$secureValue = ConvertTo-SecureString $plainText -AsPlainText -Force
$encrypted = ConvertFrom-SecureString $secureValue
$utf8NoBom = New-Object Text.UTF8Encoding($false)
New-Item -ItemType Directory -Path $secretRoot -Force | Out-Null
[IO.File]::WriteAllText($secretPath, $encrypted + [Environment]::NewLine, $utf8NoBom)
$account = "$env:USERDOMAIN\$env:USERNAME"
& icacls.exe $secretRoot /inheritance:r /grant:r "$account`:(OI)(CI)(F)" "SYSTEM:(OI)(CI)(F)" | Out-Null
& icacls.exe $secretPath /inheritance:r /grant:r "$account`:(F)" "SYSTEM:(F)" | Out-Null
