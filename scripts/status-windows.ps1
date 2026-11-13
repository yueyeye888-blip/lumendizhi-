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
  targetUrl = if ($config) { $config.targetUrl } else { $null }
  cdpPort = $port
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
    (Join-Path $InstallRoot "tests\telegram.test.mjs")
}

Write-Host "=== Telegram Log Tail ===" -ForegroundColor Cyan
$logPath = Join-Path $InstallRoot "telegram-bot.log"
if (Test-Path $logPath) { Get-Content $logPath -Tail $LogLines } else { Write-Host "日志尚不存在。" }
