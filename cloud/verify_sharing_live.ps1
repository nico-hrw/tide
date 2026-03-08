$ErrorActionPreference = "Stop"

# Use unique IDs for test
$TEST_ID = Get-Random

Function New-User ($email, $name) {
    try {
        $body = @{
            email = $email
            username = $name
            phone = "+1$TEST_ID"
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

Function Create-File ($ownerID, $name, $visibility="private") {
    $body = @{
        parent_id = $null
        type = "file"
        mime_type = "text/plain"
        size = 100
        public_meta = @{ name = $name }
        secured_meta = [System.Text.Encoding]::UTF8.GetBytes("enc_meta_blah")
        visibility = $visibility
    } | ConvertTo-Json
    
    $headers = @{ "X-User-ID" = $ownerID }
    $resp = Invoke-RestMethod -Uri "http://localhost:8080/api/v1/files" -Method Post -Body $body -ContentType "application/json" -Headers $headers
    return $resp.id
}

Function List-Files ($viewerID) {
    $headers = @{ "X-User-ID" = $viewerID }
    $resp = Invoke-RestMethod -Uri "http://localhost:8080/api/v1/files?user_id=$viewerID" -Method Get -Headers $headers
    return $resp
}

Function Share-File ($fileID, $recipientEmail) {
    $body = @{ email = $recipientEmail } | ConvertTo-Json
    Invoke-RestMethod -Uri "http://localhost:8080/api/v1/files/$fileID/share" -Method Post -Body $body -ContentType "application/json"
}

Function Set-Visibility ($fileID, $visibility) {
    $body = @{ visibility = $visibility } | ConvertTo-Json
    Invoke-RestMethod -Uri "http://localhost:8080/api/v1/files/$fileID/visibility" -Method Put -Body $body -ContentType "application/json"
}

Function Copy-File ($fileID, $newOwnerID) {
    $body = @{ new_owner_id = $newOwnerID } | ConvertTo-Json
    $headers = @{ "X-User-ID" = $newOwnerID }
    $resp = Invoke-RestMethod -Uri "http://localhost:8080/api/v1/files/$fileID/copy" -Method Post -Body $body -ContentType "application/json" -Headers $headers
    return $resp.id
}

Write-Host "--- Starting Sharing Verification (Live) ---"

try {
    # 1. Create Users
    $userA_Email = "alice_$TEST_ID@example.com"
    $userB_Email = "bob_$TEST_ID@example.com"
    $userA = New-User $userA_Email "Alice"
    $userB = New-User $userB_Email "Bob"
    Write-Host "User A: $userA"
    Write-Host "User B: $userB"

    # 2. User A creates Private File
    $fileA = Create-File $userA "Alice_Private_File" "private"
    Write-Host "File A Created: $fileA (Private)"

    # 3. User B tries to view (Should NOT see it in List)
    $filesB = List-Files $userB
    if ($filesB | Where-Object { $_.id -eq $fileA }) {
        Write-Error "FAIL: User B can see Private File A!"
    } else {
        Write-Host "PASS: User B cannot see Private File A."
    }

    # 4. User A Shares with User B
    Write-Host "User A shares File A with User B..."
    Share-File $fileA $userB_Email

    # 5. User B tries to view (Should SEE it now)
    $filesB = List-Files $userB
    if ($filesB | Where-Object { $_.id -eq $fileA }) {
        Write-Host "PASS: User B can see Shared File A."
    } else {
        Write-Error "FAIL: User B CANNOT see Shared File A!"
    }

    # 6. User B copies the file
    Write-Host "User B copies File A..."
    $copyID = Copy-File $fileA $userB
    Write-Host "Copy ID: $copyID"
    
    # 7. Verify Copy is Private and Owned by B
    $filesB_new = List-Files $userB
    $copy = $filesB_new | Where-Object { $_.id -eq $copyID }
    if ($copy -and $copy.owner_id -eq $userB -and $copy.visibility -eq "private") {
         Write-Host "PASS: Copy successful, owned by B, private."
    } else {
         Write-Error "FAIL: Copy check failed. $copy"
    }

    # 8. Test Public Visibility
    $filePublic = Create-File $userA "Alice_Public_File" "public"
    Write-Host "File Public Created: $filePublic"
    
    $publicFilesA = Invoke-RestMethod -Uri "http://localhost:8080/api/v1/files/public/$userA" -Method Get
    if ($publicFilesA | Where-Object { $_.id -eq $filePublic }) {
        Write-Host "PASS: Public File listed in Public Profile."
    } else {
        Write-Error "FAIL: Public File NOT in Public Profile."
    }

} catch {
    Write-Host "Error: $_"
    exit 1
}
