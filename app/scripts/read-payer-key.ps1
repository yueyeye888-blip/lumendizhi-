[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$SecretPath
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $SecretPath)) {
  throw "未找到已导入的付款钱包。"
}

$encrypted = (Get-Content -LiteralPath $SecretPath -Raw).Trim()
if (-not $encrypted) { throw "付款钱包密文为空。" }
$secureValue = ConvertTo-SecureString $encrypted
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
$plainText = $null
try {
  $plainText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if ($plainText -notmatch '^0x[0-9a-fA-F]{64}$') {
    throw "解密后的钱包数据格式无效。"
  }
  [Console]::Out.Write($plainText)
}
finally {
  if ($pointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
  $plainText = $null
}
