"use client";

import { useState, Suspense, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import * as cryptoLib from "@/lib/crypto";
import { apiFetch } from "@/lib/api";
import { storeMasterKey, purgeLegacyKeys, getMasterKey } from "@/lib/keyStorage";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SAMPLE_EMAILS = [
    "max.mustermann@tum.de",
    "sophie.schmidt@lmu.de",
    "lukas.weber@rwth-aachen.de",
    "elena.bauer@fu-berlin.de",
    "jonas.becker@uni-heidelberg.de",
    "anna.meyer@kit.edu",
    "felix.fischer@uni-koeln.de",
    "laura.wagner@uni-hamburg.de",
    "tim.hoffmann@uni-bonn.de",
    "marie.schulz@hu-berlin.de",
    "david.koch@uni-freiburg.de",
    "sara.richter@uni-tuebingen.de",
    "moritz.wolf@uni-goettingen.de",
    "lea.schneider@uni-stuttgart.de",
    "jan.krause@tu-darmstadt.de",
];

function useTypewriterPlaceholder(
    emails: string[],
    enabled: boolean,
    typingSpeed = 70,
    deletingSpeed = 35,
    pauseDuration = 1800
) {
    const [placeholderText, setPlaceholderText] = useState("");

    useEffect(() => {
        if (!enabled || emails.length === 0) {
            setPlaceholderText("");
            return;
        }

        let isMounted = true;
        let emailIndex = 0;
        let charIndex = 0;
        let isDeleting = false;
        let timeoutId: ReturnType<typeof setTimeout>;

        const tick = () => {
            if (!isMounted) return;

            const currentEmail = emails[emailIndex % emails.length];

            if (!isDeleting) {
                charIndex++;
                setPlaceholderText(currentEmail.slice(0, charIndex));

                if (charIndex >= currentEmail.length) {
                    isDeleting = true;
                    timeoutId = setTimeout(tick, pauseDuration);
                    return;
                }
                timeoutId = setTimeout(tick, typingSpeed);
            } else {
                charIndex--;
                setPlaceholderText(currentEmail.slice(0, charIndex));

                if (charIndex <= 0) {
                    isDeleting = false;
                    charIndex = 0;
                    emailIndex = (emailIndex + 1) % emails.length;
                    timeoutId = setTimeout(tick, typingSpeed);
                    return;
                }
                timeoutId = setTimeout(tick, deletingSpeed);
            }
        };

        timeoutId = setTimeout(tick, typingSpeed);

        return () => {
            isMounted = false;
            clearTimeout(timeoutId);
        };
    }, [enabled, emails, typingSpeed, deletingSpeed, pauseDuration]);

    return placeholderText;
}

interface LoginResponseData {
    user_id: string;
    email?: string;
    username?: string;
    public_key: string;
    encrypted_vault: string | object;
    pepper: string;
    token?: string;
    [key: string]: unknown;
}

interface SegmentedDigitInputProps {
    length: number;
    digits: string[];
    onChange: (digits: string[]) => void;
    type?: "text" | "password";
    allowedChars?: "alphanumeric" | "numeric";
    hasError?: boolean;
    autoComplete?: string;
    inputClassName?: string;
    gapClassName?: string;
    autoFocusFirst?: boolean;
}

function SegmentedDigitInput({
    length,
    digits,
    onChange,
    type = "text",
    allowedChars = "numeric",
    hasError = false,
    autoComplete = "off",
    inputClassName = "w-9 sm:w-11 h-12 sm:h-14 text-xl sm:text-2xl font-light text-center pb-2",
    gapClassName = "gap-1.5 sm:gap-2.5",
    autoFocusFirst = false,
}: SegmentedDigitInputProps) {
    const refs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        if (autoFocusFirst) {
            const timer = setTimeout(() => refs.current[0]?.focus(), 60);
            return () => clearTimeout(timer);
        }
    }, [autoFocusFirst]);

    const sanitize = (val: string) => {
        if (allowedChars === "alphanumeric") {
            return val.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
        }
        return val.replace(/\D/g, "");
    };

    const handleChange = (i: number, val: string) => {
        const cl = sanitize(val);
        if (!cl) {
            const n = [...digits]; n[i] = ""; onChange(n);
            return;
        }
        if (cl.length > 1) {
            const pasted = cl.slice(0, length).split("");
            const n = Array(length).fill("");
            pasted.forEach((ch, idx) => { n[idx] = ch; });
            onChange(n);
            refs.current[Math.min(pasted.length, length - 1)]?.focus();
            return;
        }
        const n = [...digits]; n[i] = cl; onChange(n);
        if (i < length - 1) refs.current[i + 1]?.focus();
    };

    const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Backspace" && !digits[i] && i > 0) {
            e.preventDefault();
            const n = [...digits]; n[i - 1] = ""; onChange(n);
            refs.current[i - 1]?.focus();
        } else if (e.key === "ArrowLeft" && i > 0) {
            e.preventDefault(); refs.current[i - 1]?.focus();
        } else if (e.key === "ArrowRight" && i < length - 1) {
            e.preventDefault(); refs.current[i + 1]?.focus();
        }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const p = sanitize(e.clipboardData.getData("text")).slice(0, length);
        if (!p) return;
        const n = Array(length).fill("");
        p.split("").forEach((c, idx) => { n[idx] = c; });
        onChange(n);
        refs.current[Math.min(p.length, length - 1)]?.focus();
    };

    return (
        <div className={`flex items-center ${gapClassName}`}>
            {digits.map((digit, i) => (
                <input
                    key={i}
                    ref={(el) => { refs.current[i] = el; }}
                    type={type}
                    inputMode={allowedChars === "alphanumeric" ? "text" : "numeric"}
                    pattern={allowedChars === "alphanumeric" ? undefined : "[0-9]*"}
                    autoCapitalize={allowedChars === "alphanumeric" ? "characters" : undefined}
                    autoComplete={autoComplete}
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onPaste={handlePaste}
                    className={`${inputClassName} rounded-none bg-transparent border-0 border-b-2 ${
                        hasError ? "border-b-red-500 text-red-900" : "border-b-gray-300 text-gray-900 focus:border-b-gray-900"
                    } focus:outline-none transition-colors duration-200`}
                />
            ))}
        </div>
    );
}

function ActionButton({ loading, disabled, label }: { loading: boolean; disabled: boolean; label: string }) {
    return (
        <button
            type="submit"
            disabled={disabled}
            className="group flex items-center text-gray-900 text-lg tracking-wide hover:text-gray-600 transition-colors duration-300 focus:outline-none disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
        >
            <span className="font-medium mr-4">{label}</span>
            {loading ? (
                <Loader2 className="w-6 h-6 animate-spin text-gray-600" />
            ) : (
                <svg
                    className="w-6 h-6 transform transition-transform duration-300 group-hover:translate-x-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
            )}
        </button>
    );
}

function AuthContent() {
    const router = useRouter();

    const [step, setStep] = useState<"identifier" | "code" | "pin" | "details">("identifier");
    const [identifier, setIdentifier] = useState("");
    const [name, setName] = useState("");
    const [status, setStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
    const [errorMessage, setErrorMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const [devCode, setDevCode] = useState<string | null>(null);
    const [loginData, setLoginData] = useState<LoginResponseData | null>(null);

    const placeholderText = useTypewriterPlaceholder(
        SAMPLE_EMAILS,
        step === "identifier" && !identifier
    );

    const [codeDigits, setCodeDigits] = useState<string[]>(["", "", "", "", "", ""]);
    const [pinDigits, setPinDigits] = useState<string[]>(["", "", "", "", ""]);
    const [regPinDigits, setRegPinDigits] = useState<string[]>(["", "", "", "", ""]);

    const [mousePos, setMousePos] = useState({ x: -1000, y: -1000 });

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            setMousePos({ x: e.clientX, y: e.clientY });
        };
        window.addEventListener("mousemove", handleMouseMove);
        return () => window.removeEventListener("mousemove", handleMouseMove);
    }, []);

    // Auto-login check on mount
    useEffect(() => {
        if (typeof window !== "undefined") {
            if (localStorage.getItem("tide_session_token")) {
                router.push("/");
                return;
            }
            getMasterKey().then((key) => { if (key) router.push("/"); });
        }
    }, [router]);

    // Multi-tab synchronization (magic link signal)
    useEffect(() => {
        const handleStorage = async (e: StorageEvent) => {
            if (e.key === "tide_auth_signal") {
                try {
                    const signal = JSON.parse(e.newValue || "{}");
                    if (signal.sessionKey && signal.email) {
                        const jwk = typeof signal.sessionKey === "string" ? JSON.parse(signal.sessionKey) : signal.sessionKey;
                        const cryptoKey = await window.crypto.subtle.importKey(
                            "jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]
                        );
                        await storeMasterKey(cryptoKey);
                        purgeLegacyKeys();
                        localStorage.setItem("tide_user_email", signal.email);
                        if (signal.publicKey) localStorage.setItem("tide_user_public_key", signal.publicKey);
                        if (signal.userId) localStorage.setItem("tide_user_id", signal.userId);
                        router.push("/");
                    }
                } catch (err) {
                    console.error("Multi-tab auth signal error:", err);
                }
            }
        };
        window.addEventListener("storage", handleStorage);
        return () => window.removeEventListener("storage", handleStorage);
    }, [router]);

    // ─── Step 1: Request Code / User Lookup ──────────────────────────────────
    const handleIdentifierSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedEmail = identifier.trim().toLowerCase();

        if (!trimmedEmail) {
            setErrorMessage("Bitte gib deine E-Mail-Adresse ein.");
            return;
        }

        if (!emailRegex.test(trimmedEmail)) {
            setErrorMessage("Diese E-Mail-Adresse sieht ungültig aus.");
            return;
        }

        setStatus("processing");
        setErrorMessage("");
        setSuccessMessage("");
        setDevCode(null);
        sessionStorage.clear();
        localStorage.removeItem("tide_session_token");

        try {
            const res = await apiFetch("/api/v1/auth/request-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: trimmedEmail }),
            });

            if (res.ok) {
                const data = await res.json();
                if (data.otp) setDevCode(data.otp);
                if (data.user_exists) {
                    setStep("code");
                    setCodeDigits(["", "", "", "", "", ""]);
                } else {
                    setStep("details");
                }
                setStatus("idle");
            } else {
                const text = await res.text().catch(() => "");
                let msg = "Anmeldung fehlgeschlagen.";
                try {
                    const p = JSON.parse(text);
                    if (p.error || p.message) msg = p.error || p.message;
                } catch { if (text) msg = text; }
                setStatus("error");
                setErrorMessage(msg);
            }
        } catch {
            setStatus("error");
            setErrorMessage("Verbindungsfehler. Bitte überprüfe deine Internetverbindung.");
        }
    };

    // ─── Step 2: Verify Code ─────────────────────────────────────────────────
    const handleCodeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const fullCode = codeDigits.join("");
        if (fullCode.length !== 6) {
            setErrorMessage("Bitte gib den 6-stelligen Bestätigungscode ein.");
            return;
        }

        setStatus("processing");
        setErrorMessage("");

        try {
            const res = await apiFetch("/api/v1/auth/verify-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: identifier.trim().toLowerCase(), otp: fullCode }),
            });

            if (res.ok) {
                const data: LoginResponseData = await res.json();
                setLoginData(data);
                setStep("pin");
                setPinDigits(["", "", "", "", ""]);
                setStatus("idle");
            } else {
                setStatus("error");
                setErrorMessage("Ungültiger Bestätigungscode. Bitte überprüfe deine Eingabe.");
                setCodeDigits(["", "", "", "", "", ""]);
            }
        } catch {
            setStatus("error");
            setErrorMessage("Bestätigung fehlgeschlagen. Bitte versuche es erneut.");
        }
    };

    // ─── Step 3: PIN Unlock (Decrypt Vault) ──────────────────────────────────
    const handlePinSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const fullPin = pinDigits.join("");
        if (fullPin.length !== 5) {
            setErrorMessage("Bitte gib deinen 5-stelligen PIN ein.");
            return;
        }
        if (!loginData) return;

        setStatus("processing");
        setErrorMessage("");

        try {
            const rawVault = typeof loginData.encrypted_vault === "string"
                ? JSON.parse(loginData.encrypted_vault)
                : loginData.encrypted_vault;

            const decryptedKey = await cryptoLib.unlockVault(fullPin, loginData.pepper, rawVault);
            await storeMasterKey(decryptedKey);
            purgeLegacyKeys();

            localStorage.setItem("tide_user_email", identifier.trim().toLowerCase());
            localStorage.setItem("tide_user_id", loginData.user_id);
            if (loginData.username) {
                localStorage.setItem("tide_user_name", loginData.username);
                const localRec = JSON.parse(localStorage.getItem("tide_user_" + identifier) || "{}");
                localStorage.setItem("tide_user_" + identifier, JSON.stringify({ ...localRec, username: loginData.username }));
            }
            localStorage.setItem("tide_user_public_key", loginData.public_key);
            if (loginData.token) localStorage.setItem("tide_session_token", loginData.token);

            setStatus("success");
            router.push("/");
        } catch (err) {
            console.error("Failed to decrypt vault:", err);
            setStatus("error");
            setErrorMessage("Falscher PIN. Bitte versuche es erneut.");
            setPinDigits(["", "", "", "", ""]);
        }
    };

    // ─── Step 4: Register Flow ───────────────────────────────────────────────
    const handleFinalSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedName = name.trim();
        const fullPin = regPinDigits.join("");

        if (!trimmedName) {
            setErrorMessage("Bitte gib deinen Namen ein.");
            return;
        }
        if (fullPin.length !== 5) {
            setErrorMessage("Der PIN muss genau 5 Ziffern lang sein.");
            return;
        }

        setStatus("processing");
        setErrorMessage("");

        try {
            const pepperBuffer = new Uint8Array(32);
            window.crypto.getRandomValues(pepperBuffer);
            const pepperBase64 = cryptoLib.arrayBufferToBase64(pepperBuffer.buffer);

            const { masterKeys, encryptedVault } = await cryptoLib.generateUserVault(fullPin, pepperBase64);
            const publicKeySpki = await cryptoLib.exportPublicKey(masterKeys.publicKey);

            try {
                await cryptoLib.unlockVault(fullPin, pepperBase64, encryptedVault);
            } catch {
                setStatus("error");
                setErrorMessage("Schlüsselerstellung fehlgeschlagen. Bitte versuche es erneut.");
                return;
            }

            const res = await apiFetch("/api/v1/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: identifier.trim().toLowerCase(),
                    username: trimmedName,
                    phone: "000000000",
                    public_key: publicKeySpki,
                    encrypted_vault: JSON.stringify(encryptedVault),
                    pepper: pepperBase64,
                    pin: fullPin,
                }),
            });

            if (res.ok) {
                setSuccessMessage("Konto erfolgreich erstellt! Bitte melde dich an.");
                setStep("identifier");
                setStatus("idle");
                setRegPinDigits(["", "", "", "", ""]);
                setName("");
            } else {
                const text = await res.text().catch(() => "");
                let msg = "Registrierung fehlgeschlagen.";
                try {
                    const p = JSON.parse(text);
                    if (p.error || p.message) msg = p.error || p.message;
                } catch { if (text) msg = text; }
                setStatus("error");
                setErrorMessage(msg);
            }
        } catch {
            setStatus("error");
            setErrorMessage("Registrierung fehlgeschlagen. Bitte überprüfe deine Eingaben.");
        }
    };

    return (
        <div className="min-h-screen min-h-[100dvh] flex flex-col justify-center relative overflow-hidden font-sans">
            <style>{`
                @keyframes float-1 {
                    0% { transform: translate(0, 0) scale(1) rotate(0deg); }
                    50% { transform: translate(50px, -80px) scale(1.1) rotate(45deg); }
                    100% { transform: translate(-50px, 50px) scale(0.95) rotate(-15deg); }
                }
                @keyframes float-2 {
                    0% { transform: translate(0, 0) scale(1); }
                    50% { transform: translate(-60px, 50px) scale(1.08); }
                    100% { transform: translate(40px, -40px) scale(0.92); }
                }
                @keyframes float-3 {
                    0% { transform: translate(0, 0) scale(1); }
                    50% { transform: translate(40px, 60px) scale(0.95); }
                    100% { transform: translate(-40px, -30px) scale(1.05); }
                }
            `}</style>

            {/* Background elements */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10 bg-[#fdfdfd]">
                <div
                    className="absolute -top-[10%] -right-[5%] w-[700px] h-[700px] rounded-full opacity-50"
                    style={{
                        backgroundColor: "#e0f2fe",
                        filter: "blur(140px)",
                        animation: "float-1 25s infinite ease-in-out alternate",
                        willChange: "transform",
                    }}
                />
                <div
                    className="absolute -bottom-[20%] right-[20%] w-[800px] h-[800px] rounded-full opacity-50"
                    style={{
                        backgroundColor: "#dcfce7",
                        filter: "blur(140px)",
                        animation: "float-2 25s infinite ease-in-out alternate -5s",
                        willChange: "transform",
                    }}
                />
                <div
                    className="absolute top-[30%] -left-[10%] w-[500px] h-[500px] rounded-full opacity-40"
                    style={{
                        backgroundColor: "#f3e8ff",
                        filter: "blur(140px)",
                        animation: "float-3 25s infinite ease-in-out alternate -10s",
                        willChange: "transform",
                    }}
                />
                <div
                    className="absolute inset-0 transition-opacity duration-300 pointer-events-none"
                    style={{
                        background: `radial-gradient(700px circle at ${mousePos.x}px ${mousePos.y}px, rgba(224, 242, 254, 0.45), rgba(243, 232, 255, 0.25) 35%, transparent 70%)`,
                    }}
                />
            </div>

            {/* Container with generous whitespace towards the right */}
            <div className="w-full max-w-7xl mx-auto px-8 md:px-16 lg:px-24 py-12 flex flex-col items-start relative z-10">
                <div className="max-w-xl w-full">
                    <span className="text-sm font-bold tracking-[0.4em] text-gray-900 uppercase mb-3 sm:mb-4 block select-none">
                        TIDE
                    </span>

                    {devCode && (
                        <div className="mb-8 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50/80 border border-blue-200/80 text-xs text-blue-700">
                            <span className="font-semibold">Bestätigungscode (Dev):</span>
                            <span className="font-mono tracking-widest font-bold">{devCode}</span>
                            {step === "code" && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const chars = devCode.slice(0, 6).toUpperCase().split("");
                                        const next = Array(6).fill("");
                                        chars.forEach((c, idx) => { next[idx] = c; });
                                        setCodeDigits(next);
                                    }}
                                    className="underline hover:text-blue-900 ml-1 text-[11px] font-medium cursor-pointer"
                                >
                                    Ausfüllen
                                </button>
                            )}
                        </div>
                    )}

                    {/* ─── Step 1: Identifier (Email) ─────────────────────────────── */}
                    {step === "identifier" && (
                        <div>
                            <h1 className="text-5xl md:text-6xl font-medium tracking-tight text-gray-900 mb-12 leading-tight">
                                Dein Studium, <br />
                                endlich im Flow.
                            </h1>

                            <form onSubmit={handleIdentifierSubmit} className="w-full relative mb-16" noValidate>
                                <div className="relative w-full max-w-sm mb-12">
                                    <label htmlFor="email" className="sr-only">E-Mail Adresse</label>
                                    <input
                                        type="email"
                                        id="email"
                                        name="email"
                                        placeholder={placeholderText || "name@uni-beispiel.de"}
                                        value={identifier}
                                        autoFocus
                                        autoComplete="email"
                                        onChange={(e) => {
                                            setIdentifier(e.target.value);
                                            if (errorMessage) setErrorMessage("");
                                        }}
                                        className={`w-full bg-transparent border-0 border-b ${
                                            errorMessage
                                                ? "border-b-red-500 text-gray-900 focus:border-b-red-500"
                                                : "border-b-gray-300 focus:border-b-gray-900 text-gray-800"
                                        } py-2 px-0 text-xl font-light placeholder:text-gray-300 focus:outline-none transition-colors duration-300`}
                                    />
                                    <div
                                        className={`absolute left-0 top-full mt-2 text-sm text-red-500 transition-opacity duration-300 pointer-events-none ${
                                            errorMessage ? "opacity-100" : "opacity-0"
                                        }`}
                                    >
                                        {errorMessage}
                                    </div>
                                    {successMessage && !errorMessage && (
                                        <div className="absolute left-0 top-full mt-2 text-sm text-emerald-600 transition-opacity duration-300 pointer-events-none">
                                            {successMessage}
                                        </div>
                                    )}
                                </div>

                                <ActionButton
                                    loading={status === "processing"}
                                    disabled={status === "processing"}
                                    label={status === "processing" ? "Einen Moment..." : "Weiter"}
                                />
                            </form>

                            <p className="text-lg text-gray-500 font-light leading-relaxed max-w-md">
                                Notizen, Termine und Todos in einer minimalistischen App vereint, um deinen Kopf frei zu halten.
                            </p>
                        </div>
                    )}

                    {/* ─── Step 2: Code Verification ──────────────────────────────── */}
                    {step === "code" && (
                        <div>
                            <h1 className="text-4xl sm:text-5xl font-medium tracking-tight text-gray-900 mb-4 sm:mb-6 leading-tight">
                                Bestätigungscode
                            </h1>

                            <p className="text-base sm:text-lg text-gray-500 font-light leading-relaxed max-w-md mb-8 sm:mb-10">
                                Mail an <span className="font-medium text-gray-900">{identifier}</span> gesendet. Nicht deine Mail?{" "}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStep("identifier");
                                        setErrorMessage("");
                                    }}
                                    className="font-medium text-gray-900 underline underline-offset-4 hover:text-gray-600 transition-colors cursor-pointer"
                                >
                                    Mail ändern
                                </button>
                            </p>

                            <form onSubmit={handleCodeSubmit} className="w-full relative mb-12" noValidate>
                                <div className="relative mb-8 w-full max-w-sm sm:max-w-md">
                                    <SegmentedDigitInput
                                        length={6}
                                        digits={codeDigits}
                                        onChange={(digits) => {
                                            setCodeDigits(digits);
                                            if (errorMessage) setErrorMessage("");
                                        }}
                                        allowedChars="alphanumeric"
                                        autoComplete="one-time-code"
                                        autoFocusFirst
                                        hasError={Boolean(errorMessage)}
                                        inputClassName="w-9 sm:w-11 h-12 sm:h-14 text-xl sm:text-2xl font-light text-center pb-2"
                                        gapClassName="gap-1.5 sm:gap-2.5 justify-between"
                                    />
                                    <div
                                        className={`absolute left-0 top-full mt-2 text-sm text-red-500 transition-opacity duration-300 pointer-events-none ${
                                            errorMessage ? "opacity-100" : "opacity-0"
                                        }`}
                                    >
                                        {errorMessage}
                                    </div>
                                </div>

                                <div className="flex items-center gap-6 mt-10">
                                    <ActionButton
                                        loading={status === "processing"}
                                        disabled={status === "processing"}
                                        label={status === "processing" ? "Überprüfen..." : "Bestätigen"}
                                    />
                                </div>
                            </form>
                        </div>
                    )}

                    {/* ─── Step 3: PIN Unlock (Vault) ─────────────────────────────── */}
                    {step === "pin" && (
                        <div>
                            <h1 className="text-4xl sm:text-5xl font-medium tracking-tight text-gray-900 mb-4 sm:mb-6 leading-tight">
                                Tresor entsperren
                            </h1>

                            <p className="text-base sm:text-lg text-gray-500 font-light leading-relaxed max-w-md mb-8 sm:mb-10">
                                Gib deinen 5-stelligen PIN ein, um deinen privaten Tresor zu entschlüsseln.
                            </p>

                            <form onSubmit={handlePinSubmit} className="w-full relative mb-12" noValidate>
                                <div className="relative mb-8 w-fit">
                                    <SegmentedDigitInput
                                        length={5}
                                        digits={pinDigits}
                                        onChange={(digits) => {
                                            setPinDigits(digits);
                                            if (errorMessage) setErrorMessage("");
                                        }}
                                        type="password"
                                        autoFocusFirst
                                        hasError={Boolean(errorMessage)}
                                        inputClassName="w-9 sm:w-11 h-12 sm:h-14 text-2xl font-mono text-center pb-2"
                                        gapClassName="gap-2 sm:gap-3"
                                    />
                                    <div
                                        className={`absolute left-0 top-full mt-2 text-sm text-red-500 transition-opacity duration-300 pointer-events-none ${
                                            errorMessage ? "opacity-100" : "opacity-0"
                                        }`}
                                    >
                                        {errorMessage}
                                    </div>
                                </div>

                                <div className="flex items-center gap-6 mt-10">
                                    <ActionButton
                                        loading={status === "processing"}
                                        disabled={status === "processing"}
                                        label={status === "processing" ? "Entschlüsseln..." : "Tresor öffnen"}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setStep("code");
                                            setErrorMessage("");
                                        }}
                                        className="text-sm font-medium text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
                                    >
                                        Zurück
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* ─── Step 4: Register Flow (Konto erstellen) ────────────────── */}
                    {step === "details" && (
                        <div>
                            <h1 className="text-4xl sm:text-5xl font-medium tracking-tight text-gray-900 mb-4 sm:mb-6 leading-tight">
                                Konto erstellen
                            </h1>

                            <p className="text-base sm:text-lg text-gray-500 font-light leading-relaxed max-w-md mb-8 sm:mb-10">
                                Wähle deinen Namen und erstelle einen sicheren 5-stelligen PIN für deinen privaten Tresor.
                            </p>

                            <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-white/70 backdrop-blur-md border border-gray-200/80 mb-6 text-sm text-gray-700 max-w-sm">
                                <span className="font-medium text-gray-900 truncate">{identifier}</span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStep("identifier");
                                        setErrorMessage("");
                                    }}
                                    className="text-xs font-semibold text-gray-500 hover:text-gray-900 underline ml-3 shrink-0 cursor-pointer"
                                >
                                    Ändern
                                </button>
                            </div>

                            <form onSubmit={handleFinalSubmit} className="w-full relative mb-12" noValidate>
                                <div className="mb-6 max-w-sm">
                                    <label className="block text-xs font-semibold tracking-wider uppercase text-gray-500 mb-2">
                                        Dein Name
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Wie heißt du?"
                                        value={name}
                                        autoFocus
                                        onChange={(e) => {
                                            setName(e.target.value);
                                            if (errorMessage) setErrorMessage("");
                                        }}
                                        className="w-full bg-transparent border-0 border-b border-gray-300 focus:border-b-gray-900 py-2.5 px-0 text-xl font-light text-gray-900 placeholder:text-gray-300 focus:outline-none transition-colors duration-300"
                                    />
                                </div>

                                <div className="mb-8 max-w-sm">
                                    <label className="block text-xs font-semibold tracking-wider uppercase text-gray-500 mb-2">
                                        5-stelliger PIN
                                    </label>
                                    <p className="text-xs text-gray-500 mb-3 font-light">
                                        Mit diesem PIN wird dein privater Tresor auf deinem Gerät verschlüsselt.
                                    </p>
                                    <div className="relative w-fit">
                                        <SegmentedDigitInput
                                            length={5}
                                            digits={regPinDigits}
                                            onChange={(digits) => {
                                                setRegPinDigits(digits);
                                                if (errorMessage) setErrorMessage("");
                                            }}
                                            type="password"
                                            inputClassName="w-9 sm:w-11 h-12 sm:h-14 text-2xl font-mono text-center pb-2"
                                            gapClassName="gap-2 sm:gap-3"
                                        />
                                    </div>
                                </div>

                                {errorMessage && <p className="text-sm font-medium text-red-500 mb-6">{errorMessage}</p>}

                                <div className="flex items-center gap-6 mt-10">
                                    <ActionButton
                                        loading={status === "processing"}
                                        disabled={status === "processing"}
                                        label={status === "processing" ? "Konto wird erstellt..." : "Konto erstellen"}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setStep("identifier");
                                            setErrorMessage("");
                                        }}
                                        className="text-sm font-medium text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
                                    >
                                        Abbrechen
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function Auth() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">Laden...</div>}>
            <AuthContent />
        </Suspense>
    );
}
