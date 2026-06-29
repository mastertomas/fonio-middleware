# Start local PostgreSQL on Windows (when service is stopped)
$pgBin = "C:\Program Files\PostgreSQL\16\bin"
$dataDir = "C:\Program Files\PostgreSQL\16\data"
$logFile = "$dataDir\startup.log"

if (-not (Test-Path "$pgBin\pg_ctl.exe")) {
    Write-Host "PostgreSQL 16 not found at C:\Program Files\PostgreSQL\16" -ForegroundColor Red
    Write-Host "Install from: https://www.postgresql.org/download/windows/"
    exit 1
}

$ready = Test-NetConnection -ComputerName localhost -Port 5432 -WarningAction SilentlyContinue
if ($ready.TcpTestSucceeded) {
    Write-Host "PostgreSQL is already running on port 5432." -ForegroundColor Green
    exit 0
}

Write-Host "Starting PostgreSQL..." -ForegroundColor Cyan
& "$pgBin\pg_ctl.exe" start -D $dataDir -l $logFile -w

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to start PostgreSQL. Check log: $logFile" -ForegroundColor Red
    exit 1
}

Write-Host "PostgreSQL started on localhost:5432" -ForegroundColor Green
Write-Host "Connection: postgresql://vermietung:vermietung@localhost:5432/vermietung"
