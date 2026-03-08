@echo off
cd cloud
echo Starting Tide Cloud Backend...
go run ./cmd/server/main.go
pause
