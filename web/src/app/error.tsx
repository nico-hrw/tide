'use client';

import { useEffect } from 'react';
import { RefreshCw, Home, AlertCircle } from 'lucide-react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Tide application error caught by boundary:', error);
  }, [error]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background text-foreground select-none">
      <div className="max-w-md w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 sm:p-8 shadow-xl text-center flex flex-col items-center">
        <div className="w-14 h-14 rounded-full bg-rose-500/10 dark:bg-rose-500/20 text-rose-500 flex items-center justify-center mb-4">
          <AlertCircle className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
          Ein unerwarteter Fehler ist aufgetreten
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6 max-h-32 overflow-y-auto px-2 break-words">
          {error?.message || 'Die Seite konnte nicht ordnungsgemäß dargestellt werden.'}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-medium text-sm transition-all shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            <span>App neu laden</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.location.pathname === '/') {
                reset();
              } else {
                window.location.href = '/';
              }
            }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 active:scale-[0.98] text-neutral-800 dark:text-neutral-200 font-medium text-sm transition-all"
          >
            <Home className="w-4 h-4" />
            <span>Zur Startseite</span>
          </button>
        </div>
      </div>
    </div>
  );
}
