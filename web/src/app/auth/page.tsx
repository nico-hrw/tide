"use client";

import { useState, Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import * as cryptoLib from "@/lib/crypto";
import { apiFetch } from "@/lib/api";

// CONSTANTS
const DEV_PHASE_SECRET = "DEV_PHASE_SECRET_FIXED_KEY_123";

function AuthContent() {
    const router = useRouter();

    // State
    const [step, setStep] = useState<"identifier" | "pin" | "code" | "details">("identifier");
    const [identifier, setIdentifier] = useState("");
    const [pin, setPin] = useState(""); // 5-digit PIN
    const [loginCode, setLoginCode] = useState(""); // Alphanumeric secondary code
    const [name, setName] = useState("");
    const [isLoginMode, setIsLoginMode] = useState(false);
    const [status, setStatus] = useState("idle"); // idle, checking, processing, success, error
    const [loginData, setLoginData] = useState<any>(null); // Store pepper and vault

    // Listen for Magic Link success in another tab
    useEffect(() => {
        const handleStorage = (e: StorageEvent) => {
            if (e.key === "tide_auth_signal") {
                console.log("Auth signal received!", e.newValue);
                // The verify tab sets "tide_session_key" in sessionStorage ONLY for itself.
                // WE (this tab) do not have the session key yet because sessionStorage is per-tab.
                // FIX: Verify page must put the session key in localStorage (encrypted/temp) 
                // OR we just redirect to dashboard? 
                // If we redirect to dashboard, AuthGuard checks sessionStorage. It will be empty!

                // SO: Verify page must share the key via localStorage.
                // Let's go back and fix Verify page to put key in localStorage briefly?
                // OR, since `tide_auth_signal` is in localStorage, we can put the key IN the signal?
                // Yes.

                try {
                    const signal = JSON.parse(e.newValue || "{}");
                    if (signal.sessionKey && signal.email) {
                        sessionStorage.setItem("tide_session_key", signal.sessionKey);
                        sessionStorage.setItem("tide_user_email", signal.email);
                        if (signal.publicKey) {
                            sessionStorage.setItem("tide_user_public_key", signal.publicKey);
                        }
                        if (signal.userId) {
                            sessionStorage.setItem("tide_user_id", signal.userId);
                        }
                        router.push("/");
                    }
                } catch (e) { console.error(e); }
            }
        };
        window.addEventListener("storage", handleStorage);
        return () => window.removeEventListener("storage", handleStorage);
    }, [router]);

    // Step 1: Identifier (Email)
    const handleIdentifierSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!identifier) return;

        setStatus("processing");
        sessionStorage.clear();
        localStorage.removeItem("tide_session_token");

        try {
            const res = await apiFetch("/api/v1/auth/request-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: identifier })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.otp) alert(`Your Login Code: ${data.otp}`);
                
                if (data.user_exists) {
                    // User exists -> Proceed to OTP Step
                    setIsLoginMode(true);
                    setStep("code"); // OTP code
                } else {
                    // User not found -> Register Flow
                    setIsLoginMode(false);
                    setStep("details");
                }
                setStatus("idle");
            } else {
                throw new Error("Server error");
            }
        } catch (err) {
            console.error(err);
            setStatus("error");
            alert("Connection failed");
        }
    };

    // Step 2 Login: Verify OTP
    const handleCodeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!loginCode) return;

        setStatus("processing");

        try {
            const res = await apiFetch("/api/v1/auth/verify-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: identifier, otp: loginCode })
            });

            if (res.ok) {
                const data = await res.json();
                // We got the JWT in httpOnly cookie automatically!
                // We also got the pepper, encrypted_vault, user_id, public_key
                setLoginData(data);
                setStep("pin");
                setStatus("idle");
            } else {
                alert("Invalid OTP");
                setStatus("idle");
            }
        } catch (err) {
            console.error(err);
            setStatus("error");
            alert("Verification failed");
        }
    };

    // Step 3 Login: PIN Unlock
    const handlePinSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pin.length !== 5 || !loginData) return;

        setStatus("processing");

        try {
            const decryptedKey = await cryptoLib.unlockVault(
                pin,
                loginData.pepper,
                typeof loginData.encrypted_vault === 'string' ? JSON.parse(loginData.encrypted_vault) : loginData.encrypted_vault
            );

            // Export to JWK to persist in sessionStorage for reloads
            const exportedKey = await window.crypto.subtle.exportKey("jwk", decryptedKey);
            sessionStorage.setItem("tide_session_key", JSON.stringify(exportedKey));
            
            sessionStorage.setItem("tide_user_email", identifier);
            sessionStorage.setItem("tide_user_id", loginData.user_id);
            if (loginData.username) {
                sessionStorage.setItem("tide_user_name", loginData.username);
                // Also update local record for persistent sessions/fallback
                const localRec = JSON.parse(localStorage.getItem("tide_user_" + identifier) || "{}");
                localStorage.setItem("tide_user_" + identifier, JSON.stringify({ ...localRec, username: loginData.username }));
            }
            sessionStorage.setItem("tide_user_public_key", loginData.public_key);
            if (loginData.token) {
                sessionStorage.setItem("tide_session_token", loginData.token);
            }

            setStatus("success");
            router.push("/");
        } catch (err: any) {
            console.error("Failed to decrypt vault:", err);
            alert(`Incorrect PIN (System Error: ${err.name || err.message || JSON.stringify(err)})`);
            setStatus("idle");
        }
    };

    // Step 2 Register: Finalize Auth
    const handleFinalSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isLoginMode) return;

        setStatus("processing");

        try {
            if (!name || pin.length !== 5) {
                alert("Please enter your Name and a 5-digit PIN.");
                setStatus("idle");
                return;
            }

            // Generate Client Pepper
            const pepperBuffer = new Uint8Array(32);
            window.crypto.getRandomValues(pepperBuffer);
            const pepperBase64 = cryptoLib.arrayBufferToBase64(pepperBuffer.buffer);

            // Generate Vault
            const { masterKeys, encryptedVault } = await cryptoLib.generateUserVault(pin, pepperBase64);
            const publicKeySpki = await cryptoLib.exportPublicKey(masterKeys.publicKey);

            // Sanity Check Decrypt (Verifies local WebCrypto integrity before sending)
            try {
                console.log("[SANITY CHECK] Testing local vault decryption...");
                await cryptoLib.unlockVault(pin, pepperBase64, encryptedVault);
                console.log("[SANITY CHECK] Passed. Vault is healthy.");
            } catch (sanityErr: any) {
                console.error("[SANITY CHECK FAILED]", sanityErr);
                alert(`CRITICAL ERROR: Browser failed to decrypt the vault it just generated. Error: ${sanityErr.name || sanityErr.message}`);
                setStatus("idle");
                return;
            }

            // Payload
            const payload = {
                email: identifier,
                username: name,
                phone: "000000000",
                public_key: publicKeySpki,
                encrypted_vault: JSON.stringify(encryptedVault),
                pepper: pepperBase64,
                pin: pin
            };

            const res = await apiFetch("/api/v1/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                alert("Account created! Please log in with your new PIN.");
                setStep("identifier");
                setStatus("idle");
                setPin("");
            } else {
                const errText = await res.text();
                alert("Registration failed: " + errText);
                setStatus("idle");
            }
        } catch (err) {
            console.error(err);
            setStatus("error");
            alert("Registration failed");
        }
    };

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh',
            gap: '2rem'
        }}>
            <div style={{ textAlign: 'center' }}>
                <h1>Welcome to Tide</h1>
                <p style={{ color: 'gray' }}>Minimalist. Local-First. Encrypted.</p>
            </div>

            {step === "identifier" && (
                <form onSubmit={handleIdentifierSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '320px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 'bold' }}>Email</label>
                        <input
                            type="email"
                            placeholder="name@example.com"
                            value={identifier}
                            autoFocus
                            onChange={e => setIdentifier(e.target.value)}
                            required
                            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={status === 'processing'}
                        className="px-8 py-4 glass-pill-blue font-bold text-gray-800 tracking-wide text-lg w-full flex items-center justify-center mt-4"
                    >
                        {status === 'processing' ? 'Processing...' : 'Continue'}
                    </button>
                </form>
            )}

            {step === "code" && (
                <form onSubmit={handleCodeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '320px' }}>
                    <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                        <h3>Login-Code</h3>
                        <p className="text-sm text-gray-500">Enter the 6-digit OTP from your email.</p>
                    </div>
                    <div>
                        <input
                            type="text"
                            placeholder="123456"
                            maxLength={6}
                            value={loginCode}
                            autoFocus
                            onChange={e => setLoginCode(e.target.value)}
                            required
                            style={{
                                width: '100%', padding: '1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
                                textAlign: 'center', fontSize: '1.5rem', fontWeight: 'bold'
                            }}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={status === 'processing' || loginCode.length !== 6}
                        className="px-8 py-4 glass-pill-pink font-bold text-gray-800 tracking-wide text-lg w-full flex items-center justify-center mt-4"
                    >
                        {status === 'processing' ? 'Verifying...' : 'Verify OTP'}
                    </button>
                    <button type="button" onClick={() => setStep("identifier")} className="text-sm underline text-center">Back</button>
                </form>
            )}

            {step === "pin" && (
                <form onSubmit={handlePinSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '320px' }}>
                    <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                        <h3>Verify PIN</h3>
                        <p className="text-sm text-gray-500">Enter your 5-digit PIN to unlock your vault.</p>
                    </div>
                    <div>
                        <input
                            type="password"
                            placeholder="00000"
                            maxLength={5}
                            value={pin}
                            autoFocus
                            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                            required
                            style={{
                                width: '100%', padding: '1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
                                textAlign: 'center', fontSize: '2rem', letterSpacing: '1rem'
                            }}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={status === 'processing' || pin.length !== 5}
                        className="px-8 py-4 glass-pill-blue font-bold text-gray-800 tracking-wide text-lg w-full flex items-center justify-center mt-4"
                    >
                        {status === 'processing' ? 'Unlocking...' : 'Unlock Vault'}
                    </button>
                    <button type="button" onClick={() => setStep("code")} className="text-sm underline text-center">Back</button>
                </form>
            )}

            {step === "details" && (
                <form onSubmit={handleFinalSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '320px' }}>
                    <div style={{ padding: '0.75rem', background: '#3c3c3a', borderRadius: 'var(--radius)', fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{identifier}</span>
                        <button type="button" onClick={() => setStep("identifier")} className="text-sm underline text-blue-400">Change</button>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 'bold' }}>Your Name</label>
                        <input
                            type="text"
                            placeholder="Jane Doe"
                            value={name}
                            autoFocus
                            onChange={e => setName(e.target.value)}
                            required
                            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 'bold' }}>Create 5-digit PIN</label>
                        <input
                            type="password"
                            placeholder="00000"
                            maxLength={5}
                            value={pin}
                            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                            required
                            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', textAlign: 'center', fontSize: '1.2rem', letterSpacing: '0.5rem' }}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={status === 'processing'}
                        className="px-8 py-4 glass-pill-pink font-bold text-gray-800 tracking-wide text-lg w-full flex items-center justify-center mt-4"
                    >
                        {status === 'processing' ? 'Creating Account...' : 'Start using Tide'}
                    </button>
                </form>
            )}
        </div>
    );
}

export default function Auth() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <AuthContent />
        </Suspense>
    );
}
