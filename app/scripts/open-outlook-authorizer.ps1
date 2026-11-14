[CmdletBinding()]
param(
  [string]$InstallRoot = "C:\SafeTGDemo",
  [string]$NodeExe = "C:\Tools\node22\node.exe"
)

$ErrorActionPreference = "Stop"
$host.UI.RawUI.WindowTitle = "授权 Outlook 邮箱（请勿关闭窗口）"
try {
  & $NodeExe (Join-Path $InstallRoot "authorize-outlook.mjs")
  if ($LASTEXITCODE -ne 0) { throw "Outlook 授权工具退出码：$LASTEXITCODE" }
  $configPath = Join-Path $InstallRoot "runtime-config.json"
  $config = Get-Content $configPath -Raw | ConvertFrom-Json
  $config.outlookRelay.enabled = $true
  $utf8NoBom = New-Object Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 8) + [Environment]::NewLine, $utf8NoBom)
  Restart-ScheduledTask -TaskName "SafeTGDemoBot" -ErrorAction SilentlyContinue
  Write-Host ""
  Write-Host "Outlook 邮件接管已授权，接收器已重新启动。" -ForegroundColor Green
}
catch {
  Write-Host ""
  Write-Host $_.Exception.Message -ForegroundColor Red
}
Write-Host ""
Read-Host "按回车键关闭窗口"
