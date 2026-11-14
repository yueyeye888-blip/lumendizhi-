[CmdletBinding()]
param(
  [string]$InstallRoot = "C:\SafeTGDemo",
  [string]$NodeExe = "C:\Tools\node22\node.exe",
  [switch]$RunTests,
  [int]$LogLines = 60
)

$ErrorActionPreference = "Continue"
$configPath = Join-Path $InstallRoot "runtime-config.json"
$config = if (Test-Path $configPath) { Get-Content $configPath -Raw | ConvertFrom-Json } else { $null }
$port = if ($config) { [int]$config.cdpPort } else { 9333 }

Write-Host "=== Scheduled Tasks ===" -ForegroundColor Cyan
Get-ScheduledTask -TaskName "SafeTGDemo*" -ErrorAction SilentlyContinue |
  Select-Object TaskName, State | Format-Table -AutoSize

Write-Host "=== Processes ===" -ForegroundColor Cyan
Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -like "*$InstallRoot*" -or $_.CommandLine -like "*--remote-debugging-port=$port*"
} | Select-Object ProcessId, Name, CreationDate, CommandLine | Format-List

Write-Host "=== Sanitized Config ===" -ForegroundColor Cyan
[pscustomobject]@{
  configPresent = [bool]$config
  tokenPresent = [bool]($config -and $config.telegramBotToken)
  allowedChatCount = @($config.allowedChatIds).Count
  trustedSenderBotCount = @($config.trustedSenderBotIds).Count
  notifyChatIdPresent = [bool]($config -and $config.notifyChatId)
  callbackUrlPresent = [bool]($config -and $config.orderCallbackUrl)
  callbackTokenPresent = [bool]($config -and $config.orderCallbackToken)
  siteAccessTokenPresent = [bool]($config -and $config.siteAccessToken)
  targetUrl = if ($config) { $config.targetUrl } else { $null }
  cdpPort = $port
  paymentMode = if ($config) { $config.paymentMode } else { $null }
  paymentMaxSingleUsdt = if ($config) { $config.paymentMaxSingleUsdt } else { $null }
  liveApprovalConfigured = [bool]($config -and $config.paymentLiveApproval)
  outlookRelayEnabled = [bool]($config -and $config.outlookRelay.enabled)
  outlookMailbox = if ($config) { $config.outlookRelay.mailbox } else { $null }
  outlookClientIdPresent = [bool]($config -and $config.outlookRelay.clientId)
  outlookAuthorized = Test-Path (Join-Path $InstallRoot "secrets\outlook-refresh-token.dpapi")
} | Format-List

Write-Host "=== Chrome CDP ===" -ForegroundColor Cyan
try {
  Invoke-RestMethod "http://127.0.0.1:$port/json/version" -TimeoutSec 3 |
    Select-Object Browser, "User-Agent", "Protocol-Version" | Format-List
}
catch {
  Write-Warning "CDP 不可用：http://127.0.0.1:$port"
}

if ($RunTests) {
  Write-Host "=== Regression Tests ===" -ForegroundColor Cyan
  & $NodeExe --test `
    (Join-Path $InstallRoot "tests\cdp-fill.test.mjs") `
    (Join-Path $InstallRoot "tests\parser.test.mjs") `
    (Join-Path $InstallRoot "tests\payment.test.mjs") `
    (Join-Path $InstallRoot "tests\telegram.test.mjs") `
    (Join-Path $InstallRoot "tests\outlook-relay.test.mjs") `
    (Join-Path $InstallRoot "tests\wallet-import.test.mjs")
}

Write-Host "=== Payer Wallet ===" -ForegroundColor Cyan
$walletMetadata = Join-Path $InstallRoot "secrets\payer-wallet.json"
if (Test-Path $walletMetadata) {
  $wallet = Get-Content $walletMetadata -Raw | ConvertFrom-Json
  [pscustomobject]@{
    imported = $true
    address = $wallet.address
    chainId = $wallet.chainId
    encryption = $wallet.encryption
  } | Format-List
}
else {
  [pscustomobject]@{ imported = $false } | Format-List
}

Write-Host "=== Payment Ledger ===" -ForegroundColor Cyan
$paymentLedger = Join-Path $InstallRoot "data\payment-ledger.json"
if (Test-Path $paymentLedger) {
  $ledger = Get-Content $paymentLedger -Raw | ConvertFrom-Json
  [pscustomobject]@{
    present = $true
    entryCount = @($ledger.entries.psobject.Properties).Count
  } | Format-List
}
else {
  [pscustomobject]@{ present = $false; entryCount = 0 } | Format-List
}

Write-Host "=== Telegram Log Tail ===" -ForegroundColor Cyan
$logPath = Join-Path $InstallRoot "telegram-bot.log"
if (Test-Path $logPath) { Get-Content $logPath -Tail $LogLines } else { Write-Host "日志尚不存在。" }
