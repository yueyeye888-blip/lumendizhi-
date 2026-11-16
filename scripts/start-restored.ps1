[CmdletBinding()]
param([Parameter(Mandatory=$true)][switch]$PreviousServerStopped,[switch]$EnableLivePayments,[switch]$ResumeMailRelay,[string]$BotRoot='C:\SafeTGDemo')
$ErrorActionPreference='Stop'
if(-not $PreviousServerStopped){throw 'Stop the previous consumer first.'}
$state=Get-Content "$BotRoot\restore-state.json" -Raw -Encoding UTF8|ConvertFrom-Json
$config=Get-Content "$BotRoot\runtime-config.json" -Raw -Encoding UTF8|ConvertFrom-Json
$original=Get-Content "$BotRoot\restore-activation.private.json" -Raw -Encoding UTF8|ConvertFrom-Json
if($EnableLivePayments){$config.paymentMode=$original.paymentMode;$config.paymentLiveApproval=$original.paymentLiveApproval}
if($ResumeMailRelay){$config.outlookRelay.enabled=$original.outlookRelayEnabled}
[IO.File]::WriteAllText("$BotRoot\runtime-config.json",($config|ConvertTo-Json -Depth 20),[Text.UTF8Encoding]::new($false))
$web=if($state.mode -eq 'Automation'){'LumenAddressAPI'}else{'LumenResourceHub-Web'}
foreach($name in @($web,'LumenResourceHub-Domain','SafeTGDemoBrowser','SafeTGDemoServer')){Enable-ScheduledTask -TaskName $name|Out-Null;Start-ScheduledTask -TaskName $name}
$ready=$false
for($i=0;$i -lt 24;$i++){try{$health=Invoke-RestMethod ($state.origin+'/__host/health') -TimeoutSec 4;$browser=Invoke-RestMethod "http://127.0.0.1:$($config.cdpPort)/json/version" -TimeoutSec 4;if($health.ok -and $browser.webSocketDebuggerUrl){$ready=$true;break}}catch{};Start-Sleep -Seconds 3}
if(-not $ready){throw 'Website/CDP not ready. Consumer was not started. Check DNS, TLS, desktop login and service logs.'}
Enable-ScheduledTask -TaskName 'SafeTGDemoBot'|Out-Null;Start-ScheduledTask -TaskName 'SafeTGDemoBot'
Write-Host "Consumer started. Payment mode: $($config.paymentMode). Historical held queue items remain held."
