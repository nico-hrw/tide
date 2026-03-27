const crypto = require('crypto');

function arrayBufferToBase64(buffer) {
    return Buffer.from(buffer).toString('base64');
}

function base64ToArrayBuffer(base64) {
    const buf = Buffer.from(base64, 'base64');
    return new Uint8Array(buf).buffer;
}

async function run() {
    const pin = "12345";
    const saltBuffer = crypto.randomBytes(32);
    const pepperBase64 = arrayBufferToBase64(saltBuffer);

    // 1. Derive Key
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(pin),
        "PBKDF2",
        false,
        ["deriveKey"]
    );
    const kdfParams = {
        name: "PBKDF2",
        salt: base64ToArrayBuffer(pepperBase64),
        iterations: 100000,
        hash: "SHA-256"
    };
    const derivedKey = await crypto.subtle.deriveKey(
        kdfParams,
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );

    // 2. Generate RSA Key
    const rsaKeys = await crypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 4096,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256"
        },
        true,
        ["encrypt", "decrypt"]
    );
    
    // 3. Encrypt RSA Private Key
    const iv = crypto.randomBytes(12);
    const privateKeyData = await crypto.subtle.exportKey("pkcs8", rsaKeys.privateKey);
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        derivedKey,
        privateKeyData
    );

    const vault = {
        salt: arrayBufferToBase64(saltBuffer),
        iv: arrayBufferToBase64(iv),
        ciphertext: arrayBufferToBase64(ciphertext)
    };
    
    // 4. Decrypt
    const saltBuffer2 = base64ToArrayBuffer(pepperBase64);
    const keyMaterial2 = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(pin),
        "PBKDF2",
        false,
        ["deriveKey"]
    );
    const derivedKey2 = await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: saltBuffer2,
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial2,
        { name: "AES-GCM", length: 256 },
        false, // Not extractable
        ["decrypt"]
    );

    try {
      const recovered = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: base64ToArrayBuffer(vault.iv) },
          derivedKey2,
          base64ToArrayBuffer(vault.ciphertext)
      );
      console.log("DECRYPT SUCCESS!", recovered.byteLength);
    } catch(e) {
      console.log("DECRYPT FAILED!", e.message);
    }
}

run();
