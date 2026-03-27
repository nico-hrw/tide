@echo off
:: %~dp0 ist der Pfad zum aktuellen Skript-Ordner. 
:: Mit ..\.. gehen wir zwei Ordner hoch ins Hauptverzeichnis.
set ROOT=%~dp0..\..

echo Starting Tide Development Environment...

:: Startet Backend
start "Tide Backend" cmd /k "cd /d %ROOT%\cloud && go run ./cmd/server/main.go"

:: Startet Frontend
start "Tide Frontend" cmd /k "cd /d %ROOT%\web && npm run dev"

exit