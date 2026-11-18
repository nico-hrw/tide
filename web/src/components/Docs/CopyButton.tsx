'use client';

import { useCallback, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CopyButtonProps {
  /** Text to copy. Omit together with `currentUrl` to copy nothing. */
  text?: string;
  /** Copy the page address (without hash), resolved at click time. */
  currentUrl?: boolean;
  label?: string;
  copiedLabel?: string;
  className?: string;
}

export default function CopyButton({ text = '', currentUrl = false, label = 'Kopieren', copiedLabel = 'Kopiert', className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onClick = useCallback(async () => {
    const value = currentUrl ? window.location.href.split('#')[0] : text;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Fallback for insecure contexts / denied permission
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }, [text, currentUrl]);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 rounded-lg border border-t2-line bg-t2-surface px-2.5 py-1 text-xs font-medium text-t2-ink-2 transition-colors hover:bg-t2-hover hover:text-t2-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-t2-accent ${className}`}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-t2-accent" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      <span>{copied ? copiedLabel : label}</span>
    </button>
  );
}
