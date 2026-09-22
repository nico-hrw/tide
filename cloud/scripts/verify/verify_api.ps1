$ErrorActionPreference = "Stop"

Write-Host "Starting Server..."
$proc = Start-Process -FilePath ".\server.exe" -PassThru
Start-Sleep -Seconds 2

try {
    Write-Host "--- 1. Register User ---"
    $registerBody = @{
        email = "test@example.com"
        public_key = "dummy-pub-key"
        enc_private_key = "dummy-priv-key"
    } | ConvertTo-Json
    $regResp = Invoke-RestMethod -Uri "http://localhost:8080/api/v1/auth/register" -Method Post -Body $registerBody -ContentType "application/json"
    Write-Host "Registered User ID: $($regResp.id)"

    Write-Host "--- 2. Login User ---"
    $loginBody = @{
        email = "test@example.com"
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "http://localhost:8080/api/v1/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    Write-Host "Login initiated. Check server logs for Magic Link."

    # In a real test we'd parse the token from logs, but here we can just verify the file API works without auth for now (as per MVP implementation)
    
    Write-Host "--- 3. Create File Meta ---"
    $fileBody = @{
        parent_id = $null
        type = "note"
        size = 100
        public_meta = @{ title = "My Note" }
        secured_meta = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("ENCRYPTED_DATA_BYTES"))
    } | ConvertTo-Json

    # Simulate Auth Header
    $headers = @{ "X-User-ID" = $regResp.id }
    
    $fileResp = Invoke-RestMethod -Uri "http://localhost:8080/api/v1/files" -Method Post -Body $fileBody -ContentType "application/json" -Headers $headers
    Write-Host "Created File ID: $($fileResp.id)"

    Write-Host "--- 4. Upload Blob ---"
    $blobContent = "Hello World Content"
    Invoke-RestMethod -Uri "http://localhost:8080/api/v1/files/$($fileResp.id)/blob" -Method Put -Body $blobContent -ContentType "text/plain" -Headers $headers
    Write-Host "Blob Uploaded"

    Write-Host "--- 5. Download Blob ---"
    $downloaded = Invoke-RestMethod -Uri "http://localhost:8080/api/v1/files/$($fileResp.id)/blob" -Method Get -Headers $headers
    if ($downloaded -eq $blobContent) {
        Write-Host "Blob content matches! ✅"
    } else {
        Write-Host "Blob content mismatch! ❌"
        exit 1
    }

} finally {
    Stop-Process -Id $proc.Id -Force
}
