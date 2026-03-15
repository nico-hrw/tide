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

    // Step 1: Check Identifier / Start Flow
    // In real flow, we don't know if user exists until we try to login or register.
    // But for UI, we might blindly assume "Register" if they type a name, or "Login" if they don't?
    // Let's ask the user "Login or Register" or try Login first.
    // Logic: 
    // 1. User enters Email. Click Continue.
    // 2. We Try `POST /login`. 
    //    - If 200 OK -> It was a login. Show "Magic link sent".
    //    - If 401/404 -> User not found. Switch to Register mode.
    const handleIdentifierSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!identifier) return;

        setStatus("checking");
        // Clear stale tokens before starting new login attempt
        sessionStorage.removeItem("tide_session_token");
        localStorage.removeItem("tide_session_token");

        try {
            // Try Step 1: Check if user exists
            const res = await apiFetch("/api/v1/auth/login/step1", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: identifier })
            });

            if (res.ok) {
                // User exists -> Proceed to PIN Step
                setIsLoginMode(true);
                setStep("pin");
                setStatus("idle");
            } else if (res.status === 404) {
                // User not found -> Register Flow (Ask for Name & PIN)
                setIsLoginMode(false);
                setStep("details");
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

    // Step 2: Verify 5-digit PIN
    const handlePinSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pin.length !== 5) return;

        setStatus("checking");

        try {
            const res = await apiFetch("/api/v1/auth/login/step2", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: identifier, pin })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.login_code) {
                    // Simulation: Notification alert
                    alert(`SIMULATED NOTIFICATION: Your Login-Code is: ${data.login_code}`);
                }

                setStep("code");
                setStatus("idle");
            } else {
                const errorData = await res.text();
                alert("Invalid PIN: " + errorData);
                setStatus("idle");
            }
        } catch (err) {
            console.error(err);
            setStatus("error");
            alert("Verification failed");
        }
    };

    // Step 3: Verify Alphanumeric Login-Code
    const handleCodeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!loginCode) return;

        setStatus("processing");

        try {
            const res = await apiFetch("/api/v1/auth/login/step3", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: identifier, code: loginCode })
            });

            if (res.ok) {
                const contentType = res.headers.get("content-type");
                if (!contentType || !contentType.includes("application/json")) {
                    const text = await res.text();
                    console.error("Step 3 non-JSON response:", text);
                    throw new Error("Invalid server response format");
                }
                const signal = await res.json();
                if (signal.session_token && signal.email) {
                    // Decrypt the Master Private Key using the DEV_PHASE_SECRET
                    try {
                        const encryptedData = typeof signal.enc_private_key === 'string'
                            ? JSON.parse(signal.enc_private_key)
                            : signal.enc_private_key;

                        const decryptedKey = await cryptoLib.decryptPrivateKey(encryptedData, DEV_PHASE_SECRET);

                        const exportedKey = await window.crypto.subtle.exportKey("jwk", decryptedKey);
                        sessionStorage.setItem("tide_session_key", JSON.stringify(exportedKey));
                    } catch (e) {
                        console.error("Failed to decrypt private key. Using raw (might fail on dashboard):", e);
                        // Fallback, though likely to fail in dashboard
                        sessionStorage.setItem("tide_session_key", typeof signal.enc_private_key === 'string' ? signal.enc_private_key : JSON.stringify(signal.enc_private_key));
                    }

                    sessionStorage.setItem("tide_user_email", signal.email);
                    sessionStorage.setItem("tide_user_id", signal.user_id);
                    sessionStorage.setItem("tide_user_public_key", signal.public_key);
                    sessionStorage.setItem("tide_session_token", signal.session_token);
                    
                    // Also persist for session restore
                    localStorage.setItem("tide_user_email", signal.email);
                    localStorage.setItem("tide_user_id", signal.user_id);
                    localStorage.setItem("tide_session_token", signal.session_token);

                    setStatus("success");
                    router.push("/");
                }
            } else {
                alert("Invalid Code");
                setStatus("idle");
            }
        } catch (err) {
            console.error(err);
            setStatus("error");
            alert("Login failed");
        }
    };

    // Step 2: Finalize Auth (Register Only)
    // If Login, we already sent magic link in Step 1.
    const handleFinalSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isLoginMode) return; // Should not happen

        setStatus("processing");

        try {
            // --- REGISTER FLOW ---
            if (!name || pin.length !== 5) {
                alert("Please enter your Name and a 5-digit PIN.");
                setStatus("idle");
                return;
            }

            // Generate Keys
            const masterKeys = await cryptoLib.generateMasterKeys();

            // Encrypt with DEV SECRET
            const salt = window.crypto.getRandomValues(new Uint8Array(16));
            const derivedKey = await cryptoLib.deriveKeyFromPassword(DEV_PHASE_SECRET, salt.buffer);

            const encryptedPrivateKey = await cryptoLib.encryptPrivateKey(
                masterKeys.privateKey,
                derivedKey,
                salt.buffer
            );

            const publicKeySpki = await cryptoLib.exportPublicKey(masterKeys.publicKey);

            // Payload
            const payload = {
                email: identifier,
                username: name,
                phone: "000000000", // MVP Placeholder
                public_key: publicKeySpki,
                enc_private_key: JSON.stringify(encryptedPrivateKey),
                pin: pin
            };

            const res = await apiFetch("/api/v1/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errorMsg = await res.text();
                throw new Error(errorMsg || "Registration failed");
            }

            const data = await res.json();
            const userId = data.id;
            const sessionToken = data.session_token;

            // Auto-Login Session
            const exportedKey = await window.crypto.subtle.exportKey("jwk", masterKeys.privateKey);
            sessionStorage.setItem("tide_session_key", JSON.stringify(exportedKey));
            sessionStorage.setItem("tide_user_email", identifier);
            sessionStorage.setItem("tide_user_id", userId);
            
            if (data.session_token) {
                sessionStorage.setItem("tide_session_token", data.session_token);
                localStorage.setItem("tide_session_token", data.session_token);
            }

            // Store Public Key for Dashboard usage
            // The dashboard expects `tide_user_{email}` in localStorage to find public key?
            // Yes, `dashboard/page.tsx` reads it. We must polyfill this behavior for now.
            // Ideally should fetch from API, but let's persist local compatibility.
            const userRecord = {
                id: userId,
                name: name,
                public_key: publicKeySpki,
                email: identifier
            };
            localStorage.setItem("tide_user_" + identifier, JSON.stringify(userRecord));
            localStorage.setItem("tide_user_email", identifier);
            localStorage.setItem("tide_user_id", userId);

            router.push("/");

        } catch (err) {
            console.error(err);
            setStatus("error");
            alert("Registration failed: " + (err as Error).message);
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
                        disabled={status === 'checking'}
                        className="px-8 py-4 glass-pill-blue font-bold text-gray-800 tracking-wide text-lg w-full flex items-center justify-center mt-4"
                    >
                        {status === 'checking' ? 'Checking...' : 'Continue'}
                    </button>
                </form>
            )}

            {step === "pin" && (
                <form onSubmit={handlePinSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '320px' }}>
                    <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                        <h3>Enter your PIN</h3>
                        <p className="text-sm text-muted-foreground">Please enter your 5-digit security PIN.</p>
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
                        disabled={status === 'checking' || pin.length !== 5}
                        className="px-8 py-4 glass-pill-blue font-bold text-gray-800 tracking-wide text-lg w-full flex items-center justify-center mt-4"
                    >
                        {status === 'checking' ? 'Verifying...' : 'Verify PIN'}
                    </button>
                    <button type="button" onClick={() => setStep("identifier")} className="text-sm underline">Back</button>
                </form>
            )}

            {step === "code" && (
                <form onSubmit={handleCodeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '320px' }}>
                    <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                        <h3>Login-Code</h3>
                        <p className="text-sm text-muted-foreground">Enter the alphanumeric code from your notification.</p>
                    </div>
                    <div>
                        <input
                            type="text"
                            placeholder="A1B2C3"
                            value={loginCode}
                            autoFocus
                            onChange={e => setLoginCode(e.target.value.toUpperCase())}
                            required
                            style={{
                                width: '100%', padding: '1rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
                                textAlign: 'center', fontSize: '1.5rem', fontWeight: 'bold'
                            }}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={status === 'processing' || !loginCode}
                        className="px-8 py-4 glass-pill-pink font-bold text-gray-800 tracking-wide text-lg w-full flex items-center justify-center mt-4"
                    >
                        {status === 'processing' ? 'Logging in...' : 'Login'}
                    </button>
                    <button type="button" onClick={() => setStep("pin")} className="text-sm underline">Back to PIN</button>
                </form>
            )}

            {step === "details" && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '320px' }}>
                    <form onSubmit={handleFinalSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ padding: '0.75rem', background: 'hsl(var(--secondary))', borderRadius: 'var(--radius)', fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>{identifier}</span>
                            <button type="button" onClick={() => setStep("identifier")} style={{ fontSize: '0.8rem', color: 'hsl(var(--primary))', textDecoration: 'underline' }}>Change</button>
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
                </div>
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
