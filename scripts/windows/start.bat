@echo off
set ROOT=%~dp0..\..

echo Starting Tide Prod Build...

:: Startet die .exe im cloud Ordner
start "Tide Backend" cmd /k "cd /d %ROOT%\cloud && tide-server.exe"

:: Startet den Prod-Server im web Ordner
start "Tide Frontend" cmd /k "cd /d %ROOT%\web && npm run start"

exit