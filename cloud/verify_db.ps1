$ErrorActionPreference = "Stop"

# Cleanup previous DB to ensure fresh start
if (Test-Path "data/tide.db") {
    Remove-Item "data/tide.db" -Force
    Write-Host "Cleaned up old DB"
}

Write-Host "Starting Server..."
$proc = Start-Process -FilePath ".\server.exe" -PassThru
Start-Sleep -Seconds 3

try {
    Write-Host "--- 1. Register User (with new fields) ---"
    $registerBody = @{
        email = "secure@example.com"
        username = "nicoh"
        phone = "+1234567890"
        public_key = "dummy-pub-key"
        enc_private_key = "dummy-master-key-encrypted"
    } | ConvertTo-Json
    $regResp = Invoke-RestMethod -Uri "http://localhost:8080/api/v1/auth/register" -Method Post -Body $registerBody -ContentType "application/json"
    Write-Host "Registered User ID: $($regResp.id)"

    Write-Host "--- 2. Login User (Blind Index Lookup) ---"
    $loginBody = @{
        email = "secure@example.com"
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "http://localhost:8080/api/v1/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    Write-Host "Login initiated. Check server logs for Magic Link."

    # NOTE: We can't easily inspect the DB file content from here without sqlite3 CLI, 
    # but successful login proves the Blind Index worked because Login() performs `GetUserByEmailHash`.

    Write-Host "--- 3. Verify Persistence (Restart Server) ---"
    Stop-Process -Id $proc.Id -Force
    Start-Sleep -Seconds 1
    
    Write-Host "Restarting Server..."
    $proc = Start-Process -FilePath ".\server.exe" -PassThru
    Start-Sleep -Seconds 3

    Write-Host "--- 4. Login Again (Persistence Check) ---"
    Invoke-RestMethod -Uri "http://localhost:8080/api/v1/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    Write-Host "Login successful after restart! Persistence working. ✅"

} catch {
    Write-Host "Error: $_"
    exit 1
} finally {
    if ($proc -and !$proc.HasExited) {
        Stop-Process -Id $proc.Id -Force
    }
}
