"use client";

import React from 'react';
import { Users, Settings, Trash2, LogOut } from 'lucide-react';
import Avatar from '../Profile/Avatar';
import { useSocialStore } from '@/store/useSocialStore';

export interface AvatarMenuProps {
    userProfile?: {
        username: string;
        email: string;
        avatar_seed?: string;
        avatar_salt?: string;
        id?: string;
        user_id?: string;
    } | null;
    myId?: string;
    isOpen?: boolean;
    setOpen: React.Dispatch<React.SetStateAction<boolean>>;
    menuRef: React.RefObject<HTMLDivElement | null>;
    onOpenSocial?: () => void;
    onOpenSettings?: () => void;
    onOpenTrash?: () => void;
    onLogout?: () => void;
    /** Avatar diameter in px. */
    size?: number;
    /** Side the menu is aligned to: "left" for the sidebar, "right" for the tab bar. */
    placement?: 'left' | 'right';
}

/** Profile picture with the status badge and the account menu (status, social, settings, trash, sign out). */
export default function AvatarMenu({
    userProfile, myId, isOpen, setOpen, menuRef, onOpenSocial, onOpenSettings, onOpenTrash, onLogout,
    size = 56, placement = 'right',
}: AvatarMenuProps) {
    const pendingRequests = useSocialStore((s) => s.pendingRequests);
    const myStatus = useSocialStore((s) => s.myStatus);
    const setMyStatus = useSocialStore((s) => s.setMyStatus);
    const dot = Math.max(10, Math.round(size / 4));

    const statusBtn = (id: 'online' | 'away' | 'offline', label: string, dotCls: string, activeCls: string) => (
        <button
            type="button"
            onClick={() => setMyStatus(id)}
            className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-[11px] font-medium transition-all ${myStatus === id ? `bg-t2-surface ${activeCls} shadow-xs font-semibold` : 'text-t2-ink-2 hover:text-t2-ink'}`}
            title={label}
        >
            <span className={`w-1.5 h-1.5 rounded-full ${dotCls} shrink-0`} />
            <span>{label}</span>
        </button>
    );

    const item = 'w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-t2-ink hover:bg-t2-hover rounded-lg transition-colors';

    return (
        <div ref={menuRef} className="relative shrink-0 flex items-center">
            <button
                onClick={() => setOpen((o) => !o)}
                style={{ width: size, height: size }}
                className="relative rounded-full hover:ring-2 hover:ring-t2-accent transition-all hover:scale-105 active:scale-95 cursor-pointer"
                title="Profil"
            >
                <div className="w-full h-full rounded-full overflow-hidden">
                    <Avatar
                        seed={(userProfile?.avatar_seed || userProfile?.user_id || userProfile?.id || myId || 'default') + (userProfile?.avatar_salt || '')}
                        size={size}
                    />
                </div>
                <span
                    style={{ width: dot, height: dot }}
                    className={`absolute bottom-0 right-0 rounded-full ring-2 ring-t2-surface z-10 ${
                        myStatus === 'online' ? 'bg-emerald-500' : myStatus === 'away' ? 'bg-amber-500' : 'bg-t2-ink-3'
                    }`}
                    title={myStatus === 'online' ? 'Online' : myStatus === 'away' ? 'Abwesend' : 'Offline'}
                />
                {pendingRequests.length > 0 && (
                    <span style={{ width: dot, height: dot }} className="absolute top-0 right-0 bg-red-500 border-2 border-t2-surface rounded-full z-10" />
                )}
            </button>

            {isOpen && (
                <div className={`absolute ${placement === 'left' ? 'left-0' : 'right-0'} top-full mt-2 w-52 bg-t2-surface border border-t2-line rounded-xl shadow-2xl py-1 z-[150] animate-in fade-in zoom-in-95 duration-100`}>
                    <div className="px-3 py-2 border-b border-t2-line-soft">
                        <p className="text-xs font-semibold text-t2-ink truncate">{userProfile?.username || 'User'}</p>
                        <p className="text-xs text-t2-ink-3 truncate">{userProfile?.email || ''}</p>
                        <div className="mt-2 flex items-center gap-1 p-0.5 bg-t2-hover rounded-lg">
                            {statusBtn('online', 'Online', 'bg-emerald-500', 'text-emerald-600 dark:text-emerald-400')}
                            {statusBtn('away', 'Abwesend', 'bg-amber-500', 'text-amber-600 dark:text-amber-400')}
                            {statusBtn('offline', 'Offline', 'bg-t2-ink-3', 'text-t2-ink')}
                        </div>
                    </div>
                    <div className="py-1 px-1">
                        {onOpenSocial && (
                            <button onClick={() => { setOpen(false); onOpenSocial(); }} className={`${item} justify-between`}>
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <Users size={14} className="text-t2-ink-3" />
                                        {pendingRequests.length > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />}
                                    </div>
                                    <span>Social</span>
                                </div>
                                {pendingRequests.length > 0 && (
                                    <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-red-500 text-white shrink-0 leading-none">
                                        {pendingRequests.length}
                                    </span>
                                )}
                            </button>
                        )}
                        {onOpenSettings && (
                            <button onClick={() => { setOpen(false); onOpenSettings(); }} className={item}>
                                <Settings size={14} className="text-t2-ink-3" />
                                <span>Einstellungen</span>
                            </button>
                        )}
                        {onOpenTrash && (
                            <button onClick={() => { setOpen(false); onOpenTrash(); }} className={item}>
                                <Trash2 size={14} className="text-t2-ink-3" />
                                <span>Papierkorb</span>
                            </button>
                        )}
                        <div className="h-px bg-t2-hover my-1" />
                        {onLogout && (
                            <button
                                onClick={onLogout}
                                className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors"
                            >
                                <LogOut size={14} className="text-rose-500" />
                                <span>Abmelden</span>
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
