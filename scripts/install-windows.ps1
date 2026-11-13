[CmdletBinding()]
param(
  [string]$ConfigFile = "",
  [string]$InstallRoot = "C:\SafeTGDemo",
  [string]$SourceRoot = "",
  [string]$NodeRoot = "C:\Tools\node22",
  [string]$ChromePath = "",
  [int]$BrowserReadyTimeoutSeconds = 45,
  [switch]$SkipPrerequisites,
  [switch]$DemoFill
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "请以管理员身份运行 PowerShell。"
  }
}

function Convert-SecureStringToPlainText([Security.SecureString]$SecureValue) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function Split-IdList([object]$Value) {
  if ($null -eq $Value) { return @() }
  if ($Value -is [array]) {
    return @($Value | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ })
  }
  return @(([string]$Value).Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

function Read-Configuration {
  if ($ConfigFile) {
    $resolved = (Resolve-Path $ConfigFile).Path
    return Get-Content $resolved -Raw | ConvertFrom-Json
  }

  Write-Host "未指定私密配置文件，将通过交互式输入生成配置。" -ForegroundColor Yellow
  $secureToken = Read-Host "接收 Bot Token（输入会隐藏）" -AsSecureString
  $token = Convert-SecureStringToPlainText $secureToken
  $allowed = Read-Host "允许直接触发的 Chat ID（多个用逗号分隔，可留空）"
  $trusted = Read-Host "网页发送 Bot 的数字 ID（多个用逗号分隔）"
  $notify = Read-Host "管理员通知 Chat ID"
  $target = Read-Host "目标网址（回车使用 https://addrs.xyz）"
  $portText = Read-Host "Chrome CDP 端口（回车使用 9333）"
  $callbackUrl = Read-Host "订单状态回调地址（例如 https://站点/api/address-orders/callback）"
  $secureCallbackToken = Read-Host "订单回调令牌（输入会隐藏）" -AsSecureString
  $callbackToken = Convert-SecureStringToPlainText $secureCallbackToken
  $secureSiteAccessToken = Read-Host "Sites 服务访问令牌（受限站点必填，输入会隐藏）" -AsSecureString
  $siteAccessToken = Convert-SecureStringToPlainText $secureSiteAccessToken
  if (-not $target) { $target = "https://addrs.xyz" }
  if (-not $portText) { $portText = "9333" }

  return [pscustomobject]@{
    telegramBotToken = $token
    allowedChatIds = Split-IdList $allowed
    trustedSenderBotIds = Split-IdList $trusted
    notifyChatId = $notify.Trim()
    targetUrl = $target.Trim()
    cdpPort = [int]$portText
    orderCallbackUrl = $callbackUrl.Trim()
    orderCallbackToken = $callbackToken
    siteAccessToken = $siteAccessToken
    paymentMode = "dry-run"
    bscRpcUrl = "https://bsc-dataseed.bnbchain.org"
    bscUsdtContract = "0x55d398326f99059fF775485246999027B3197955"
    paymentMaxSingleUsdt = "5"
    paymentMaxDailyUsdt = "20"
    paymentMinGasBnb = "0.001"
    paymentLiveApproval = ""
  }
}

function Normalize-Configuration([object]$RawConfig) {
  $token = ([string]$RawConfig.telegramBotToken).Trim()
  $allowed = Split-IdList $RawConfig.allowedChatIds
  $trusted = Split-IdList $RawConfig.trustedSenderBotIds
  $notify = ([string]$RawConfig.notifyChatId).Trim()
  $target = ([string]$RawConfig.targetUrl).Trim()
  $port = [int]$RawConfig.cdpPort
  $callbackUrl = ([string]$RawConfig.orderCallbackUrl).Trim()
  $callbackToken = ([string]$RawConfig.orderCallbackToken).Trim()
  $siteAccessToken = ([string]$RawConfig.siteAccessToken).Trim()
  $paymentMode = ([string]$RawConfig.paymentMode).Trim().ToLowerInvariant()
  $bscRpcUrl = ([string]$RawConfig.bscRpcUrl).Trim()
  $bscUsdtContract = ([string]$RawConfig.bscUsdtContract).Trim()
  $paymentMaxSingleUsdt = ([string]$RawConfig.paymentMaxSingleUsdt).Trim()
  $paymentMaxDailyUsdt = ([string]$RawConfig.paymentMaxDailyUsdt).Trim()
  $paymentMinGasBnb = ([string]$RawConfig.paymentMinGasBnb).Trim()
  $paymentLiveApproval = ([string]$RawConfig.paymentLiveApproval).Trim()
  if (-not $paymentMode) { $paymentMode = "dry-run" }
  if (-not $bscRpcUrl) { $bscRpcUrl = "https://bsc-dataseed.bnbchain.org" }
  if (-not $bscUsdtContract) { $bscUsdtContract = "0x55d398326f99059fF775485246999027B3197955" }
  if (-not $paymentMaxSingleUsdt) { $paymentMaxSingleUsdt = "5" }
  if (-not $paymentMaxDailyUsdt) { $paymentMaxDailyUsdt = "20" }
  if (-not $paymentMinGasBnb) { $paymentMinGasBnb = "0.001" }

  if ($token -notmatch '^\d{6,12}:[A-Za-z0-9_-]{20,}$') {
    throw "接收 Bot Token 格式不正确。"
  }
  foreach ($id in $allowed) {
    if ($id -notmatch '^-?\d+$') { throw "allowedChatIds 只能包含数字 Chat ID：$id" }
  }
  foreach ($id in $trusted) {
    if ($id -notmatch '^\d+$') { throw "trustedSenderBotIds 只能包含数字 Bot ID：$id" }
  }
  if ($trusted.Count -gt 0 -and $notify -notmatch '^-?\d+$') {
    throw "配置可信发送 Bot 时必须设置数字 notifyChatId。"
  }
  $parsedTarget = $null
  if (-not [Uri]::TryCreate($target, [UriKind]::Absolute, [ref]$parsedTarget) -or $parsedTarget.Scheme -notin @("http", "https")) {
    throw "targetUrl 必须是有效的 HTTP(S) 地址。"
  }
  if ($port -lt 1 -or $port -gt 65535) { throw "cdpPort 必须在 1-65535 之间。" }
  if (-not $callbackUrl -or -not $callbackToken) {
    throw "orderCallbackUrl 与 orderCallbackToken 必须同时配置。"
  }
  $parsedCallback = $null
  if (-not [Uri]::TryCreate($callbackUrl, [UriKind]::Absolute, [ref]$parsedCallback) -or $parsedCallback.Scheme -ne "https") {
    throw "orderCallbackUrl 必须是有效的 HTTPS 地址。"
  }
  if ($callbackToken.Length -lt 48) { throw "orderCallbackToken 长度不足。" }
  if ($paymentMode -notin @("off", "dry-run", "live")) { throw "paymentMode 只能是 off、dry-run 或 live。" }
  $parsedRpc = $null
  if (-not [Uri]::TryCreate($bscRpcUrl, [UriKind]::Absolute, [ref]$parsedRpc) -or $parsedRpc.Scheme -ne "https") {
    throw "bscRpcUrl 必须是有效的 HTTPS 地址。"
  }
  if ($bscUsdtContract -cne "0x55d398326f99059fF775485246999027B3197955") {
    throw "bscUsdtContract 不在允许列表中。"
  }
  foreach ($paymentLimit in @($paymentMaxSingleUsdt, $paymentMaxDailyUsdt, $paymentMinGasBnb)) {
    if ($paymentLimit -notmatch '^(?:0|[1-9]\d*)(?:\.\d{1,18})?$' -or [decimal]$paymentLimit -le 0) {
      throw "付款限额必须是正数。"
    }
  }
  if ([decimal]$paymentMaxDailyUsdt -lt [decimal]$paymentMaxSingleUsdt) {
    throw "paymentMaxDailyUsdt 不能低于 paymentMaxSingleUsdt。"
  }
  if ($paymentMode -eq "live" -and $paymentLiveApproval -cne "ENABLE_BSC_USDT_LIVE_PAYMENT") {
    throw "live 模式缺少 paymentLiveApproval 二次启用口令。"
  }

  return [ordered]@{
    telegramBotToken = $token
    allowedChatIds = @($allowed)
    trustedSenderBotIds = @($trusted)
    notifyChatId = $notify
    targetUrl = $parsedTarget.AbsoluteUri
    cdpPort = $port
    orderCallbackUrl = $parsedCallback.AbsoluteUri
    orderCallbackToken = $callbackToken
    siteAccessToken = $siteAccessToken
    paymentMode = $paymentMode
    bscRpcUrl = $parsedRpc.AbsoluteUri
    bscUsdtContract = $bscUsdtContract
    paymentMaxSingleUsdt = $paymentMaxSingleUsdt
    paymentMaxDailyUsdt = $paymentMaxDailyUsdt
    paymentMinGasBnb = $paymentMinGasBnb
    paymentLiveApproval = $paymentLiveApproval
  }
}

function Ensure-Node22 {
  $nodeExe = Join-Path $NodeRoot "node.exe"
  if (Test-Path $nodeExe) {
    $version = (& $nodeExe --version).Trim()
    if ($LASTEXITCODE -eq 0 -and $version -match '^v22\.') {
      Write-Host "Node.js 已就绪：$version"
      return $nodeExe
    }
    throw "$NodeRoot 已存在，但不是可用的 Node.js 22。请先移动该目录后重试。"
  }

  Write-Step "下载便携版 Node.js 22"
  $releases = Invoke-RestMethod "https://nodejs.org/dist/index.json"
  $release = $releases | Where-Object {
    $_.version -like "v22.*" -and $_.files -contains "win-x64-zip"
  } | Select-Object -First 1
  if (-not $release) { throw "无法从 nodejs.org 找到 Node.js 22 Windows x64 版本。" }

  $temporary = Join-Path ([IO.Path]::GetTempPath()) ("safe-tg-node-" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $temporary -Force | Out-Null
  try {
    $zipName = "node-$($release.version)-win-x64.zip"
    $zipPath = Join-Path $temporary $zipName
    Invoke-WebRequest "https://nodejs.org/dist/$($release.version)/$zipName" -OutFile $zipPath -UseBasicParsing
    Expand-Archive -Path $zipPath -DestinationPath $temporary -Force
    $expanded = Get-ChildItem $temporary -Directory | Where-Object { $_.Name -like "node-*-win-x64" } | Select-Object -First 1
    if (-not $expanded) { throw "Node.js 压缩包结构不符合预期。" }
    New-Item -ItemType Directory -Path (Split-Path $NodeRoot -Parent) -Force | Out-Null
    Move-Item $expanded.FullName $NodeRoot
  }
  finally {
    Remove-Item $temporary -Recurse -Force -ErrorAction SilentlyContinue
  }

  $version = (& $nodeExe --version).Trim()
  if ($version -notmatch '^v22\.') { throw "Node.js 22 安装验证失败。" }
  Write-Host "Node.js 安装完成：$version"
  return $nodeExe
}

function Find-Chrome {
  $candidates = @(
    $ChromePath,
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  ) | Where-Object { $_ }
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { return (Resolve-Path $candidate).Path }
  }
  return $null
}

function Ensure-Chrome {
  $found = Find-Chrome
  if ($found) {
    Write-Host "Google Chrome 已就绪：$found"
    return $found
  }

  Write-Step "安装 Google Chrome"
  $msi = Join-Path ([IO.Path]::GetTempPath()) ("GoogleChrome-" + [Guid]::NewGuid().ToString("N") + ".msi")
  try {
    Invoke-WebRequest "https://dl.google.com/chrome/install/GoogleChromeStandaloneEnterprise64.msi" -OutFile $msi -UseBasicParsing
    $process = Start-Process msiexec.exe -ArgumentList @("/i", $msi, "/qn", "/norestart") -Wait -PassThru
    if ($process.ExitCode -notin @(0, 3010)) { throw "Chrome 安装失败，msiexec 退出码：$($process.ExitCode)" }
  }
  finally {
    Remove-Item $msi -Force -ErrorAction SilentlyContinue
  }
  $found = Find-Chrome
  if (-not $found) { throw "Chrome 安装完成后仍未找到 chrome.exe。" }
  return $found
}

function Stop-ExistingRuntime([int]$CdpPort) {
  foreach ($taskName in @("SafeTGDemoBot", "SafeTGDemoServer", "SafeTGDemoBrowser")) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  }
  Get-CimInstance Win32_Process | Where-Object {
    ($_.Name -like "node*" -and $_.CommandLine -like "*$InstallRoot*") -or
    ($_.Name -like "chrome*" -and $_.CommandLine -like "*--remote-debugging-port=$CdpPort*" -and $_.CommandLine -like "*safe_tg_demo_profile*")
  } | ForEach-Object {
    Invoke-CimMethod -InputObject $_ -MethodName Terminate | Out-Null
  }
}

function New-LoggedPowerShellAction([string]$NodeExe, [string]$ScriptPath, [string]$LogPath) {
  $node = $NodeExe.Replace("'", "''")
  $script = $ScriptPath.Replace("'", "''")
  $log = $LogPath.Replace("'", "''")
  $command = "& '$node' '$script' *>> '$log'"
  return New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -Command `"$command`"" -WorkingDirectory $InstallRoot
}

function Register-RuntimeTasks([string]$NodeExe, [string]$ChromeExe, [System.Collections.IDictionary]$Config) {
  Write-Step "注册 Windows 计划任务"
  $account = "$env:USERDOMAIN\$env:USERNAME"
  $principal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Highest
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $restartSettings = New-ScheduledTaskSettingsSet -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable

  $serverAction = New-LoggedPowerShellAction $NodeExe (Join-Path $InstallRoot "server.mjs") (Join-Path $InstallRoot "server.log")
  Register-ScheduledTask -TaskName "SafeTGDemoServer" -Action $serverAction -Trigger $trigger -Principal $principal -Settings $restartSettings -Force | Out-Null

  $profileRoot = Join-Path $env:USERPROFILE "safe_tg_demo_profile"
  $targetUrl = [string]$Config.targetUrl
  $cdpPort = [int]$Config.cdpPort
  $browserArgs = "--new-window --remote-debugging-port=$cdpPort --remote-allow-origins=* --user-data-dir=`"$profileRoot`" --no-first-run --no-default-browser-check --window-size=1600,1000 `"$targetUrl`""
  $browserAction = New-ScheduledTaskAction -Execute $ChromeExe -Argument $browserArgs
  Register-ScheduledTask -TaskName "SafeTGDemoBrowser" -Action $browserAction -Trigger $trigger -Principal $principal -Force | Out-Null

  $botAction = New-LoggedPowerShellAction $NodeExe (Join-Path $InstallRoot "telegram-bot.mjs") (Join-Path $InstallRoot "telegram-bot.log")
  Register-ScheduledTask -TaskName "SafeTGDemoBot" -Action $botAction -Trigger $trigger -Principal $principal -Settings $restartSettings -Force | Out-Null
}

function Wait-ForBrowser([int]$Port) {
  $deadline = (Get-Date).AddSeconds($BrowserReadyTimeoutSeconds)
  do {
    try {
      $version = Invoke-RestMethod "http://127.0.0.1:$Port/json/version" -TimeoutSec 2
      if ($version.Browser) { return [string]$version.Browser }
    }
    catch {}
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)
  throw "Chrome CDP 未在 $BrowserReadyTimeoutSeconds 秒内启动。请确认当前账户保持桌面登录状态。"
}

Assert-Administrator
if (-not $SourceRoot) {
  $SourceRoot = Join-Path (Split-Path $PSScriptRoot -Parent) "app"
}
$SourceRoot = (Resolve-Path $SourceRoot).Path
if (-not (Test-Path (Join-Path $SourceRoot "telegram-bot.mjs"))) {
  throw "SourceRoot 不包含 app 运行文件：$SourceRoot"
}

$config = Normalize-Configuration (Read-Configuration)

Write-Step "验证 Telegram 接收 Bot"
try {
  $botInfo = Invoke-RestMethod "https://api.telegram.org/bot$($config.telegramBotToken)/getMe" -TimeoutSec 15
}
catch {
  throw "无法验证 Telegram Bot。请检查 Token、服务器网络和防火墙。"
}
if (-not $botInfo.ok) { throw "Telegram Bot Token 无效。" }
Write-Host ("接收 Bot：@" + $botInfo.result.username)

if ($SkipPrerequisites) {
  $nodeExe = Join-Path $NodeRoot "node.exe"
  if (-not (Test-Path $nodeExe)) { throw "已跳过依赖安装，但未找到 $nodeExe" }
  $chromeExe = Find-Chrome
  if (-not $chromeExe) { throw "已跳过依赖安装，但未找到 Google Chrome。" }
}
else {
  $nodeExe = Ensure-Node22
  $chromeExe = Ensure-Chrome
}

Write-Step "停止旧运行实例"
Stop-ExistingRuntime ([int]$config.cdpPort)

Write-Step "复制运行文件到 $InstallRoot"
New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
Copy-Item -Path (Join-Path $SourceRoot "*") -Destination $InstallRoot -Recurse -Force

Write-Step "安装锁定的 Node.js 依赖"
Push-Location $InstallRoot
try {
  & (Join-Path $NodeRoot "npm.cmd") ci --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm ci 失败，退出码：$LASTEXITCODE" }
}
finally { Pop-Location }

$configPath = Join-Path $InstallRoot "runtime-config.json"
$json = $config | ConvertTo-Json -Depth 5
$utf8NoBom = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText($configPath, $json + [Environment]::NewLine, $utf8NoBom)
$account = "$env:USERDOMAIN\$env:USERNAME"
& icacls.exe $configPath /inheritance:r /grant:r "$account`:(F)" "SYSTEM:(F)" | Out-Null

Write-Step "执行回归测试"
& $nodeExe --test `
  (Join-Path $InstallRoot "tests\cdp-fill.test.mjs") `
  (Join-Path $InstallRoot "tests\parser.test.mjs") `
  (Join-Path $InstallRoot "tests\payment.test.mjs") `
  (Join-Path $InstallRoot "tests\telegram.test.mjs") `
  (Join-Path $InstallRoot "tests\wallet-import.test.mjs")
if ($LASTEXITCODE -ne 0) { throw "回归测试失败，未启动服务。" }

Register-RuntimeTasks $nodeExe $chromeExe $config
$commonDesktop = [Environment]::GetFolderPath("CommonDesktopDirectory")
if (-not $commonDesktop) { $commonDesktop = "C:\Users\Public\Desktop" }
New-Item -ItemType Directory -Path $commonDesktop -Force | Out-Null
$badCopy = Join-Path $commonDesktop "Import Payer Wallet.cmd"
Remove-Item -LiteralPath $badCopy -Force -ErrorAction SilentlyContinue
$oldWalletShortcutPath = Join-Path $commonDesktop "Import Payer Wallet.lnk"
Remove-Item -LiteralPath $oldWalletShortcutPath -Force -ErrorAction SilentlyContinue
$walletShortcutPath = Join-Path $commonDesktop "导入付款钱包（窗口保持打开）.lnk"
$walletShell = New-Object -ComObject WScript.Shell
$walletShortcut = $walletShell.CreateShortcut($walletShortcutPath)
$walletShortcut.TargetPath = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
$walletScriptPath = Join-Path $InstallRoot "scripts\open-wallet-importer.ps1"
$walletShortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $walletScriptPath + '" -InstallRoot "' + $InstallRoot + '"'
$walletShortcut.WorkingDirectory = $InstallRoot
$walletShortcut.Description = "Import the BSC payer wallet using hidden local input"
$walletShortcut.Save()

Write-Step "启动 Chrome、状态页和 Telegram 接收器"
Start-ScheduledTask -TaskName "SafeTGDemoBrowser"
$browserVersion = Wait-ForBrowser ([int]$config.cdpPort)
Start-ScheduledTask -TaskName "SafeTGDemoServer"
Start-ScheduledTask -TaskName "SafeTGDemoBot"
Start-Sleep -Seconds 2

$botProcess = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -like "node*" -and $_.CommandLine -like "*$InstallRoot\telegram-bot.mjs*"
} | Select-Object -First 1
if (-not $botProcess) {
  throw "Telegram 接收器没有启动。请查看 $InstallRoot\telegram-bot.log"
}

if ($DemoFill) {
  Write-Step "使用虚构样例创建测试订单并执行 dry-run 支付预检"
  & $nodeExe (Join-Path $InstallRoot "dry-run-flow.mjs") (Join-Path $InstallRoot "sample-message.txt")
  if ($LASTEXITCODE -ne 0) { throw "样例端到端预演失败。" }
}

Write-Host "`n安装完成" -ForegroundColor Green
Write-Host "安装目录：$InstallRoot"
Write-Host "Chrome：$browserVersion"
Write-Host "CDP：http://127.0.0.1:$($config.cdpPort)"
Write-Host "接收器进程 PID：$($botProcess.ProcessId)"
Write-Host "日志：$InstallRoot\telegram-bot.log"
Write-Host "支付模式：$($config.paymentMode)（dry-run 会完成钱包与链上预检，但不签名、不广播）。"
Write-Host "付款钱包：请在服务器桌面双击‘导入付款钱包（窗口保持打开）’，以隐藏输入方式本地导入。"
