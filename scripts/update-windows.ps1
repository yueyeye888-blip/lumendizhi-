[CmdletBinding()]
param(
  [string]$InstallRoot = "C:\SafeTGDemo",
  [switch]$DemoFill
)

$ErrorActionPreference = "Stop"
$configPath = Join-Path $InstallRoot "runtime-config.json"
if (-not (Test-Path $configPath)) {
  throw "未找到现有私密配置：$configPath。请改用 bootstrap.ps1 完整安装。"
}
$installer = Join-Path $PSScriptRoot "install-windows.ps1"
& $installer -ConfigFile $configPath -InstallRoot $InstallRoot -SkipPrerequisites -DemoFill:$DemoFill
