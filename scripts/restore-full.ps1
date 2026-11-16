[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$KeyFile,
 [Parameter(Mandatory=$true)][string]$Origin,
 [ValidateSet('Full','Automation')][string]$Mode='Full',
 [string]$SnapshotManifest='',
 [string]$BotRoot='C:\SafeTGDemo',
 [string]$SiteRoot='C:\LumenResourceHub',
 [string]$NodeRoot='C:\Tools\node22',
 [string]$ChromeRoot='C:\Tools\lumen-chrome'
)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$user=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Run as the Windows desktop user, elevated as administrator.'}
if([Diagnostics.Process]::GetCurrentProcess().SessionId -eq 0){throw 'DPAPI restore requires an interactive desktop login. Open elevated PowerShell inside RDP; do not run restore through WinRM.'}
$uri=[Uri]$Origin
if($uri.Scheme -ne 'https' -or $uri.AbsolutePath -ne '/' -or $uri.Host -notmatch '^[a-zA-Z0-9.-]+$'){throw 'Origin must be an HTTPS domain without a path.'}
$Origin=$uri.GetLeftPart([UriPartial]::Authority)
foreach($folder in @($BotRoot,$SiteRoot,$ChromeRoot,$NodeRoot)){if(Test-Path $folder){throw "Destination already exists: $folder. Use an empty new server; no data has been overwritten."}}
if(-not $SnapshotManifest){$SnapshotManifest=(Get-ChildItem "$repo\backups\*\manifest.json"|Sort-Object FullName|Select-Object -Last 1).FullName}
if(-not $SnapshotManifest){throw 'No snapshot manifest found'}
$KeyFile=(Resolve-Path $KeyFile).Path
$work=Join-Path $env:TEMP ('lumen-restore-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $work|Out-Null
& icacls.exe $work /inheritance:r /grant:r "$user`:(OI)(CI)(F)" 'SYSTEM:(OI)(CI)(F)'|Out-Null
if($LASTEXITCODE -ne 0){throw 'Unable to protect restore staging'}
$node=Join-Path $NodeRoot 'node.exe'
if(-not(Test-Path $node)){
 [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
 $version='v22.22.1';$name="node-$version-win-x64.zip";$zip=Join-Path $work $name
 Invoke-WebRequest "https://nodejs.org/dist/$version/$name" -OutFile $zip -UseBasicParsing
 $sums=(Invoke-WebRequest "https://nodejs.org/dist/$version/SHASUMS256.txt" -UseBasicParsing).Content
 $line=($sums -split "`n"|Where-Object {$_ -match ([Regex]::Escape($name)+'\s*$')}|Select-Object -First 1)
 if(-not $line -or (Get-FileHash $zip -Algorithm SHA256).Hash -ne ($line -split '\s+')[0]){throw 'Node download checksum failed'}
 Expand-Archive $zip (Join-Path $work 'bootstrap-node')
 $node=Join-Path $work "bootstrap-node\node-$version-win-x64\node.exe"
}
$archive=Join-Path $work 'snapshot.tar.gz'
& $node "$repo\tools\backup\vault.mjs" decrypt $SnapshotManifest $KeyFile $archive
if($LASTEXITCODE -ne 0){throw 'Backup decryption failed'}
$entries=& tar.exe -tzf $archive
if($LASTEXITCODE -ne 0){throw 'Unable to list snapshot'}
foreach($entry in $entries){if($entry -match '(^[\/]|^[A-Za-z]:|(^|[\/])\.\.([\/]|$))'){throw 'Unsafe archive path'}}
$snapshot=Join-Path $work 'snapshot';New-Item -ItemType Directory $snapshot|Out-Null
& tar.exe -xzf $archive -C $snapshot
if($LASTEXITCODE -ne 0){throw 'Archive extraction failed'}
& $node "$repo\tools\backup\verify-snapshot.mjs" $snapshot
if($LASTEXITCODE -ne 0){throw 'Snapshot verification failed'}
foreach($pair in @(@("$snapshot\apps\SafeTGDemo",$BotRoot),@("$snapshot\apps\LumenResourceHub",$SiteRoot),@("$snapshot\runtime\chrome",$ChromeRoot))){
 New-Item -ItemType Directory $pair[1]|Out-Null
 & icacls.exe $pair[1] /inheritance:r /grant:r "$user`:(OI)(CI)(F)" 'SYSTEM:(OI)(CI)(F)'|Out-Null
 Copy-Item ($pair[0]+'\*') $pair[1] -Recurse -Force
}
New-Item -ItemType Directory $NodeRoot -Force|Out-Null
Copy-Item "$snapshot\runtime\node22\*" $NodeRoot -Recurse -Force
$node=Join-Path $NodeRoot 'node.exe'
Copy-Item "$repo\standalone" (Join-Path $BotRoot 'standalone') -Recurse -Force
& $node "$repo\tools\backup\prepare-restored.mjs" $snapshot $BotRoot $SiteRoot $Origin $Mode
if($LASTEXITCODE -ne 0){throw 'Portable credentials or restored configuration failed'}
& "$PSScriptRoot\configure-restored-windows.ps1" -BotRoot $BotRoot -SiteRoot $SiteRoot -NodeRoot $NodeRoot -ChromeRoot $ChromeRoot -Origin $Origin -Mode $Mode
if(-not $?){throw 'Windows service configuration failed'}
# The encrypted snapshot is the durable copy. Remove the decrypted staging only after success.
Remove-Item $work -Recurse -Force
Write-Host 'Restore complete. Services remain stopped; original queued jobs are held and payment is dry-run.'
Write-Host "Stop the previous server, review restore-state.json, then run scripts\start-restored.ps1."
