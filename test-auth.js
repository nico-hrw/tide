const crypto = require('crypto');

async function testAuthFlow() {
  const email = `test-${Date.now()}@tide.com`;
  const pin = "11111";

  const pepperBuffer = crypto.randomBytes(32);
  const pepperBase64 = pepperBuffer.toString('base64');
  console.log("Client Pepper (Base64):", pepperBase64);

  // 1. Register
  console.log("--- 1. Register ---");
  const regRes = await fetch("http://localhost:8080/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      username: `Test User ${Date.now()}`,
      phone: `${Date.now()}`,
      public_key: "dummypk",
      encrypted_vault: "dummyvault",
      pepper: pepperBase64,
      pin: pin
    })
  });
  console.log("Register Status:", regRes.status);
  
  // 2. Request OTP
  console.log("--- 2. Request OTP ---");
  const reqOtpRes = await fetch("http://localhost:8080/api/v1/auth/request-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  const otpData = await reqOtpRes.json();
  console.log("OTP Request Response:", otpData);

  // 3. Verify OTP
  console.log("--- 3. Verify OTP ---");
  const verifyRes = await fetch("http://localhost:8080/api/v1/auth/verify-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email, otp: otpData.otp })
  });
  
  console.log("Verify OTP Status:", verifyRes.status);
  const verifyText = await verifyRes.text();
  console.log("Response Body (Text):", verifyText);

  try {
    const verifyData = JSON.parse(verifyText);
    console.log("Client Pepper :\n", pepperBase64);
    console.log("Server Pepper :\n", verifyData.pepper);
    console.log("Decrypted pepper matches client pepper?", verifyData.pepper === pepperBase64);
  } catch (e) {
    console.log("Could not parse as JSON", e.message);
  }
}

testAuthFlow().catch(console.error);
