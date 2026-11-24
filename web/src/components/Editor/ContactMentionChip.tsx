"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import Avatar from '@/components/Profile/Avatar';
import { useT } from '@/components/Settings/useT';
import { useDataStore } from '@/store/useDataStore';
import { ContactProfileCard } from './ContactProfileCard';

const CARD_WIDTH = 224; // w-56

/**
 * Chip for an @-mentioned contact: avatar + live name, click opens a profile card.
 * Share state: the chip is shown as "nicht geteilt" only when the node says
 * `shareable === false`; otherwise it stays neutral (the exact server state is not
 * known client side, e.g. after an undo a second chip of the same person may remain).
 */
export function ContactMentionChip({ node }: Pick<NodeViewProps, 'node'>) {
    const t = useT();
    const id = String(node.attrs.id || '');
    const label = String(node.attrs.label || t('mention.unknownContact'));
    const contact = useDataStore((s) => s.contacts?.find((c) => c.id === id));
    const username = contact?.username || label;
    const shareable = node.attrs.shareable === true || node.attrs.shareable === 'true';
    const [open, setOpen] = useState(false);
    const [alignRight, setAlignRight] = useState(false);
    const wrapRef = useRef<HTMLSpanElement>(null);
    const btnRef = useRef<HTMLButtonElement>(null);

    const close = useCallback((refocus: boolean) => {
        setOpen(false);
        if (refocus) btnRef.current?.focus();
    }, []);

    // Flip the card to the right edge of the chip when it would overflow the viewport
    useLayoutEffect(() => {
        if (!open || !wrapRef.current) return;
        setAlignRight(wrapRef.current.getBoundingClientRect().left + CARD_WIDTH > window.innerWidth - 8);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close(true);
        };
        const onDown = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close(false);
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('mousedown', onDown);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('mousedown', onDown);
        };
    }, [open, close]);

    const avatarSeed = (contact?.avatar_seed || id) + (contact?.avatar_salt || '');
    const avatarStyle = contact?.avatar_style === 'openPeeps' ? 'openPeeps' : 'notionists';

    const openProfile = () => {
        window.dispatchEvent(new CustomEvent('tide:open-profile', { detail: { userId: id, username } }));
        close(false);
    };

    return (
        <NodeViewWrapper
            as="span"
            ref={wrapRef}
            className="relative inline-block align-middle"
            data-type="mention"
            data-id={id}
            data-label={label}
            data-type-link="contact"
            data-shareable={shareable ? 'true' : undefined}
        >
            <button
                type="button"
                ref={btnRef}
                data-contact-chip
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
                className={`inline-flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full border border-t2-line bg-t2-sub font-medium leading-snug cursor-pointer transition-colors ${shareable ? 'text-t2-accent' : 'text-t2-ink-3'}`}
                style={{ fontSize: 'inherit' }}
            >
                <Avatar seed={avatarSeed} style={avatarStyle} size={16} />
                <span>{username}</span>
                {!shareable && <span className="text-[0.8em] font-normal">· {t('mention.notShared')}</span>}
            </button>
            {open && (
                <ContactProfileCard
                    userId={id}
                    username={username}
                    avatarSeed={avatarSeed}
                    avatarStyle={avatarStyle}
                    shared={shareable}
                    kind={node.attrs.itemKind === 'event' ? 'event' : 'note'}
                    alignRight={alignRight}
                    onOpenProfile={openProfile}
                />
            )}
        </NodeViewWrapper>
    );
}

export default ContactMentionChip;
