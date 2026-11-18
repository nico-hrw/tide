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
      <div className="max-w-md w-full bg-t2-surface  border border-t2-line  rounded-2xl p-6 sm:p-8 shadow-xl text-center flex flex-col items-center">
        <div className="w-14 h-14 rounded-full bg-rose-500/10 dark:bg-rose-500/20 text-rose-500 flex items-center justify-center mb-4">
          <AlertCircle className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-semibold text-t2-ink  mb-2">
          Ein unerwarteter Fehler ist aufgetreten
        </h2>
        <p className="text-sm text-t2-ink-2  mb-6 max-h-32 overflow-y-auto px-2 break-words">
          {error?.message || 'Die Seite konnte nicht ordnungsgemäß dargestellt werden.'}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-t2-accent hover:opacity-90 active:scale-[0.98] text-t2-accent-ink font-medium text-sm transition-all shadow-sm"
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
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-t2-hover hover:bg-t2-stage   active:scale-[0.98] text-t2-ink  font-medium text-sm transition-all"
          >
            <Home className="w-4 h-4" />
            <span>Zur Startseite</span>
          </button>
        </div>
      </div>
    </div>
  );
}
