@echo off
cd /d "%~dp0"
call pm2 restart sql-connector
echo Connector service restarted.
pause
