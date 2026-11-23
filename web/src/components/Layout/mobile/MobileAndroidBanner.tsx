"use client";

import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

const DISMISS_STORAGE_KEY = 'tide_dismiss_android_banner';

export function MobileAndroidBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      if (localStorage.getItem(DISMISS_STORAGE_KEY)) return;
    } catch {
      // Ignore storage access errors in restricted browsing modes
    }

    const isAndroid = /Android/i.test(navigator.userAgent);
    const hasApkQuery = new URLSearchParams(window.location.search).get('apk') === '1';

    if (isAndroid || hasApkQuery) {
      setVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, '1');
    } catch {
      // Ignore storage access errors
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Tide für Android"
      className="shrink-0 bg-[#1a1b20] border border-cyan-500/20 text-[#f3f4f6] rounded-xl shadow-lg p-3 mx-3 mt-2 mb-2 flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-cyan-500/10 border border-cyan-500/20"
          aria-hidden="true"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24a11.46 11.46 0 0 0-8.94 0L5.65 5.67c-.19-.29-.54-.38-.83-.22-.3.16-.42.54-.26.85l1.84 3.18C4.09 10.74 2.53 13.06 2.25 15.8h19.5c-.28-2.74-1.84-5.06-4.15-6.32zM7.5 13.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm9 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"
              fill="#06b6d4"
            />
          </svg>
        </div>

        <div className="min-w-0">
          <div className="font-medium text-sm text-gray-100 leading-tight truncate">
            Tide für Android
          </div>
          <div className="text-xs text-gray-400 leading-snug truncate">
            Widgets &amp; Benachrichtigungen verfügbar
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <a
          href="/tide.apk"
          download="tide.apk"
          className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
        >
          <Download size={14} strokeWidth={2.25} />
          <span>APK</span>
        </a>

        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Banner schließen"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-100 hover:bg-white/10 transition-colors text-base leading-none cursor-pointer"
        >
          ×
        </button>
      </div>
    </div>
  );
}
