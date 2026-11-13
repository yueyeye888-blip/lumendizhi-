[CmdletBinding()]
param(
  [string]$InstallRoot = (Split-Path $PSScriptRoot -Parent),
  [string]$NodeExe = "C:\Tools\node22\node.exe"
)

$ErrorActionPreference = "Stop"
$walletHelper = Join-Path $InstallRoot "wallet-address.mjs"
$secretRoot = Join-Path $InstallRoot "secrets"
$secretPath = Join-Path $secretRoot "payer-private-key.dpapi"
$metadataPath = Join-Path $secretRoot "payer-wallet.json"

if (-not (Test-Path $NodeExe)) { throw "未找到 Node.js：$NodeExe" }
if (-not (Test-Path $walletHelper)) { throw "未找到钱包校验程序：$walletHelper" }

Write-Host "付款钱包本地导入" -ForegroundColor Cyan
Write-Host "私钥只在本机内存中短暂出现，并使用当前 Windows 账户的 DPAPI 加密保存。"
Write-Host "私钥不会显示、不会写入日志，也不会发送到网络。" -ForegroundColor Yellow

if (Test-Path $secretPath) {
  $confirmation = Read-Host "已存在付款钱包。输入 REPLACE 才会覆盖"
  if ($confirmation -cne "REPLACE") {
    Write-Host "已取消，现有钱包未改变。"
    exit 0
  }
}

$secureInput = Read-Host "请输入新的专用钱包私钥（输入隐藏）" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureInput)
$plainText = $null
try {
  $plainText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim()
  if ($plainText -notmatch '^0x[0-9a-fA-F]{64}$') {
    throw "私钥格式无效，应为 0x 加 64 位十六进制字符。"
  }

  $startInfo = New-Object Diagnostics.ProcessStartInfo
  $startInfo.FileName = $NodeExe
  $startInfo.Arguments = '"' + $walletHelper.Replace('"', '\"') + '"'
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $process = New-Object Diagnostics.Process
  $process.StartInfo = $startInfo
  if (-not $process.Start()) { throw "无法启动钱包校验程序。" }
  $process.StandardInput.WriteLine($plainText)
  $process.StandardInput.Close()
  $resultText = $process.StandardOutput.ReadToEnd()
  $errorText = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    throw ("钱包校验失败：" + ($errorText.Trim() -replace '0x[0-9a-fA-F]{64}', '[redacted]'))
  }
  $wallet = $resultText | ConvertFrom-Json
  if ([string]$wallet.address -notmatch '^0x[0-9a-fA-F]{40}$') {
    throw "钱包校验程序未返回有效地址。"
  }

  $normalizedSecure = ConvertTo-SecureString $plainText -AsPlainText -Force
  $encrypted = ConvertFrom-SecureString $normalizedSecure
  New-Item -ItemType Directory -Path $secretRoot -Force | Out-Null
  $utf8NoBom = New-Object Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($secretPath, $encrypted + [Environment]::NewLine, $utf8NoBom)
  $metadata = [ordered]@{
    address = [string]$wallet.address
    chainId = 56
    network = "BNB Smart Chain"
    encryption = "Windows DPAPI CurrentUser"
    importedAt = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json
  [IO.File]::WriteAllText($metadataPath, $metadata + [Environment]::NewLine, $utf8NoBom)

  $account = "$env:USERDOMAIN\$env:USERNAME"
  & icacls.exe $secretRoot /inheritance:r /grant:r "$account`:(OI)(CI)(F)" 'SYSTEM:(OI)(CI)(F)' | Out-Null
  & icacls.exe $secretPath /inheritance:r /grant:r "$account`:(F)" 'SYSTEM:(F)' | Out-Null
  & icacls.exe $metadataPath /inheritance:r /grant:r "$account`:(F)" 'SYSTEM:(F)' | Out-Null

  Write-Host "`n钱包导入成功" -ForegroundColor Green
  Write-Host "公开充值地址：$($wallet.address)" -ForegroundColor Cyan
  Write-Host "网络：BNB Smart Chain (BSC / Chain ID 56)"
  Write-Host "请只向公开地址充值少量测试资金；不要再次发送私钥。"
}
finally {
  if ($pointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
  $plainText = $null
}
