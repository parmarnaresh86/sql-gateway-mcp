$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Test-CommandExists($name) {
  return $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

if (-not (Test-CommandExists "node")) {
  Write-Host "Node.js is not installed. Please install Node.js 18+ from https://nodejs.org and re-run this script." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path ".env")) {
  Write-Host "Setting up .env..."
  $RenderUrl = Read-Host "Render URL (e.g. wss://your-app.onrender.com/agent)"
  $ConnectorId = Read-Host "Connector ID (e.g. office-pc)"
  $ConnectorToken = Read-Host "Connector Token"
  $DbEngine = Read-Host "DB Engine (mysql/postgres/mssql/sqlite)"
  $DbHostName = Read-Host "DB Host (blank for sqlite)"
  $DbPort = Read-Host "DB Port (blank for sqlite)"
  $DbUser = Read-Host "DB User (blank for sqlite)"
  $DbPassword = Read-Host "DB Password (blank for sqlite)"
  $DbName = Read-Host "DB Name (blank for sqlite)"
  $DbPath = Read-Host "DB Path (sqlite only, blank otherwise)"

  @"
RENDER_URL=$RenderUrl
CONNECTOR_ID=$ConnectorId
CONNECTOR_TOKEN=$ConnectorToken
DB_ENGINE=$DbEngine
DB_HOST=$DbHostName
DB_PORT=$DbPort
DB_USER=$DbUser
DB_PASSWORD=$DbPassword
DB_NAME=$DbName
DB_PATH=$DbPath
"@ | Out-File -FilePath ".env" -Encoding utf8

  Write-Host ".env written."
} else {
  Write-Host ".env already exists, skipping setup prompts."
}

Write-Host "Installing dependencies..."
npm install

if (-not (Test-CommandExists "pm2")) {
  Write-Host "Installing pm2 globally..."
  npm install -g pm2
}

pm2 start agent.js --name sql-connector
pm2 save

Write-Host ""
Write-Host "Done. The connector is running as a background service named 'sql-connector'." -ForegroundColor Green
Write-Host "Check status:  pm2 status"
Write-Host "View logs:     pm2 logs sql-connector"
Write-Host "Restart:       pm2 restart sql-connector"
Write-Host ""
Write-Host "For boot persistence on Windows, install pm2-windows-startup:"
Write-Host "  npm install -g pm2-windows-startup"
Write-Host "  pm2-startup install"
