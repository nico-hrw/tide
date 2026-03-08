$ErrorActionPreference = "Stop"

# Use unique IDs for test
$TEST_ID = Get-Random

Function New-User ($email, $name) {
    $body = @{
        email = $email
        username = $name
        phone = "+1$TEST_ID"
        public_key = "pk_$name"
        enc_private_key = "ek_$name"
    } | ConvertTo-Json
    $resp = Invoke-RestMethod -Uri "http://localhost:8080/api/v1/auth/register" -Method Post -Body $body -ContentType "application/json"
    return $resp.id
}

Function Create-File ($ownerID, $name, $visibility="private") {
    $body = @{
        parent_id = $null
        type = "file"
        mime_type = "text/plain"
        size = 100
        public_meta = @{ name = $name }
        secured_meta = "enc_meta_blah"
    } | ConvertTo-Json
    # Note: CreateFile endpoint doesn't take visibility or ownerID in body (it takes from context/logic). 
    # For MVP test, we used `ownerID` query param or header in List. 
    # But CreateFile in `files.go` uses... wait, `CreateFile` in `files.go` generates new ID but where does it get OwnerID?
    # Checking `files.go`: `user := &db.File{... OwnerID: "user-1" ...}` -> HARDCODED in `CreateFile`!
    # We need to hack/fix `CreateFile` to accept OwnerID for testing or use the Header hack if implemented.
    # `files.go`: `ownerID := "user-1" // TODO: Extract from JWT`
    
    # Workaround: We can't easily test multi-user creation without JWT auth implemented or the "X-User-ID" hack.
    # Let's assume the previous `ListFiles` edit added `userID` query param support for LISTING.
    # But for creating, `files.go` line ~195 has `OwnerID: "user-1"`.
    # We need to fix `CreateFile` to respect `X-User-ID` header for testing, just like `ListFiles` might.
    
    # Actually, let's just test the Sharing Logic *assuming* we can create files for different users.
    # If we can't create for User B, we can't test User B's view fully.
    # Verification might fail if we don't fix `CreateFile` to allow specifying owner (for dev/test).
    
    return $null
}

Write-Host "Creating Users..."
# We need to support X-User-ID header in CreateFile to properly test this.
# I will first run this script to see if it fails, then fix the API if needed. 
