"use client";

import React, { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, ExternalLink, MessageSquare, UserMinus } from 'lucide-react';
import Avatar from '@/components/Profile/Avatar';
import { useSocialStore, SocialContact } from '@/store/useSocialStore';

type PartnerWithProfile = SocialContact['partner'] & {
    title?: string;
    bio?: string;
};

interface SocialContactCardProps {
    contact: SocialContact;
    onViewProfile: (userId: string, username?: string) => void;
    onOpenChat: (partner: SocialContact['partner']) => void;
    onRemoveContact: (contactUserId: string) => Promise<boolean>;
}

export default function SocialContactCard({
    contact,
    onViewProfile,
    onOpenChat,
    onRemoveContact,
}: SocialContactCardProps) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const partner = contact.partner as PartnerWithProfile;
    const partnerStatuses = useSocialStore((state) => state.partnerStatuses);
    const rawStatus = partnerStatuses[partner.id] || partner.status;
    const status = (rawStatus === 'online' || rawStatus === 'away' || rawStatus === 'offline') ? rawStatus : 'offline';
    const statusColor = status === 'online' ? 'bg-emerald-500' : status === 'away' ? 'bg-amber-500' : 'bg-t2-ink-3 ';
    const statusTitle = status === 'online' ? 'Online' : status === 'away' ? 'Abwesend' : 'Offline';

    useEffect(() => {
        const handleDocClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        if (isMenuOpen) {
            document.addEventListener('mousedown', handleDocClick);
            return () => document.removeEventListener('mousedown', handleDocClick);
        }
    }, [isMenuOpen]);

    const handleRemove = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsMenuOpen(false);
        if (window.confirm(`Möchtest du ${partner.username} wirklich aus deinen Kontakten entfernen?`)) {
            await onRemoveContact(partner.id);
        }
    };

    const avatarStyle = partner.avatar_style === 'openPeeps' ? 'openPeeps' : 'notionists';

    return (
        <div className="bg-t2-surface  border border-t2-line  p-5 rounded-2xl shadow-xs hover:border-t2-line  transition-all flex flex-col justify-between gap-4">
            <div>
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                            <Avatar
                                seed={(partner.avatar_seed || partner.id) + (partner.avatar_salt || '')}
                                style={avatarStyle}
                                size={48}
                            />
                            <span
                                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ${statusColor} ring-2 ring-white dark:ring-[#1a1a1a] transition-colors`}
                                title={statusTitle}
                            />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="font-bold text-t2-ink  text-sm truncate">
                                {partner.username}
                            </h3>
                            <p className="text-[11px] font-semibold text-t2-ink-3 uppercase tracking-wider truncate">
                                {partner.title ? `${partner.title} • ${statusTitle}` : statusTitle}
                            </p>
                        </div>
                    </div>

                    {/* 3-dots Menu */}
                    <div className="relative" ref={menuRef}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsMenuOpen(!isMenuOpen);
                            }}
                            className="p-1.5 rounded-lg text-t2-ink-3 hover:text-t2-ink  hover:bg-t2-hover  transition-colors"
                            title="Optionen"
                        >
                            <MoreHorizontal size={16} />
                        </button>
                        {isMenuOpen && (
                            <div className="absolute right-0 top-full mt-1 w-44 bg-t2-surface  border border-t2-line  rounded-xl shadow-lg py-1 z-20 animate-in fade-in zoom-in-95 duration-150">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsMenuOpen(false);
                                        onViewProfile(partner.id, partner.username);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-t2-ink  hover:bg-t2-sub  text-left"
                                >
                                    <ExternalLink size={13} />
                                    <span>Profil öffnen</span>
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsMenuOpen(false);
                                        onOpenChat(partner);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-t2-ink  hover:bg-t2-sub  text-left"
                                >
                                    <MessageSquare size={13} />
                                    <span>Nachricht senden</span>
                                </button>
                                <div className="my-1 border-t border-t2-line-soft " />
                                <button
                                    onClick={handleRemove}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 text-left font-medium"
                                >
                                    <UserMinus size={13} />
                                    <span>Kontakt entfernen</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-3">
                    {partner.bio ? (
                        <p className="text-xs text-t2-ink-2  line-clamp-2 italic">
                            &ldquo;{partner.bio}&rdquo;
                        </p>
                    ) : (
                        <p className="text-xs text-t2-ink-3 ">
                            Verbunden über Tide Social
                        </p>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-t2-line-soft ">
                <button
                    onClick={() => onViewProfile(partner.id, partner.username)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-t2-hover hover:bg-t2-stage   text-t2-ink  transition-colors"
                >
                    <span>Profil ansehen</span>
                </button>
                <button
                    onClick={() => onOpenChat(partner)}
                    className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-t2-accent hover:opacity-90 text-t2-accent-ink shadow-xs transition-colors"
                    title="Nachricht senden"
                >
                    <MessageSquare size={14} />
                    <span>Nachricht</span>
                </button>
            </div>
        </div>
    );
}
