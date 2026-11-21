"use client";

import React from 'react';
import { Search, MessageSquare, ArrowLeft } from 'lucide-react';
import Avatar from '@/components/Profile/Avatar';
import ChatPanel from '@/components/Chat/ChatPanel';
import { SocialContact, useSocialStore, UserStatus } from '@/store/useSocialStore';
import { ChatPartner } from './SocialHub';

type PartnerWithTitle = SocialContact['partner'] & {
    title?: string;
};

interface SocialSplitChatProps {
    activePartner: ChatPartner | null;
    activeChatUser: string | null;
    contacts: SocialContact[];
    chatFilter: string;
    setChatFilter: (val: string) => void;
    onSelectContact: (partner: SocialContact['partner']) => void;
    onBack: () => void;
    onViewProfile: (userId: string, username?: string) => void;
    onOpenFile: (fileId: string, title: string, parentId: string | null) => void;
    onOpenCalendar: () => void;
    privateKey: CryptoKey | null;
    myId?: string;
}

export default function SocialSplitChat({
    activePartner,
    activeChatUser,
    contacts,
    chatFilter,
    setChatFilter,
    onSelectContact,
    onBack,
    onViewProfile,
    onOpenFile,
    onOpenCalendar,
    privateKey,
    myId,
}: SocialSplitChatProps) {
    const partnerStatuses = useSocialStore((state) => state.partnerStatuses);

    const getStatusInfo = (userId: string, fallbackStatus?: string) => {
        const rawStatus = partnerStatuses[userId] || fallbackStatus;
        const status: UserStatus = (rawStatus === 'online' || rawStatus === 'away' || rawStatus === 'offline') ? rawStatus : 'offline';
        const color = status === 'online' ? 'bg-emerald-500' : status === 'away' ? 'bg-amber-500' : 'bg-t2-ink-3 ';
        const label = status === 'online' ? 'Online' : status === 'away' ? 'Abwesend' : 'Offline';
        return { status, color, label };
    };

    const filteredContacts = chatFilter.trim()
        ? contacts.filter((c) => c.partner.username.toLowerCase().includes(chatFilter.toLowerCase()))
        : contacts;

    return (
        <div className="flex flex-col gap-3 h-[calc(100vh-140px)] min-h-[500px]">
            <div className="flex items-center justify-between shrink-0">
                <button
                    onClick={onBack}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-t2-surface  border border-t2-line  text-xs font-semibold text-t2-ink  hover:bg-t2-sub  transition-colors shadow-xs group"
                >
                    <ArrowLeft size={15} className="group-hover:-translate-x-0.5 transition-transform" />
                    <span>Zurück zur Übersicht</span>
                </button>
                {activePartner && (
                    <div className="flex items-center gap-2">
                        {(() => {
                            const { color: statusColor, label: statusLabel } = getStatusInfo(activePartner.id);
                            return (
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-t2-ink  bg-t2-hover  px-2.5 py-1 rounded-lg">
                                    <span className={`w-2 h-2 rounded-full ${statusColor}`} />
                                    <span>{activePartner.username}</span>
                                    <span className="text-[11px] font-normal text-t2-ink-3">({statusLabel})</span>
                                </span>
                            );
                        })()}
                    </div>
                )}
            </div>

            {/* Split Container */}
            <div className="w-full flex-1 min-h-0 bg-t2-surface  border border-t2-line  rounded-2xl shadow-sm flex flex-col md:flex-row overflow-hidden">
                {/* Contacts Column */}
                <div className={`w-full md:w-80 shrink-0 border-r border-t2-line  flex flex-col bg-t2-sub  ${activePartner ? 'hidden md:flex' : 'flex'}`}>
                    <div className="p-3 border-b border-t2-line ">
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t2-ink-3" />
                            <input
                                type="text"
                                placeholder="Kontakte filtern..."
                                value={chatFilter}
                                onChange={(e) => setChatFilter(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-t2-surface  border border-t2-line  outline-none text-t2-ink  focus:border-t2-accent"
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {filteredContacts.length === 0 ? (
                            <div className="text-center py-8 text-xs text-t2-ink-3">Keine Kontakte gefunden</div>
                        ) : (
                            filteredContacts.map((c) => {
                                const isSelected = activeChatUser === c.partner.id;
                                const avatarStyle = c.partner.avatar_style === 'openPeeps' ? 'openPeeps' : 'notionists';
                                const partnerInfo = c.partner as PartnerWithTitle;
                                const { color: statusColor, label: statusLabel } = getStatusInfo(c.partner.id, c.partner.status);
                                const subtitle = partnerInfo.title ? `${partnerInfo.title} • ${statusLabel}` : statusLabel;
                                return (
                                    <button
                                        key={c.partner.id}
                                        onClick={() => onSelectContact(c.partner)}
                                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all text-left ${
                                            isSelected
                                                ? 'bg-t2-sub  border border-t2-line  text-t2-accent  shadow-xs'
                                                : 'hover:bg-t2-hover  border border-transparent'
                                        }`}
                                    >
                                        <div className="relative shrink-0">
                                            <Avatar seed={(c.partner.avatar_seed || c.partner.id) + (c.partner.avatar_salt || '')} style={avatarStyle} size={36} />
                                            <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ${statusColor} ring-2 ring-white dark:ring-[#161616]`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-xs font-semibold truncate ${isSelected ? 'text-t2-accent ' : 'text-t2-ink '}`}>{c.partner.username}</p>
                                            <p className="text-[11px] text-t2-ink-3 truncate">{subtitle}</p>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Chat Column */}
                <div className={`flex-1 flex flex-col min-w-0 bg-t2-surface  ${!activePartner ? 'hidden md:flex' : 'flex'}`}>
                    {activePartner ? (
                        <div className="flex-1 min-h-0 overflow-hidden">
                            <ChatPanel
                                privateKey={privateKey}
                                onOpenFile={onOpenFile}
                                onOpenCalendar={onOpenCalendar}
                                onOpenProfile={onViewProfile}
                                onFileCreated={() => {}}
                                activePartner={activePartner}
                                onChatSelect={() => {}}
                                hideHeader={false}
                                myId={myId}
                            />
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                            <div className="w-16 h-16 rounded-2xl bg-t2-sub  text-t2-accent flex items-center justify-center mb-4"><MessageSquare size={32} /></div>
                            <h3 className="font-bold text-t2-ink  text-base">Keine Unterhaltung ausgewählt</h3>
                            <p className="text-xs text-t2-ink-2  max-w-sm mt-1">Wähle links einen Kontakt aus der Liste, um den Chat zu öffnen.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
