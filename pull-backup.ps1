# ==============================================================================
# Tide Backup Puller (Laptop <-> Server Sync Guard)
#
# Laedt die aktuellste Sicherung der Nutzerdaten von go-tide.app auf den Laptop
# in das lokale Verzeichnis 'backups/<timestamp>/'.
#
# SICHERHEITS-SCHUTZ:
# 1. Backups sind in .gitignore registriert (werden niemals nach GitHub committet).
# 2. Backups verbleiben im lokalen Ordner 'backups/' und werden NICHT zurueck auf
#    den Server synchronisiert/ueberschrieben.
# ==============================================================================

param (
    [string]$Server = "root@go-tide.app",
    [string]$RemoteBackupRoot = "~/tide_backup",
    [string]$LocalBackupDir = "$PSScriptRoot\backups",
    [switch]$TriggerRemoteBackup = $true
)

$ErrorActionPreference = "Stop"

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host " Tide Nutzerdaten-Sicherung (Server -> Laptop)" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

# 1. Optional: Erst auf dem Server ein frisches Backup erzeugen
if ($TriggerRemoteBackup) {
    Write-Host "📡 Erstelle frisches Backup auf dem Server ($Server)..." -ForegroundColor Yellow
    ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new $Server "bash -c 'cd ~/tide && ./tide.sh -c'"
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Remote-Backup-Befehl beendete mit Code $LASTEXITCODE. Fahre mit bestehenden Backups fort..."
    }
}

# 2. Neuestes Backup-Verzeichnis vom Server ermitteln
Write-Host "🔍 Ermittle neuesten Sicherungsordner..." -ForegroundColor Yellow
$latestFolder = ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new $Server "readlink -f $RemoteBackupRoot/latest 2>/dev/null || ls -td $RemoteBackupRoot/* 2>/dev/null | grep -v latest | head -n 1"
$latestFolder = $latestFolder.Trim()

if (-not $latestFolder -or $latestFolder -eq "") {
    Write-Error "❌ Kein Backup-Verzeichnis unter $RemoteBackupRoot auf dem Server gefunden!"
    exit 1
}

$folderName = Split-Path $latestFolder -Leaf
$targetDir = Join-Path $LocalBackupDir $folderName

Write-Host "📥 Gefunden: $latestFolder" -ForegroundColor Green
Write-Host "📁 Lokales Ziel: $targetDir" -ForegroundColor Green

if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

# 3. Sichere Uebertragung via SCP (Nur Download Server -> Laptop)
Write-Host "⬇️  Lade Backup herunter..." -ForegroundColor Yellow
scp -r "${Server}:${latestFolder}/*" "$targetDir"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Sicherung erfolgreich auf Laptop uebertragen!" -ForegroundColor Green
    Write-Host "📂 Gespeicherte Dateien in $targetDir :" -ForegroundColor Cyan
    Get-ChildItem $targetDir | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize

    $localLatest = Join-Path $LocalBackupDir "latest"
    if (Test-Path $localLatest) {
        Remove-Item -Recurse -Force $localLatest
    }
    Copy-Item -Recurse -Force $targetDir $localLatest
    Write-Host "📌 Lokaler latest-Ordner aktualisiert: $localLatest" -ForegroundColor Gray
} else {
    Write-Error "❌ Fehler beim Herunterladen via SCP (Code $LASTEXITCODE)."
    exit 1
}
