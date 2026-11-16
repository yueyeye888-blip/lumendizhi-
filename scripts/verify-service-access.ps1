[CmdletBinding()]
param([string]$BotRoot='C:\SafeTGDemo',[string]$SiteRoot='C:\LumenResourceHub',[string]$NodeRoot='C:\Tools\node22')
$ErrorActionPreference='Stop'
$id=[Guid]::NewGuid().ToString('N');$name='LumenRestoreAccess-'+$id
$script=Join-Path "$SiteRoot\data" ($name+'.mjs');$result=$script+'.result'
$queue=Join-Path "$BotRoot\data\site-order-queue" ('_restore-access-probe-'+$id)
$code="import fs from 'node:fs';const q=$($queue|ConvertTo-Json -Compress);fs.mkdirSync(q);fs.writeFileSync(q+'/probe','ok');fs.renameSync(q+'/probe',q+'/verified');fs.rmSync(q,{recursive:true});fs.writeFileSync($($result|ConvertTo-Json -Compress),'ok');"
[IO.File]::WriteAllText($script,$code,[Text.UTF8Encoding]::new($false))
try{
 $action=New-ScheduledTaskAction -Execute "$NodeRoot\node.exe" -Argument "`"$script`""
 $principal=New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount
 Register-ScheduledTask -TaskName $name -Action $action -Principal $principal -Force|Out-Null
 Start-ScheduledTask -TaskName $name
 $ok=$false;for($i=0;$i -lt 30;$i++){Start-Sleep -Seconds 1;if(Test-Path $result){$ok=(Get-Content $result -Raw) -eq 'ok';break}}
 if(-not $ok){throw 'LOCAL SERVICE queue write/rename/delete probe failed. Consumer remains disabled.'}
 Write-Host 'LOCAL SERVICE queue access verified using the actual service identity.'
}finally{
 Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
 Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
 Remove-Item $script,$result -Force -ErrorAction SilentlyContinue
 if(Test-Path $queue){Remove-Item $queue -Recurse -Force}
}
