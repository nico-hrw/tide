"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { 
    Search, 
    Loader2, 
    UserPlus, 
    Check, 
    CheckCircle2, 
    X, 
    EyeOff, 
    Users, 
    MessageSquare, 
    Sparkles 
} from 'lucide-react';
import Avatar from '@/components/Profile/Avatar';
import ChatPanel from '@/components/Chat/ChatPanel';
import BottomSheet from '@/components/Layout/BottomSheet';
import SocialSplitChat from './SocialSplitChat';
import SocialContactCard from './SocialContactCard';
import { apiFetch } from '@/lib/api';
import { useSocialStore, SocialContact } from '@/store/useSocialStore';

export interface SearchResult {
    type?: string;
    id: string;
    title?: string;
    username: string;
    owner_id?: string;
    owner_is_verified?: boolean;
    bio?: string;
    avatar_seed?: string;
    avatar_salt?: string;
    avatar_style?: 'notionists' | 'openPeeps';
}

export interface ChatPartner {
    id: string;
    username: string;
    email: string;
    public_key: string;
    avatar_seed?: string;
    avatar_salt?: string;
    avatar_style?: string;
}

export interface SocialHubProps {
    onOpenProfile: (userId: string, username: string) => void;
    onViewProfile?: (userId: string) => void;
    onOpenFile: (fileId: string, title: string, parentId: string | null) => void;
    onOpenCalendar: () => void;
    userProfile: {
        username: string;
        email: string;
        avatar_seed?: string;
        avatar_salt?: string;
        avatar_style?: string;
        bio?: string;
        title?: string;
        id?: string;
        user_id?: string;
        is_verified?: boolean;
        profile_status?: number;
    } | null;
    privateKey: CryptoKey | null;
    compact?: boolean;
    initialTab?: 'contacts' | 'discover' | 'requests';
    initialChatUserId?: string;
}

export default function SocialHub({
    onOpenProfile,
    onViewProfile,
    onOpenFile,
    onOpenCalendar,
    userProfile,
    privateKey,
    compact = false,
    initialTab = 'contacts',
    initialChatUserId,
}: SocialHubProps) {
    const [activeTab, setActiveTab] = useState<'contacts' | 'discover' | 'requests'>(initialTab);
    const [searchQuery, setSearchQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
    const [localSent, setLocalSent] = useState<Record<string, boolean>>({});

    const [activeChatUser, setActiveChatUser] = useState<string | null>(initialChatUserId || null);
    const [directChatPartner, setDirectChatPartner] = useState<ChatPartner | null>(null);
    const [isChatMode, setIsChatMode] = useState<boolean>(Boolean(initialChatUserId));
    const [chatFilter, setChatFilter] = useState('');

    const {
        contacts,
        pendingRequests,
        fetchContacts,
        fetchPendingRequests,
        sendRequest,
        acceptRequest,
        declineRequest,
        removeContact,
        sentRequests,
    } = useSocialStore();

    useEffect(() => {
        fetchContacts();
        fetchPendingRequests();
        apiFetch('/api/v1/profiles/suggestions')
            .then((r) => (r.ok ? r.json() : []))
            .then((data) => { if (Array.isArray(data)) setSuggestions(data); })
            .catch(() => {});
    }, [fetchContacts, fetchPendingRequests]);

    useEffect(() => {
        if (initialChatUserId) {
            setActiveChatUser(initialChatUserId);
            setIsChatMode(true);
        }
    }, [initialChatUserId]);

    // Debounced search
    useEffect(() => {
        const trimmed = searchQuery.trim();
        if (!trimmed) {
            setResults([]);
            setIsSearching(false);
            return;
        }
        setIsSearching(true);
        const timer = setTimeout(async () => {
            try {
                const res = await apiFetch(`/api/v1/search?q=${encodeURIComponent(trimmed)}`);
                setResults(res.ok ? await res.json() : []);
            } catch {
                setResults([]);
            } finally {
                setIsSearching(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const handleViewProfile = (userId: string, username: string = '') => {
        onViewProfile?.(userId);
        onOpenProfile?.(userId, username);
    };

    const handleOpenChat = (partner: SocialContact['partner']) => {
        setActiveChatUser(partner.id);
        setDirectChatPartner(partner);
        setIsChatMode(true);
    };

    const handleAddContact = async (e: React.MouseEvent, targetUserId: string) => {
        e.stopPropagation();
        try {
            const ok = await sendRequest(targetUserId);
            if (ok) setLocalSent((prev) => ({ ...prev, [targetUserId]: true }));
        } catch (error) {
            console.error('Failed to send contact request', error);
        }
    };

    const activePartnerObj = useMemo(() => {
        if (!activeChatUser) return null;
        const found = contacts.find((c) => c.partner.id === activeChatUser);
        return found ? found.partner : directChatPartner;
    }, [activeChatUser, contacts, directChatPartner]);

    const isProfileHidden = userProfile?.profile_status === 0;

    const renderDiscoverCard = (user: SearchResult, key: string | number) => {
        const targetId = user.owner_id || user.id;
        const isAlreadyContact = contacts.some((c) => c.partner.id === targetId);
        const isAlreadySent = Boolean(sentRequests[targetId] || localSent[targetId]);

        return (
            <div key={key} className="bg-white dark:bg-[#1a1a1a] border border-gray-200/80 dark:border-white/10 p-5 rounded-2xl shadow-xs hover:border-gray-300 dark:hover:border-white/20 transition-all flex flex-col justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <Avatar seed={(user.avatar_seed || user.username || targetId) + (user.avatar_salt || '')} style={user.avatar_style} size={48} />
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                                <h3 className="font-bold text-gray-900 dark:text-white text-sm truncate">{user.username || 'Benutzer'}</h3>
                                {user.owner_is_verified && <CheckCircle2 className="w-3.5 h-3.5 fill-green-500 text-white shrink-0" />}
                            </div>
                            {user.title && <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider truncate">{user.title}</p>}
                        </div>
                    </div>
                    {user.bio && <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mt-3 italic">&ldquo;{user.bio}&rdquo;</p>}
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-white/5">
                    <button onClick={() => handleViewProfile(targetId, user.username)} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/15 text-gray-800 dark:text-gray-200 transition-colors">
                        <span>Profil ansehen</span>
                    </button>
                    {isAlreadyContact ? (
                        <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 px-3 py-2 text-center">Verbunden</span>
                    ) : isAlreadySent ? (
                        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-xl px-2.5 py-2 text-center">✓ Gesendet</span>
                    ) : (
                        <button onClick={(e) => handleAddContact(e, targetId)} className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors">
                            <UserPlus size={13} />
                            <span>Vernetzen</span>
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="flex-1 h-full flex flex-col bg-[#f8f9fa] dark:bg-[#121212] overflow-y-auto relative select-none">
            {/* Sticky Header Bar following Job & Uni Planer philosophy */}
            <div className="sticky top-0 z-30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 md:px-10 py-5 border-b border-gray-200 dark:border-white/10 bg-white/90 dark:bg-[#121212]/90 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">
                        Social & Kontakte
                    </h1>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Header Quick Search */}
                    <div className="relative hidden lg:block w-56">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Schnellsuche..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                if (activeTab !== 'discover') setActiveTab('discover');
                                if (isChatMode) setIsChatMode(false);
                            }}
                            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200/60 dark:border-white/10 text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:border-blue-500 transition-all"
                        />
                    </div>

                    {/* Segmented Control / Tabs */}
                    <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-white/5 rounded-xl border border-gray-200/60 dark:border-white/10">
                        <button
                            onClick={() => { setActiveTab('contacts'); setIsChatMode(false); }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                activeTab === 'contacts' && !isChatMode
                                    ? 'bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white shadow-xs'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                        >
                            <span>Kontakte</span>
                            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                                activeTab === 'contacts' && !isChatMode
                                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300'
                                    : 'bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-400'
                            }`}>
                                {contacts.length}
                            </span>
                        </button>

                        <button
                            onClick={() => { setActiveTab('discover'); setIsChatMode(false); }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                activeTab === 'discover' && !isChatMode
                                    ? 'bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white shadow-xs'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                        >
                            <Search size={13} />
                            <span>Entdecken & Suchen</span>
                        </button>

                        <button
                            onClick={() => { setActiveTab('requests'); setIsChatMode(false); }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                activeTab === 'requests' && !isChatMode
                                    ? 'bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white shadow-xs'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                        >
                            <UserPlus size={13} />
                            <span>Anfragen</span>
                            {pendingRequests.length > 0 && (
                                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-red-500 text-white animate-pulse">
                                    {pendingRequests.length}
                                </span>
                            )}
                        </button>
                    </div>

                    {/* Chat shortcut button */}
                    <button
                        onClick={() => setIsChatMode((prev) => !prev)}
                        className={`p-2 rounded-xl border border-gray-200/80 dark:border-white/10 transition-colors shadow-xs ${
                            isChatMode
                                ? 'bg-blue-600 text-white border-transparent'
                                : 'bg-white dark:bg-[#1a1a1a] text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/5'
                        }`}
                        title={isChatMode ? 'Zurück zur Übersicht' : 'Chat-Ansicht öffnen'}
                    >
                        <MessageSquare size={16} />
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-8 py-6 flex flex-col gap-6">
                {/* Profile Hidden Notice */}
                {isProfileHidden && (
                    <div className="flex items-center gap-2.5 px-4 py-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/40 rounded-2xl text-amber-900 dark:text-amber-300 text-xs font-medium">
                        <EyeOff className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        <span>Dein Profil ist derzeit auf <strong>verborgen</strong> gesetzt — andere Nutzer können dich nicht in der Suche finden. Dies kannst du in den Einstellungen anpassen.</span>
                    </div>
                )}

                {/* 1. CHAT MODE (Split / Full view) */}
                {isChatMode ? (
                    <SocialSplitChat
                        activePartner={activePartnerObj}
                        activeChatUser={activeChatUser}
                        contacts={contacts}
                        chatFilter={chatFilter}
                        setChatFilter={setChatFilter}
                        onSelectContact={(partner) => {
                            setActiveChatUser(partner.id);
                            setDirectChatPartner(partner);
                        }}
                        onBack={() => {
                            setIsChatMode(false);
                            setActiveChatUser(null);
                        }}
                        onViewProfile={handleViewProfile}
                        onOpenFile={onOpenFile}
                        onOpenCalendar={onOpenCalendar}
                        privateKey={privateKey}
                    />
                ) : (
                    <>
                        {/* 2. KONTAKTE TAB */}
                        {activeTab === 'contacts' && (
                            <div className="flex flex-col gap-4">
                                {contacts.length === 0 ? (
                                    <div className="text-center py-20 bg-white dark:bg-[#1a1a1a] rounded-2xl border border-gray-200/80 dark:border-white/10 p-8 flex flex-col items-center shadow-xs">
                                        <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/20 text-blue-500 flex items-center justify-center mb-4"><Users size={26} /></div>
                                        <h3 className="font-bold text-gray-900 dark:text-white text-base">Noch keine Kontakte</h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mt-1 mb-5">Finde andere Tide-Nutzer, vernetze dich und tausche Notizen oder Nachrichten aus.</p>
                                        <button onClick={() => setActiveTab('discover')} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors">
                                            <Search size={14} />
                                            <span>Personen entdecken</span>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {contacts.map((c) => (
                                            <SocialContactCard
                                                key={c.partner.id}
                                                contact={c}
                                                onViewProfile={handleViewProfile}
                                                onOpenChat={handleOpenChat}
                                                onRemoveContact={removeContact}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 3. ENTDECKEN & SUCHEN TAB */}
                        {activeTab === 'discover' && (
                            <div className="flex flex-col gap-6">
                                <div className="relative w-full">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                                        <Search size={18} />
                                    </div>
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Personen nach Name, E-Mail oder Rolle suchen..."
                                        className="w-full bg-white dark:bg-[#1a1a1a] border border-gray-200/80 dark:border-white/10 rounded-2xl py-3.5 pl-11 pr-10 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-xs"
                                        autoFocus
                                    />
                                    {searchQuery && (
                                        <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                                            <X size={16} />
                                        </button>
                                    )}
                                </div>

                                {isSearching && (
                                    <div className="flex items-center justify-center gap-2 py-12 text-gray-400 text-xs">
                                        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                                        <span>Suche nach Tide-Mitgliedern...</span>
                                    </div>
                                )}

                                {!isSearching && searchQuery.trim() && (
                                    <div className="flex flex-col gap-3">
                                        <div className="flex items-center justify-between">
                                            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Suchergebnisse</h2>
                                            <span className="text-xs text-gray-400">{results.length} Ergebnis{results.length !== 1 ? 'se' : ''}</span>
                                        </div>
                                        {results.length === 0 ? (
                                            <div className="text-center py-16 bg-white dark:bg-[#1a1a1a] rounded-2xl border border-dashed border-gray-200 dark:border-white/10 p-8">
                                                <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Keine Benutzer für «{searchQuery.trim()}» gefunden.</p>
                                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Nutzer werden nur angezeigt, wenn ihr Profil öffentlich ist.</p>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                {results.map((r, i) => renderDiscoverCard(r, r.id || i))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {!searchQuery.trim() && suggestions.length > 0 && (
                                    <div className="flex flex-col gap-3">
                                        <div className="flex items-center gap-2">
                                            <Sparkles className="w-4 h-4 text-blue-500" />
                                            <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Community & Empfehlungen</h2>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {suggestions.map((s, i) => renderDiscoverCard(s, s.id || `sug-${i}`))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 4. ANFRAGEN TAB */}
                        {activeTab === 'requests' && (
                            <div className="flex flex-col gap-4">
                                {pendingRequests.length === 0 ? (
                                    <div className="text-center py-20 bg-white dark:bg-[#1a1a1a] rounded-2xl border border-gray-200/80 dark:border-white/10 p-8 flex flex-col items-center shadow-xs">
                                        <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-400 mb-4"><Users size={24} /></div>
                                        <h3 className="font-bold text-gray-900 dark:text-white text-base">Keine offenen Kontaktanfragen</h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mt-1">Sobald dir andere Nutzer eine Kontaktanfrage schicken, kannst du sie hier direkt bestätigen oder ablehnen.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {pendingRequests.map((req) => (
                                            <div key={req.id} className="bg-white dark:bg-[#1a1a1a] border border-gray-200/80 dark:border-white/10 p-5 rounded-2xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <Avatar seed={(req.avatar_seed || req.user_id) + (req.avatar_salt || '')} style={req.avatar_style === 'openPeeps' ? 'openPeeps' : 'notionists'} size={48} />
                                                    <div className="min-w-0">
                                                        <h3 className="font-bold text-gray-900 dark:text-white text-sm truncate">{req.username || 'Neuer Tide-Nutzer'}</h3>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">Möchte sich mit dir vernetzen</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <button onClick={() => handleViewProfile(req.user_id, req.username)} className="px-3 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                                                        Profil
                                                    </button>
                                                    <button onClick={async () => { await acceptRequest(req.id); }} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors">
                                                        <Check size={14} />
                                                        <span>Annehmen</span>
                                                    </button>
                                                    <button onClick={async () => { await declineRequest(req.id); }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/15 text-gray-700 dark:text-gray-300 transition-colors">
                                                        <X size={14} />
                                                        <span>Ablehnen</span>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* BottomSheet for compact/mobile devices */}
            {compact && (
                <BottomSheet
                    isOpen={Boolean(activePartnerObj && !isChatMode)}
                    onClose={() => { setActiveChatUser(null); setDirectChatPartner(null); }}
                    title={activePartnerObj?.username || 'Chat'}
                    snapHeight="85vh"
                >
                    {activePartnerObj && (
                        <ChatPanel
                            privateKey={privateKey}
                            onOpenFile={onOpenFile}
                            onOpenCalendar={onOpenCalendar}
                            onOpenProfile={handleViewProfile}
                            onFileCreated={() => {}}
                            activePartner={activePartnerObj}
                            onChatSelect={() => {}}
                        />
                    )}
                </BottomSheet>
            )}
        </div>
    );
}
