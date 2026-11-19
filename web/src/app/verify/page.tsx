"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

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
                // 1. Exchange Token for Session Metadata
                const res = await apiFetch(`/api/v1/auth/verify?token=${encodeURIComponent(token)}`);
                if (!res.ok) throw new Error("Verification failed or expired.");

                const data = await res.json().catch(() => null);
                if (!data) throw new Error("Invalid session data received");
                // Expect: { session_token, user_id, email, username, public_key }

                // 2. Store non-sensitive session metadata (vault unlock requires user PIN)
                if (data.email) sessionStorage.setItem("tide_user_email", data.email);
                if (data.user_id) sessionStorage.setItem("tide_user_id", data.user_id);
                if (data.public_key) sessionStorage.setItem("tide_user_public_key", data.public_key);

                // Signal verification status to other tabs via BroadcastChannel without exposing keys
                if (typeof BroadcastChannel !== "undefined") {
                    const channel = new BroadcastChannel("tide_auth_signal");
                    channel.postMessage({
                        status: "verified",
                        email: data.email,
                        publicKey: data.public_key,
                        userId: data.user_id,
                        timestamp: Date.now(),
                    });
                    channel.close();
                }

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
