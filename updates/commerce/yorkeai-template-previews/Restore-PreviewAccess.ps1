[CmdletBinding()]
param([string]$SiteRoot = 'C:\LumenResourceHub')

$ErrorActionPreference = 'Stop'
$client = Join-Path $SiteRoot 'dist\client'
$previews = Get-Item -LiteralPath (Join-Path $client 'yorke-previews')
if (!$previews.PSIsContainer -or ($previews.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'Expected the local YorkeAI preview directory.'
}
$files = @(Get-ChildItem -LiteralPath $previews.FullName -Force)
foreach ($file in $files) {
    if ($file.PSIsContainer -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
        $file.Name -notmatch '^(addr|windx)-[1-9][0-9]*\.webp$') {
        throw "Unexpected entry in the preview directory: $($file.Name)"
    }
}

# A same-volume move can retain the staging folder's ACL. Re-inherit the
# website's static-file permissions for this image directory and its contents.
& icacls.exe $previews.FullName /reset /T /Q
if ($LASTEXITCODE -ne 0) { throw 'Could not restore inherited access to the preview files.' }
Write-Output "Applied static-file permissions to $($files.Count) previews."
