import { useEffect, useState } from 'react';

/**
 * Keeps something mounted while it animates out. `mounted` says whether to render it,
 * `visible` is the flag to drive its enter/exit transition (false on the first frame, so it can fly in).
 */
export function usePresence(open: boolean, exitMs: number): { mounted: boolean; visible: boolean } {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setVisible(true)); });
      return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
    }
    setVisible(false);
    const timer = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(timer);
  }, [open, exitMs]);

  return { mounted, visible };
}
