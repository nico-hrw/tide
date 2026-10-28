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
    const statusColor = status === 'online' ? 'bg-emerald-500' : status === 'away' ? 'bg-amber-500' : 'bg-gray-400 dark:bg-gray-500';
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
        <div className="bg-white dark:bg-[#1a1a1a] border border-gray-200/80 dark:border-white/10 p-5 rounded-2xl shadow-xs hover:border-gray-300 dark:hover:border-white/20 transition-all flex flex-col justify-between gap-4">
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
                            <h3 className="font-bold text-gray-900 dark:text-white text-sm truncate">
                                {partner.username}
                            </h3>
                            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider truncate">
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
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                            title="Optionen"
                        >
                            <MoreHorizontal size={16} />
                        </button>
                        {isMenuOpen && (
                            <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-white/10 rounded-xl shadow-lg py-1 z-20 animate-in fade-in zoom-in-95 duration-150">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsMenuOpen(false);
                                        onViewProfile(partner.id, partner.username);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 text-left"
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
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 text-left"
                                >
                                    <MessageSquare size={13} />
                                    <span>Nachricht senden</span>
                                </button>
                                <div className="my-1 border-t border-gray-100 dark:border-white/10" />
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
                        <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 italic">
                            &ldquo;{partner.bio}&rdquo;
                        </p>
                    ) : (
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                            Verbunden über Tide Social
                        </p>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-white/5">
                <button
                    onClick={() => onViewProfile(partner.id, partner.username)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/15 text-gray-800 dark:text-gray-200 transition-colors"
                >
                    <span>Profil ansehen</span>
                </button>
                <button
                    onClick={() => onOpenChat(partner)}
                    className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors"
                    title="Nachricht senden"
                >
                    <MessageSquare size={14} />
                    <span>Nachricht</span>
                </button>
            </div>
        </div>
    );
}
