[CmdletBinding()]
param([string]$BotRoot='C:\SafeTGDemo',[string]$SiteRoot='C:\LumenResourceHub',[string]$NodeRoot='C:\Tools\node22',[string]$ChromeRoot='C:\Tools\lumen-chrome',[Parameter(Mandatory=$true)][string]$Origin,[ValidateSet('Full','Automation')][string]$Mode='Full')
$ErrorActionPreference='Stop';$utf8=[Text.UTF8Encoding]::new($false)
$user=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$node=Join-Path $NodeRoot 'node.exe';$chrome=Join-Path $ChromeRoot 'chrome.exe'
foreach($file in @($node,$chrome,"$SiteRoot\bin\caddy.exe")){if(-not(Test-Path $file)){throw "Missing offline dependency: $file"}}
& icacls.exe $NodeRoot /grant '*S-1-5-19:(OI)(CI)(RX)'|Out-Null
& icacls.exe $SiteRoot /grant '*S-1-5-19:(OI)(CI)(RX)'|Out-Null
foreach($dir in @("$SiteRoot\data","$SiteRoot\logs","$BotRoot\data\site-order-queue")){
 New-Item -ItemType Directory $dir -Force|Out-Null
 & icacls.exe $dir /grant '*S-1-5-19:(OI)(CI)(M)'|Out-Null
 if($LASTEXITCODE -ne 0){throw "ACL configuration failed: $dir"}
}
$vc=Join-Path $SiteRoot 'vc_redist.x64.exe'
if(Test-Path $vc){$p=Start-Process $vc -ArgumentList '/install','/quiet','/norestart' -Wait -PassThru;if($p.ExitCode -notin @(0,1638,3010)){throw "VC runtime installation failed: $($p.ExitCode)"};if($p.ExitCode -eq 3010){Write-Warning 'Windows requests a restart before activation.'}}
$site=Get-Content "$SiteRoot\config\runtime.json" -Raw -Encoding UTF8|ConvertFrom-Json
# Windows PowerShell uses the buffer overload of GetBytes.
$bytes=New-Object byte[] 32;[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes);$password=[Convert]::ToBase64String($bytes)
$cert=New-SelfSignedCertificate -DnsName 'lumen-backend.internal' -CertStoreLocation 'Cert:\LocalMachine\My' -KeyExportPolicy Exportable -NotAfter (Get-Date).AddYears(2)
Export-PfxCertificate -Cert $cert -FilePath "$SiteRoot\config\tls.pfx" -Password (ConvertTo-SecureString $password -AsPlainText -Force) -Force|Out-Null
$pem="-----BEGIN CERTIFICATE-----`n"+[Convert]::ToBase64String($cert.RawData,[Base64FormattingOptions]::InsertLineBreaks)+"`n-----END CERTIFICATE-----`n"
[IO.File]::WriteAllText("$SiteRoot\config\backend-ca.pem",$pem,$utf8)
$site.tlsPfxPassword=$password;$site.origin=$Origin
[IO.File]::WriteAllText("$SiteRoot\config\runtime.json",($site|ConvertTo-Json -Depth 20),$utf8)
$domain=([Uri]$Origin).Host;$sitePath=$SiteRoot.Replace('\','/')
$proxy=if($Mode -eq 'Automation'){'reverse_proxy 127.0.0.1:8770'}else{@"
reverse_proxy https://127.0.0.1:8443 {
 transport http {
  tls_server_name lumen-backend.internal
  tls_trust_pool file $sitePath/config/backend-ca.pem
 }
}
"@}
$caddy=@"
{
 admin off
 persist_config off
 auto_https disable_redirects
 storage file_system {
  root $sitePath/data/caddy
 }
 servers {
  protocols h1 h2
 }
}
$domain {
 tls {
  issuer acme {
   disable_http_challenge
  }
 }
 $proxy
}
"@
[IO.File]::WriteAllText("$SiteRoot\Caddyfile.yorkeai",$caddy,$utf8)
& "$SiteRoot\bin\caddy.exe" validate --config "$SiteRoot\Caddyfile.yorkeai" --adapter caddyfile
if($LASTEXITCODE -ne 0){throw 'Caddy configuration invalid'}
function Save-Launcher([string]$File,[string]$Directory,[string]$Command,[string]$LogPrefix){
 $text="`$ErrorActionPreference = 'Stop'`nSet-Location '$($Directory.Replace("'","''"))'`n`$ErrorActionPreference = 'Continue'`n& $Command 1>> '$LogPrefix.stdout.log' 2>> '$LogPrefix.stderr.log'`nexit `$LASTEXITCODE`n"
 [IO.File]::WriteAllText($File,$text,$utf8)
}
Save-Launcher "$SiteRoot\start-web.ps1" $SiteRoot "'$node' --max-old-space-size=512 server.mjs" "$SiteRoot\logs\web"
Save-Launcher "$SiteRoot\start-domain-proxy.ps1" $SiteRoot "'$SiteRoot\bin\caddy.exe' run --config '$SiteRoot\Caddyfile.yorkeai' --adapter caddyfile" "$SiteRoot\logs\caddy"
if($Mode -eq 'Automation'){
 New-Item -ItemType Directory "$BotRoot\standalone-data" -Force|Out-Null
 foreach($dir in @("$BotRoot\standalone","$BotRoot\lib")){& icacls.exe $dir /grant '*S-1-5-19:(OI)(CI)(RX)'|Out-Null}
 & icacls.exe "$BotRoot\standalone-config.private.json" /grant '*S-1-5-19:(R)'|Out-Null
 & icacls.exe "$BotRoot\standalone-data" /grant '*S-1-5-19:(OI)(CI)(M)'|Out-Null
 Save-Launcher "$SiteRoot\start-address-api.ps1" $BotRoot "'$node' --no-warnings '$BotRoot\standalone\server.mjs' '$BotRoot\standalone-config.private.json'" "$SiteRoot\logs\address-api"
}
$service=New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount
$interactive=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest
$settings=New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$settings.Enabled=$false
foreach($pair in @(@('LumenResourceHub-Web','start-web.ps1'),@('LumenResourceHub-Domain','start-domain-proxy.ps1'))){$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$SiteRoot\$($pair[1])`"" -WorkingDirectory $SiteRoot;Register-ScheduledTask -TaskName $pair[0] -Action $action -Trigger (New-ScheduledTaskTrigger -AtStartup) -Principal $service -Settings $settings -Force|Out-Null}
if($Mode -eq 'Automation'){$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$SiteRoot\start-address-api.ps1`"" -WorkingDirectory $BotRoot;Register-ScheduledTask -TaskName 'LumenAddressAPI' -Action $action -Trigger (New-ScheduledTaskTrigger -AtStartup) -Principal $service -Settings $settings -Force|Out-Null}
$cfg=Get-Content "$BotRoot\runtime-config.json" -Raw -Encoding UTF8|ConvertFrom-Json
$profile=Join-Path $env:USERPROFILE 'safe_tg_demo_profile'
$action=New-ScheduledTaskAction -Execute $chrome -Argument "--new-window --remote-debugging-port=$($cfg.cdpPort) --remote-allow-origins=* --user-data-dir=`"$profile`" --no-first-run --no-default-browser-check --window-size=1600,1000 $($cfg.targetUrl)"
Register-ScheduledTask -TaskName 'SafeTGDemoBrowser' -Action $action -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $user) -Principal $interactive -Settings $settings -Force|Out-Null
foreach($pair in @(@('SafeTGDemoBot','telegram-bot.mjs'),@('SafeTGDemoServer','server.mjs'))){$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -Command `"& '$node' '$BotRoot\$($pair[1])' *>> '$BotRoot\$($pair[0]).log'`"" -WorkingDirectory $BotRoot;Register-ScheduledTask -TaskName $pair[0] -Action $action -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $user) -Principal $interactive -Settings $settings -Force|Out-Null}
if(-not(Get-NetFirewallRule -DisplayName 'Lumen HTTPS 443' -ErrorAction SilentlyContinue)){New-NetFirewallRule -DisplayName 'Lumen HTTPS 443' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 443|Out-Null}
& "$PSScriptRoot\verify-service-access.ps1" -BotRoot $BotRoot -SiteRoot $SiteRoot -NodeRoot $NodeRoot
Write-Host 'Tasks registered but disabled. Queue permissions explicitly include LOCAL SERVICE.'
