@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto :nonode

if exist .env goto :afterenv

echo ============================================
echo   SQL Gateway Connector - one-touch setup
echo ============================================
echo.

set RENDER_URL=wss://sql-gateway-mcp-server.onrender.com/agent
echo Render URL: %RENDER_URL%
echo.

set /p CONNECTOR_ID=Connector ID - a unique name for THIS pc, e.g. branch-office:
set /p CONNECTOR_TOKEN=Connector Token - given to you by the admin:
echo.

set DB_ENGINE=mssql
echo DB Engine: %DB_ENGINE% (SQL Server)
set /p DB_HOST=SQL Server host, e.g. SERVERNAME or SERVERNAME\INSTANCE:
set /p DB_PORT=SQL Server port [1433, press Enter to skip if using a named instance]:
set /p DB_USER=SQL Server login username:
set /p DB_PASSWORD=SQL Server login password:
set /p DB_NAME=Database name:

(
echo RENDER_URL=%RENDER_URL%
echo CONNECTOR_ID=%CONNECTOR_ID%
echo CONNECTOR_TOKEN=%CONNECTOR_TOKEN%
echo DB_ENGINE=%DB_ENGINE%
echo DB_HOST=%DB_HOST%
echo DB_PORT=%DB_PORT%
echo DB_USER=%DB_USER%
echo DB_PASSWORD=%DB_PASSWORD%
echo DB_NAME=%DB_NAME%
echo DB_PATH=
) > .env

echo.
echo .env written.
echo.
echo IMPORTANT: this connector will not come online until the admin adds
echo   %CONNECTOR_ID%:%CONNECTOR_TOKEN%
echo to the CONNECTOR_TOKENS environment variable on Render.
echo.

:afterenv
echo Installing dependencies, this can take a minute...
call npm install
if errorlevel 1 goto :installfail

echo.
echo Starting connector...
call .\start.bat

echo.
echo ============================================
echo   Setup complete.
echo   Check status:  type agent.log
echo   Stop:          stop.bat
echo   Start again:   start.bat
echo ============================================
pause
exit /b 0

:nonode
echo Node.js is not installed. Install it from https://nodejs.org (LTS version) and re-run this installer.
pause
exit /b 1

:installfail
echo npm install failed. Check your internet connection and re-run this installer.
pause
exit /b 1
