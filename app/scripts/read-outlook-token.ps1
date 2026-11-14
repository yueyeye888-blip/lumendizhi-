[CmdletBinding()]
param(
  [string]$InstallRoot = "C:\SafeTGDemo"
)

$ErrorActionPreference = "Stop"
$secretPath = Join-Path $InstallRoot "secrets\outlook-refresh-token.dpapi"
if (-not (Test-Path $secretPath)) { throw "尚未授权 Outlook 邮箱。" }
$encrypted = [IO.File]::ReadAllText($secretPath).Trim()
$secureValue = ConvertTo-SecureString $encrypted
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
try {
  [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer))
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}
