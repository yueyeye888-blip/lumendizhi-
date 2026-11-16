[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Destination,[Parameter(Mandatory=$true)][string]$KeyDirectory)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$node='C:\Tools\node22\node.exe'
$id=(Get-Date -Format 'yyyyMMdd')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8)
$job=Join-Path $env:TEMP ('LumenBackup-'+$id)
$user=[Security.Principal.WindowsIdentity]::GetCurrent().Name
foreach($dir in @($job,$KeyDirectory)){New-Item -ItemType Directory $dir -Force|Out-Null;& icacls.exe $dir /inheritance:r /grant:r "$user`:(OI)(CI)(F)" 'SYSTEM:(OI)(CI)(F)'|Out-Null;if($LASTEXITCODE -ne 0){throw 'Cannot protect backup key directory'}}
$bytes=New-Object byte[] 32;[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$value=@{format='lumen-recovery-key-v1';snapshotId=$id;keyBase64=[Convert]::ToBase64String($bytes)}|ConvertTo-Json
$key=Join-Path $KeyDirectory ($id+'-RECOVERY-KEY.json')
[IO.File]::WriteAllText($key,$value,[Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $job 'input.json'),$value,[Text.UTF8Encoding]::new($false))
Copy-Item "$repo\tools\backup\vault.mjs","$repo\tools\backup\export-windows.mjs" $job
& $node --no-warnings "$job\export-windows.mjs"
if($LASTEXITCODE -ne 0){throw "Snapshot failed. Private diagnostics: $job"}
$parts=Join-Path $Destination $id
& $node "$repo\tools\backup\package-snapshot.mjs" "$job\result.json" "$job\snapshot.enc" $parts
if($LASTEXITCODE -ne 0){throw 'Snapshot packaging failed'}
Write-Host "Encrypted backup: $parts"
Write-Host "Keep this key separately and offline: $key"
