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

for /f "delims=" %%T in ('powershell -NoProfile -Command "$b=New-Object byte[] 32; (New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($b); ([BitConverter]::ToString($b)).Replace('-','').ToLower()"') do set CONNECTOR_TOKEN=%%T
echo.
echo Generated a new Connector Token for this PC: %CONNECTOR_TOKEN%
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

(
echo Add this line to the CONNECTOR_TOKENS environment variable in the
echo Render dashboard for the sql-gateway-mcp-server service.
echo If CONNECTOR_TOKENS already has entries, append a comma then this:
echo.
echo %CONNECTOR_ID%:%CONNECTOR_TOKEN%
) > ADD_TO_RENDER.txt

echo.
echo .env written.
echo.
echo ============================================
echo   IMPORTANT - one manual step left
echo ============================================
echo This connector will not come online until you add this line to
echo CONNECTOR_TOKENS in the Render dashboard for sql-gateway-mcp-server:
echo.
echo   %CONNECTOR_ID%:%CONNECTOR_TOKEN%
echo.
echo This has also been saved to ADD_TO_RENDER.txt in this folder.
echo ============================================
echo.

:afterenv
echo Installing dependencies, this can take a minute...
call npm install
if errorlevel 1 goto :installfail

echo.
echo ============================================
echo   Run mode
echo ============================================
echo   1 = Background process only (simple; you must run start.bat
echo       again after every reboot or logoff)
echo   2 = Windows auto-start service (Recommended; survives reboot,
echo       uses pm2 - needs internet access once, to install pm2)
echo ============================================
set /p RUNMODE=Choose 1 or 2 [2]:
if "%RUNMODE%"=="" set RUNMODE=2
if "%RUNMODE%"=="1" goto :simplestart

echo.
echo Installing pm2 (process manager) globally...
call npm install -g pm2
if errorlevel 1 goto :pm2fail

echo Installing pm2-windows-startup (registers pm2 to launch at boot)...
call npm install -g pm2-windows-startup
if errorlevel 1 goto :pm2fail

echo.
echo Stopping any previous instance of this connector under pm2...
call pm2 delete sql-connector >nul 2>nul

echo Starting connector under pm2 as "sql-connector"...
call pm2 start agent.js --name sql-connector --cwd "%~dp0"
if errorlevel 1 goto :pm2fail

echo Saving the pm2 process list (so it is restored after reboot)...
call pm2 save
if errorlevel 1 goto :pm2fail

echo Registering pm2 to start automatically at Windows boot...
call pm2-startup install
if errorlevel 1 goto :pm2startupfail

echo.
echo ============================================
echo   Setup complete - running as an auto-start service.
echo   Status:   service-status.bat
echo   Stop:     service-stop.bat
echo   Restart:  service-restart.bat
echo   Uninstall auto-start:  service-uninstall.bat
echo ============================================
pause
exit /b 0

:simplestart
echo.
echo Starting connector as a plain background process...
call .\start.bat

echo.
echo ============================================
echo   Setup complete - background process mode.
echo   NOTE: this will NOT restart automatically after a reboot
echo   or logoff. Re-run start.bat manually, or re-run this
echo   installer and choose option 2 for auto-start.
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

:pm2fail
echo.
echo Could not install/start pm2. This usually means no internet access,
echo or the account running this installer lacks permission to install
echo global npm packages. Falling back to background-process mode instead.
echo.
call .\start.bat
echo.
echo Started as a plain background process (will NOT survive reboot).
echo Re-run this installer later once the pm2 install issue is resolved,
echo and choose option 2 again to enable auto-start.
pause
exit /b 1

:pm2startupfail
echo.
echo pm2 is running the connector right now, but registering it to start
echo at Windows boot failed - this step usually needs an elevated
echo (Run as Administrator) command prompt. Right-click install.bat,
echo choose "Run as administrator", and run it again to finish enabling
echo auto-start. The connector is still running for this session either way.
pause
exit /b 1
