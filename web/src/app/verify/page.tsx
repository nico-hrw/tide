"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as cryptoLib from "@/lib/crypto";
import { apiFetch } from "@/lib/api";

const DEV_PHASE_SECRET = "DEV_PHASE_SECRET_FIXED_KEY_123";

function VerifyContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get("token");
    const [status, setStatus] = useState("verifying");

    useEffect(() => {
        if (!token) {
            setStatus("error");
            return;
        }

        const verifyLogin = async () => {
            try {
                // 1. Exchange Token for Session & Encrypted Keys
                const res = await apiFetch(`/api/v1/auth/verify?token=${token}`);
                if (!res.ok) throw new Error("Verification failed or expired.");

                const data = await res.json().catch(() => null);
                if (!data) throw new Error("Invalid session data received");
                // Expect: { session_token, enc_private_key, user_id, email, username }

                // 2. Decrypt Private Key
                const encryptedPrivateKey = JSON.parse(data.enc_private_key) as cryptoLib.EncryptedPrivateKey;
                const privateKey = await cryptoLib.decryptPrivateKey(encryptedPrivateKey, DEV_PHASE_SECRET);

                // 3. Store Session
                const exportedKey = await window.crypto.subtle.exportKey("jwk", privateKey);
                sessionStorage.setItem("tide_session_key", JSON.stringify(exportedKey));
                sessionStorage.setItem("tide_user_email", data.email);
                sessionStorage.setItem("tide_user_id", data.user_id);
                sessionStorage.setItem("tide_user_public_key", data.public_key);

                // Signal to other tabs (e.g. the original login tab)
                // We must pass the session key because sessionStorage is not shared.
                localStorage.setItem("tide_auth_signal", JSON.stringify({
                    email: data.email,
                    sessionKey: JSON.stringify(exportedKey),
                    publicKey: data.public_key,
                    userId: data.user_id,
                    timestamp: Date.now()
                }));

                setStatus("success");
                // Don'tredirect immediately, wait for user to close or redirect if they want.
                // User said: "Success... closing in shortly".
                // But actually, we want the *original* tab to redirect. 
                // This tab should just say "Success".
                // setTimeout(() => router.push("/"), 1000);

            } catch (err) {
                console.error("Verification error:", err);
                setStatus("error");
            }
        };

        verifyLogin();
    }, [token, router]);

    if (status === "error") return <div className="p-8 text-red-500">Verification Failed. Link may be expired.</div>;
    if (status === "success") return <div className="p-8 text-green-500">Success! Redirecting...</div>;

    return <div className="p-8">Verifying magic link...</div>;
}

export default function Verify() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <VerifyContent />
        </Suspense>
    );
}
