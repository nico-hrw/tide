'use client';

import { useEffect, useState } from 'react';

interface TocItem { id: string; title: string }

/** Sticky sidebar on desktop, horizontal chips on narrow screens. Highlights the section in view. */
export default function DocToc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? '');

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    // Active = last section whose top has passed the reading line below the sticky chip bar.
    const update = () => {
      let current = els[0].id;
      for (const el of els) if (el.getBoundingClientRect().top <= 140) current = el.id;
      setActive(current);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [items]);

  const link = (i: TocItem, chip: boolean) => {
    const on = active === i.id;
    const base = chip
      ? 'shrink-0 rounded-full border px-3 py-1 text-xs font-medium'
      : 'block rounded-lg px-3 py-1.5 text-sm';
    const tone = on
      ? chip ? 'border-t2-accent bg-t2-accent text-t2-accent-ink' : 'bg-t2-hover font-semibold text-t2-ink'
      : chip ? 'border-t2-line bg-t2-surface text-t2-ink-2' : 'text-t2-ink-2 hover:bg-t2-hover hover:text-t2-ink';
    return (
      <a key={i.id} href={`#${i.id}`} aria-current={on ? 'location' : undefined} className={`${base} ${tone} transition-colors`}>
        {i.title}
      </a>
    );
  };

  return (
    <>
      <nav aria-label="Inhaltsverzeichnis" className="sticky top-0 z-20 -mx-4 flex gap-2 overflow-x-auto border-b border-t2-line bg-t2-bg px-4 py-2.5 lg:hidden">
        {items.map((i) => link(i, true))}
      </nav>
      <nav aria-label="Inhaltsverzeichnis" className="sticky top-8 hidden max-h-[calc(100vh-4rem)] self-start overflow-y-auto lg:block">
        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-t2-ink-3">Inhalt</p>
        <div className="space-y-0.5">{items.map((i) => link(i, false))}</div>
      </nav>
    </>
  );
}
