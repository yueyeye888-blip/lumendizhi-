[CmdletBinding()]
param(
  [string]$InstallRoot = "C:\SafeTGDemo",
  [int]$CdpPort = 9333
)

$ErrorActionPreference = "Stop"
foreach ($taskName in @("SafeTGDemoBot", "SafeTGDemoServer", "SafeTGDemoBrowser")) {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
}
Get-CimInstance Win32_Process | Where-Object {
  ($_.Name -like "node*" -and $_.CommandLine -like "*$InstallRoot*") -or
  ($_.Name -like "chrome*" -and $_.CommandLine -like "*--remote-debugging-port=$CdpPort*" -and $_.CommandLine -like "*safe_tg_demo_profile*")
} | ForEach-Object {
  Invoke-CimMethod -InputObject $_ -MethodName Terminate | Out-Null
}
Write-Host "地址资料自动填入服务已停止。"
