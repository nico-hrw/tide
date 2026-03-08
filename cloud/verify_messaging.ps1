$ErrorActionPreference = "Stop"
$TEST_ID = Get-Date -Format "yyyyMMddHHmmssffff"

Function New-User ($email, $name, $phoneSuffix) {
    try {
        $body = @{
            email = $email
            username = $name
            phone = "+1${TEST_ID}${phoneSuffix}"
            public_key = "pk_$name"
            enc_private_key = "ek_$name"
        } | ConvertTo-Json
        $resp = Invoke-RestMethod -Uri "http://localhost:8080/api/v1/auth/register" -Method Post -Body $body -ContentType "application/json"
        return $resp.id
    } catch {
        Write-Host "Register Failed for $email : $_"
        return $null
    }
}

Function Send-Message ($senderID, $recipientEmail, $content) {
    $body = @{
        recipient_email = $recipientEmail
        content = $content
    } | ConvertTo-Json
    $headers = @{ "X-User-ID" = $senderID }
    Invoke-RestMethod -Uri "http://localhost:8080/api/v1/messages" -Method Post -Body $body -ContentType "application/json" -Headers $headers
}

Function Get-Messages ($senderID, $partnerEmail) {
    $headers = @{ "X-User-ID" = $senderID }
    $uri = "http://localhost:8080/api/v1/messages?partner_email=$partnerEmail"
    Invoke-RestMethod -Uri $uri -Method Get -Headers $headers
}

Write-Host "--- Starting Messaging Verification (Unique Phones) ---"

try {
    # 1. Create Users
    $nicoEmail = "nico_$TEST_ID@mail.com"
    $halloEmail = "hallo_$TEST_ID@mail.com"
    
    $nicoID = New-User $nicoEmail "Nico_$TEST_ID" "1"
    $halloID = New-User $halloEmail "Hallo_$TEST_ID" "2"
    
    if (-not $nicoID -or -not $halloID) {
        Write-Error "Failed to create users. Exiting."
    }

    Write-Host "Nico ID: $nicoID"
    Write-Host "Hallo ID: $halloID"

    # 2. Nico sends message to Hallo
    Write-Host "Nico sends message to Hallo..."
    Send-Message $nicoID $halloEmail "Hello form Nico"

    # 3. Hallo checks messages from Nico
    Write-Host "Hallo checks messages from Nico..."
    $msgs = Get-Messages $halloID $nicoEmail
    
    if ($msgs.Count -gt 0 -and $msgs[0].content -eq "Hello form Nico") {
        Write-Host "PASS: Message received."
    } else {
        Write-Error "FAIL: Message NOT received. $msgs"
    }

} catch {
    Write-Host "Error: $_"
    exit 1
}
