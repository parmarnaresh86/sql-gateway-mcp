#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Please install Node.js 18+ from https://nodejs.org and re-run this script."
  exit 1
fi

if [ ! -f .env ]; then
  echo "Setting up .env..."
  read -p "Render URL (e.g. wss://your-app.onrender.com/agent): " RENDER_URL
  read -p "Connector ID (e.g. office-pc): " CONNECTOR_ID
  read -p "Connector Token: " CONNECTOR_TOKEN
  read -p "DB Engine (mysql/postgres/mssql/sqlite): " DB_ENGINE
  read -p "DB Host (blank for sqlite): " DB_HOST
  read -p "DB Port (blank for sqlite): " DB_PORT
  read -p "DB User (blank for sqlite): " DB_USER
  read -p "DB Password (blank for sqlite): " DB_PASSWORD
  read -p "DB Name (blank for sqlite): " DB_NAME
  read -p "DB Path (sqlite only, blank otherwise): " DB_PATH

  cat > .env <<EOF
RENDER_URL=$RENDER_URL
CONNECTOR_ID=$CONNECTOR_ID
CONNECTOR_TOKEN=$CONNECTOR_TOKEN
DB_ENGINE=$DB_ENGINE
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=$DB_NAME
DB_PATH=$DB_PATH
EOF
  echo ".env written."
else
  echo ".env already exists, skipping setup prompts."
fi

echo "Installing dependencies..."
npm install

if ! command -v pm2 >/dev/null 2>&1; then
  echo "Installing pm2 globally..."
  npm install -g pm2
fi

pm2 start agent.js --name sql-connector
pm2 save

echo ""
echo "Done. The connector is running as a background service named 'sql-connector'."
echo "Check status:  pm2 status"
echo "View logs:     pm2 logs sql-connector"
echo "Restart:       pm2 restart sql-connector"
echo ""
echo "To make this survive a reboot, run: pm2 startup   (then follow the printed instructions)"
