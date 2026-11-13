[CmdletBinding()]
param(
  [string]$InstallRoot = (Split-Path $PSScriptRoot -Parent)
)

$ErrorActionPreference = "Stop"
$importScript = Join-Path $InstallRoot "scripts\import-payer-wallet.ps1"

try {
  Clear-Host
  $Host.UI.RawUI.WindowTitle = "导入付款钱包"
  Write-Host "付款钱包本地导入" -ForegroundColor Cyan
  Write-Host "请等待出现‘请输入新的专用钱包私钥’后再粘贴。" -ForegroundColor Yellow
  Write-Host "正常输入时屏幕不会显示任何字符，粘贴后按 Enter。`n"

  if (-not (Test-Path $importScript)) {
    throw "未找到钱包导入脚本：$importScript"
  }

  & $importScript -InstallRoot $InstallRoot
}
catch {
  Write-Host "`n导入工具运行失败：" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host "请截图保留本窗口中的完整错误。" -ForegroundColor Yellow
}
finally {
  Write-Host "`n本窗口不会自动关闭。"
  [void](Read-Host "确认看完上方结果后，按 Enter 关闭")
}
