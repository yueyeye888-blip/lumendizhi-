[CmdletBinding()]
param([string]$InstallRoot = "C:\SafeTGDemo")

$ErrorActionPreference = "Stop"
foreach ($taskName in @("SafeTGDemoBrowser", "SafeTGDemoServer", "SafeTGDemoBot")) {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
  if ($task.State -ne "Running") { Start-ScheduledTask -TaskName $taskName }
}
Write-Host "地址资料自动建单服务已启动。日志：$InstallRoot\telegram-bot.log"
