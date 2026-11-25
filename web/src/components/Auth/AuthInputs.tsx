"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

/** Inputs shared by the auth page and its recovery steps (moved unchanged from app/auth/page.tsx). */

export interface SegmentedDigitInputProps {
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

export function SegmentedDigitInput({
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
                        hasError ? "border-b-red-500 text-red-900" : "border-b-t2-line text-t2-ink focus:border-b-t2-ink"
                    } focus:outline-none transition-colors duration-200`}
                />
            ))}
        </div>
    );
}

export function ActionButton({ loading, disabled, label }: { loading: boolean; disabled: boolean; label: string }) {
    return (
        <button
            type="submit"
            disabled={disabled}
            className="group flex items-center text-t2-ink text-lg tracking-wide hover:text-t2-ink-2 transition-colors duration-300 focus:outline-none disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
        >
            <span className="font-medium mr-4">{label}</span>
            {loading ? (
                <Loader2 className="w-6 h-6 animate-spin text-t2-ink-2" />
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
