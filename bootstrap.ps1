[CmdletBinding()]
param(
  [string]$ConfigFile = "",
  [string]$InstallRoot = "C:\SafeTGDemo",
  [switch]$SkipPrerequisites,
  [switch]$DemoFill
)

$ErrorActionPreference = "Stop"
$installer = Join-Path $PSScriptRoot "scripts\install-windows.ps1"
& $installer -ConfigFile $ConfigFile -InstallRoot $InstallRoot -SkipPrerequisites:$SkipPrerequisites -DemoFill:$DemoFill
