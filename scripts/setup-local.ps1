# Start PostgreSQL + Redis for local development (requires Docker Desktop)
param(
    [switch]$Migrate
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Host "Docker is not installed." -ForegroundColor Red
    Write-Host ""
    Write-Host "Install Docker Desktop for Windows:" -ForegroundColor Yellow
    Write-Host "  https://www.docker.com/products/docker-desktop/"
    Write-Host ""
    Write-Host "After installation, restart this script:" -ForegroundColor Yellow
    Write-Host "  .\scripts\setup-local.ps1 -Migrate"
    Write-Host ""
    Write-Host "Alternative: install PostgreSQL 16 locally and set DATABASE_URL in .env"
    Write-Host "  DATABASE_URL=postgresql://vermietung:vermietung@localhost:5432/vermietung?schema=public"
    exit 1
}

Write-Host "Starting PostgreSQL and Redis..." -ForegroundColor Cyan
docker compose up -d postgres redis

Write-Host "Waiting for PostgreSQL..." -ForegroundColor Cyan
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    $status = docker compose exec -T postgres pg_isready -U vermietung -d vermietung 2>$null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 2
}

if (-not $ready) {
    Write-Host "PostgreSQL did not become ready in time." -ForegroundColor Red
    exit 1
}

Write-Host "PostgreSQL is ready." -ForegroundColor Green

if ($Migrate) {
    Write-Host "Running migrations..." -ForegroundColor Cyan
    npx prisma generate
    npx prisma migrate deploy
    Write-Host "Migrations applied." -ForegroundColor Green
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Green
Write-Host "  npm run start:dev"
Write-Host "  http://localhost:3000/docs"
