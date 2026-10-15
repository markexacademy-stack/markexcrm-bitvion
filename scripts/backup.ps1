$ErrorActionPreference = "Stop"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$root = Split-Path -Parent $PSScriptRoot
$destDir = Join-Path $root "backups"
New-Item -ItemType Directory -Force -Path $destDir | Out-Null
$dest = Join-Path $destDir "markex-$stamp.archive"
docker exec markex-mongo mongodump --archive=/tmp/markex.archive --db=markex_crm
docker cp "markex-mongo:/tmp/markex.archive" $dest
Write-Host "Wrote $dest"
