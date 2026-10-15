# Database backups

Student records, form configuration, and email history live in MongoDB. Take a backup before upgrades and keep copies off the application server.

## Docker MongoDB

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force backups | Out-Null
docker exec markex-mongo mongodump --archive=/tmp/markex.archive --db=markex_crm
docker cp "markex-mongo:/tmp/markex.archive" "backups/markex-$stamp.archive"
```

Restore into a maintenance window:

```powershell
docker cp .\backups\markex-YYYYMMDD-HHMMSS.archive markex-mongo:/tmp/restore.archive
docker exec markex-mongo mongorestore --archive=/tmp/restore.archive --drop
```

`--drop` replaces the current database. Run it only when you intend to replace the data.

## MongoDB Atlas

Use Atlas continuous backup or `mongodump` against the Atlas connection string. Restrict the backup host’s network access and do not store the connection string in the frontend.

Schedule the PowerShell script `scripts/backup.ps1` with Task Scheduler or run the equivalent dump from the host that can reach the database. Test a restore on a separate database before relying on the copy.
