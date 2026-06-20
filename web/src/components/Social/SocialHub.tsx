import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { apiFetch } from '@/lib/api';
import Avatar from '@/components/Profile/Avatar';
import { Search, Loader2, UserPlus, Check, ChevronRight, ChevronLeft, CheckCircle2, X, EyeOff, Users, MessageSquare } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';
import { useSocialStore } from '@/store/useSocialStore';

interface SearchResult {
    type: string;
    id: string;
    title: string;
    username: string;
    owner_id: string;
    owner_is_verified: boolean;
    bio: string;
    avatar_seed: string;
    avatar_salt: string;
    avatar_style: 'notionists' | 'openPeeps';
}

import ChatPanel from '@/components/Chat/ChatPanel';
import PartnerProfileHeader from '@/components/Chat/PartnerProfileHeader';
import BottomSheet from '@/components/Layout/BottomSheet';

interface SocialHubProps {
    onOpenProfile: (userId: string, username: string) => void;
    onOpenFile: (fileId: string, title: string, parentId: string | null) => void;
    onOpenCalendar: () => void;
    userProfile: { username: string; email: string; avatar_seed?: string; avatar_salt?: string; avatar_style?: string; bio?: string; title?: string; id?: string; user_id?: string; is_verified?: boolean; profile_status?: number } | null;
    privateKey: CryptoKey | null;
    compact?: boolean;
}

export default function SocialHub({ onOpenProfile, onOpenFile, onOpenCalendar, userProfile, privateKey, compact }: SocialHubProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [activeChatPartner, setActiveChatPartner] = useState<{ id: string, username: string, email: string, public_key: string, avatar_seed: string, avatar_salt: string, avatar_style: string } | null>(null);
    const [isChatMode, setIsChatMode] = useState(false);
    const [profileExpanded, setProfileExpanded] = useState(true);
    const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
    const [showRequests, setShowRequests] = useState(false);
    const [addedContacts, setAddedContacts] = useState<Record<string, boolean>>({});
    const requestsRef = useRef<HTMLDivElement>(null);

    const { myId } = useDataStore();

    // Use the central social store
    const {
        contacts,
        pendingRequests,
        fetchContacts,
        fetchPendingRequests,
        acceptRequest,
        declineRequest,
        requestCount,
    } = useSocialStore();

    useEffect(() => {
        fetchContacts();
        fetchPendingRequests();

        // Fetch Suggestions (Random)
        apiFetch('/api/v1/profiles/suggestions')
            .then(r => r.ok ? r.json() : [])
            .then(data => { if (Array.isArray(data)) setSuggestions(data); })
            .catch(() => {});
    }, []);

    // Close request popover when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (requestsRef.current && !requestsRef.current.contains(e.target as Node)) {
                setShowRequests(false);
            }
        };
        if (showRequests) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showRequests]);

    const handleChatScroll = (scrollTop: number, direction: 'up' | 'down') => {
        // Removed auto-collapse to fix UI flickering / infinite layout loops.
        // Users can manually toggle the profile header.
    };

    const handleSearch = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!query.trim()) return;
        setIsSearching(true);
        try {
            const res = await apiFetch(`/api/v1/search?q=${encodeURIComponent(query)}`);
            if (res.ok) {
                const data = await res.json();
                setResults(data || []);
            } else {
                setResults([]);
            }
        } catch (e) {
            console.error('Search error', e);
            setResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    const handleAddContact = async (e: React.MouseEvent, userId: string) => {
        e.stopPropagation();
        try {
            const ok = await useSocialStore.getState().sendRequest(userId);
            if (ok) {
                setAddedContacts(prev => ({ ...prev, [userId]: true }));
            } else {
                alert('Failed to send request — already sent or connection issue.');
            }
        } catch (error) {
            console.error('Failed to add contact', error);
        }
    };

    const isProfileHidden = userProfile?.profile_status === 0;
    const myAvatarSeed = (userProfile?.avatar_seed || userProfile?.username || 'default') + (userProfile?.avatar_salt || '');

    const searchForm = (
        <form onSubmit={handleSearch} className="relative w-full max-w-2xl group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className={compact ? 'h-4 w-4 text-gray-400 group-focus-within:text-blue-500 transition-colors' : 'h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors'} />
            </div>
            <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search users by name, email, or title..."
                className={compact
                    ? 'w-full bg-white dark:bg-black/40 border border-gray-200 rounded-2xl py-3 pl-10 pr-4 text-sm font-medium outline-none focus:border-blue-500'
                    : 'w-full bg-white dark:bg-black/40 border-2 border-gray-100 dark:border-white/10 rounded-2xl py-4 pl-12 pr-32 text-gray-900 dark:text-white font-medium outline-none focus:border-blue-500 transition-all shadow-sm focus:shadow-md'
                }
            />
            {!compact && query && (
                <button
                    type="submit"
                    className="absolute inset-y-2 right-2 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors flex items-center gap-2"
                >
                    {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                </button>
            )}
            {!compact && !query && (
                <button
                    type="button"
                    onClick={() => setQuery(' ')}
                    className="absolute inset-y-2 right-2 px-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 font-medium text-sm transition-colors"
                >
                    ⌘K
                </button>
            )}
            {compact && query && (
                <button
                    type="submit"
                    className="absolute inset-y-2 right-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors flex items-center gap-2 text-sm"
                >
                    {isSearching ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Go'}
                </button>
            )}
        </form>
    );

    return (
        <LayoutGroup id="social-contacts">
        <div className={isChatMode ? 'flex h-full overflow-hidden' : compact ? 'flex flex-col min-h-full' : 'max-w-5xl mx-auto py-12 px-8 min-h-screen'}>
        {isChatMode ? (
            <>
                {/* LEFT COLUMN - contacts */}
                <div className="w-80 shrink-0 flex flex-col border-r border-gray-100 dark:border-white/10 overflow-hidden">
                    {/* Back button */}
                    <div className="px-3 pt-3 pb-1 shrink-0">
                        <button
                            onClick={() => { setIsChatMode(false); setActiveChatPartner(null); }}
                            className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                        >
                            <ChevronLeft size={16} />
                            <span className="font-medium">Zurück</span>
                        </button>
                    </div>
                    {/* Search at top */}
                    <div className="p-3 border-b border-gray-100 dark:border-white/10 shrink-0">
                        {searchForm}
                    </div>

                    {/* Pending requests badge */}
                    {pendingRequests.length > 0 && (
                        <div className="px-3 py-2 shrink-0">
                            <div className="relative" ref={requestsRef}>
                                <button
                                    onClick={() => setShowRequests(!showRequests)}
                                    className="w-full flex items-center gap-2 p-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                                >
                                    <Users size={14} />
                                    {pendingRequests.length} Kontaktanfrage{pendingRequests.length !== 1 ? 'n' : ''}
                                </button>
                                {showRequests && (
                                    <div className="absolute top-full left-0 mt-1 w-72 bg-white dark:bg-[#1a1c1e] border border-gray-100 dark:border-white/10 rounded-2xl shadow-2xl p-4 z-50">
                                        <div className="space-y-3 max-h-[280px] overflow-y-auto">
                                            {pendingRequests.map((req) => (
                                                <div key={req.id} className="flex items-center gap-3">
                                                    <Avatar seed={(req.avatar_seed || req.user_id) + (req.avatar_salt || '')} style={req.avatar_style as any} size={32} />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{req.username || 'Neuer Kontakt'}</p>
                                                    </div>
                                                    <div className="flex gap-1 shrink-0">
                                                        <button onClick={async () => { await acceptRequest(req.id); }} className="p-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600"><Check className="w-3.5 h-3.5" /></button>
                                                        <button onClick={async () => { await declineRequest(req.id); }} className="p-1.5 bg-gray-100 dark:bg-white/10 text-gray-400 rounded-lg hover:bg-gray-200"><X className="w-3.5 h-3.5" /></button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Contacts list — compact rows */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                        {contacts.length === 0 && !query.trim() && (
                            <div className="text-center py-8 text-gray-400 text-sm">
                                <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                Keine Kontakte
                            </div>
                        )}
                        {contacts.map((c, i) => {
                            const isActive = activeChatPartner?.id === c.partner.id;
                            return (
                                <motion.div key={c.partner.id} layoutId={`contact-${c.partner.id}`}>
                                <button
                                    onClick={() => {
                                        setActiveChatPartner({
                                            id: c.partner.id,
                                            username: c.partner.username,
                                            email: c.partner.email,
                                            public_key: c.partner.public_key,
                                            avatar_seed: c.partner.avatar_seed,
                                            avatar_salt: c.partner.avatar_salt,
                                            avatar_style: c.partner.avatar_style
                                        });
                                        setProfileExpanded(true);
                                    }}
                                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors text-left ${isActive ? 'bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-200 dark:ring-indigo-700' : 'hover:bg-gray-100 dark:hover:bg-white/5'}`}
                                >
                                    <Avatar seed={(c.partner.avatar_seed || c.partner.id) + (c.partner.avatar_salt || '')} style={c.partner.avatar_style as any} size={32} />
                                    <span className={`text-sm font-medium truncate ${isActive ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'}`}>
                                        {c.partner.username}
                                    </span>
                                </button>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>

                {/* RIGHT PANEL - chat */}
                <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                    {activeChatPartner ? (
                        <>
                            <PartnerProfileHeader
                                partner={activeChatPartner}
                                expanded={profileExpanded}
                                onOpenProfile={onOpenProfile}
                                onToggle={() => setProfileExpanded(p => !p)}
                            />
                            <div className="flex-1 min-h-0 overflow-hidden">
                                <ChatPanel
                                    privateKey={privateKey}
                                    onOpenFile={onOpenFile}
                                    onOpenCalendar={onOpenCalendar}
                                    onOpenProfile={onOpenProfile}
                                    onFileCreated={() => {}}
                                    activePartner={activeChatPartner}
                                    onChatSelect={() => {}}
                                    onScroll={handleChatScroll}
                                    hideHeader={true}
                                />
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
                            <MessageSquare size={32} className="opacity-30" />
                            <p className="text-sm font-medium">Wähle einen Kontakt</p>
                            <p className="text-xs opacity-70">um zu chatten</p>
                        </div>
                    )}
                </div>
            </>
        ) : (
            <>
            {/* Header Row */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-8 mb-8">
                <div className="flex-1">
                    <div className="flex items-center justify-between mb-6">
                        <h1 className="text-4xl font-black text-gray-900 dark:text-white">Social</h1>
                        <button
                            onClick={() => setIsChatMode(prev => !prev)}
                            className={`p-2 rounded-xl transition-colors ${isChatMode ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-600'}`}
                            title={isChatMode ? 'Zur Übersicht' : 'Chat öffnen'}
                        >
                            <MessageSquare size={20} />
                        </button>
                    </div>
                    {!compact && searchForm}
                </div>

                {/* Own Profile Card — Avatar acts as request badge button */}
                {!compact && userProfile && (
                    <div className="relative flex flex-col items-center bg-gray-50/50 dark:bg-white/5 p-6 rounded-[2.5rem] border border-gray-100 dark:border-white/10 min-w-[200px]">
                        {/* Avatar is the request trigger */}
                        <div className="relative cursor-pointer" ref={requestsRef}>
                            <button
                                onClick={() => pendingRequests.length > 0 && setShowRequests(!showRequests)}
                                className={`relative transition-transform ${pendingRequests.length > 0 ? 'hover:scale-105' : ''}`}
                                title={pendingRequests.length > 0 ? `${pendingRequests.length} incoming contact request(s)` : 'Your Profile'}
                            >
                                <Avatar
                                    seed={myAvatarSeed}
                                    style={userProfile.avatar_style as any}
                                    size={100}
                                    className={`mb-4 transition-all ${pendingRequests.length > 0 ? 'ring-4 ring-blue-500/60 ring-offset-2 ring-offset-white dark:ring-offset-gray-900' : ''}`}
                                />
                                {/* Request Badge */}
                                {pendingRequests.length > 0 && (
                                    <span className="absolute top-0 right-0 min-w-[22px] h-[22px] bg-red-500 text-white text-[11px] font-black rounded-full flex items-center justify-center px-1 border-2 border-white dark:border-gray-900 shadow-lg animate-pulse">
                                        {pendingRequests.length}
                                    </span>
                                )}
                            </button>

                            {/* Requests Popover */}
                            {showRequests && pendingRequests.length > 0 && (
                                <div className="absolute top-full right-0 mt-3 w-80 bg-white dark:bg-[#1a1c1e] border border-gray-100 dark:border-white/10 rounded-[2rem] shadow-2xl p-5 z-50 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2">
                                            <Users className="w-4 h-4 text-blue-500" />
                                            Contact Requests
                                        </h3>
                                        <button
                                            onClick={() => setShowRequests(false)}
                                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition-colors"
                                        >
                                            <X className="w-4 h-4 text-gray-400" />
                                        </button>
                                    </div>
                                    <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
                                        {pendingRequests.map((req) => (
                                            <div key={req.id} className="bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 rounded-2xl p-3 flex items-center gap-3">
                                                <Avatar
                                                    seed={(req.avatar_seed || req.user_id) + (req.avatar_salt || '')}
                                                    style={req.avatar_style as any}
                                                    size={40}
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-sm text-gray-900 dark:text-white truncate">{req.username || 'New Friend'}</p>
                                                    <p className="text-xs text-gray-400">sent you a request</p>
                                                </div>
                                                <div className="flex gap-1.5 shrink-0">
                                                    <button
                                                        onClick={async () => { await acceptRequest(req.id); if (pendingRequests.length === 0) setShowRequests(false); }}
                                                        className="p-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors shadow-md shadow-green-500/20"
                                                        title="Accept"
                                                    >
                                                        <Check className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={async () => { await declineRequest(req.id); if (pendingRequests.length === 0) setShowRequests(false); }}
                                                        className="p-1.5 bg-white dark:bg-white/10 text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-white/20 transition-colors"
                                                        title="Decline"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="text-center">
                            <h2 className="font-black text-gray-900 dark:text-white text-lg flex items-center justify-center gap-1.5">
                                {userProfile.username}
                                {userProfile.is_verified && <CheckCircle2 className="w-4 h-4 fill-green-500 text-white" />}
                            </h2>
                            {userProfile.title && (
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] mt-0.5">{userProfile.title}</p>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Profile Hidden Notice */}
            {userProfile && userProfile.profile_status === 0 && (
                <div className="flex items-center gap-2 mb-6 px-4 py-2.5 bg-gray-100 dark:bg-white/5 rounded-xl w-fit text-gray-400 text-xs font-medium">
                    <EyeOff className="w-3.5 h-3.5 shrink-0" />
                    Your profile is set to <strong>hidden</strong> — others cannot find you in search. Change this in Settings → Account.
                </div>
            )}

            {/* Content Area */}
            {compact ? (
                <>
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {/* Search Results */}
                    {query.trim() && (
                        results.length > 0 ? (
                            <div className="mb-16">
                                <h2 className="text-xl font-black text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                                    Search Results
                                    <span className="text-xs py-0.5 px-2 bg-gray-100 dark:bg-white/10 rounded-full font-bold text-gray-500">{results.length}</span>
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {results.map((r, i) => {
                                        const alreadyContact = contacts.some(c => c.partner.id === (r.owner_id || r.id));
                                        const alreadyAdded = addedContacts[r.owner_id || r.id];
                                        return (
                                            <div
                                                key={i}
                                                onClick={() => onOpenProfile(r.owner_id || r.id, r.username)}
                                                className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl p-5 hover:shadow-lg hover:border-blue-200 dark:hover:border-blue-500/30 transition-all cursor-pointer group flex items-start gap-4"
                                            >
                                                <Avatar
                                                    seed={(r.avatar_seed || r.username || r.owner_id || r.id) + (r.avatar_salt || '')}
                                                    style={r.avatar_style}
                                                    size={48}
                                                    className="shrink-0 transition-transform group-hover:scale-110"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5 mb-0.5">
                                                        <h3 className="font-bold text-gray-900 dark:text-white truncate">
                                                            {r.username || r.title || 'User'}
                                                        </h3>
                                                        {r.owner_is_verified && (
                                                            <CheckCircle2 className="w-4 h-4 fill-green-500 text-white shrink-0" />
                                                        )}
                                                    </div>
                                                    {r.title && r.title !== r.username && (
                                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">{r.title}</p>
                                                    )}
                                                    {r.type === 'profile' && r.bio && (
                                                        <p className="text-xs text-gray-500 line-clamp-1 italic">"{r.bio}"</p>
                                                    )}
                                                </div>
                                                {!alreadyContact && (
                                                    <button
                                                        onClick={(e) => handleAddContact(e, r.owner_id || r.id)}
                                                        disabled={alreadyAdded}
                                                        className={`p-2 -mr-2 -mt-2 rounded-xl transition-colors shrink-0 ${alreadyAdded ? 'text-green-500 cursor-default' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10'}`}
                                                        title={alreadyAdded ? 'Request Sent' : 'Add Contact'}
                                                    >
                                                        {alreadyAdded ? <Check className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : !isSearching ? (
                            <div className="text-center py-12 mb-12 bg-gray-50 dark:bg-white/5 rounded-3xl border border-dashed border-gray-200 dark:border-white/10">
                                <p className="text-gray-400 font-medium">No results found for "{query}"</p>
                                <p className="text-xs text-gray-300 dark:text-gray-600 mt-2">Users only appear when their profile is set to public.</p>
                            </div>
                        ) : null
                    )}

                    {/* Suggestions */}
                    {!query.trim() && suggestions.length > 0 && (
                        <div className="mb-16">
                            <h2 className="text-xl font-black text-gray-900 dark:text-white mb-6">Discover People</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {suggestions.map((s, i) => {
                                    const alreadyContact = contacts.some(c => c.partner.id === (s.owner_id || s.id));
                                    const alreadyAdded = addedContacts[s.owner_id || s.id];
                                    return (
                                        <div
                                            key={`sug-${i}`}
                                            onClick={() => s?.id && onOpenProfile(s.owner_id || s.id, s.username)}
                                            className={`bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-3xl p-6 hover:shadow-lg transition-all flex flex-col gap-4 cursor-pointer ${alreadyContact ? 'hidden' : ''}`}
                                        >
                                            <div className="flex items-center gap-4">
                                                <Avatar
                                                    seed={(s?.avatar_seed || s?.username || `placeholder-${i}`) + (s?.avatar_salt || '')}
                                                    style={s?.avatar_style}
                                                    size={56}
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <h3 className="font-black text-gray-900 dark:text-white truncate flex items-center gap-1">
                                                        {s?.username || `Community Member`}
                                                        {s?.owner_is_verified && <CheckCircle2 className="w-4 h-4 fill-green-500 text-white shrink-0" />}
                                                    </h3>
                                                    {s?.title && (
                                                        <p className="text-xs text-gray-500 font-bold uppercase tracking-widest truncate">{s.title}</p>
                                                    )}
                                                </div>
                                            </div>
                                            {!alreadyContact && s?.id && (
                                                <button
                                                    onClick={(e) => handleAddContact(e, s.owner_id || s.id)}
                                                    disabled={alreadyAdded}
                                                    className={`w-full py-2.5 rounded-xl font-bold text-sm transition-opacity ${alreadyAdded ? 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400 cursor-default' : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90'}`}
                                                >
                                                    {alreadyAdded ? '✓ Request Sent' : 'Add Contact'}
                                                </button>
                                            )}
                                            {alreadyContact && (
                                                <div className="w-full py-2 text-center text-xs text-gray-400 font-semibold">Already in contacts</div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* My Contacts */}
                    {!query.trim() && contacts.length > 0 && (
                        <div>
                            <h2 className="text-xl font-black text-gray-900 dark:text-white mb-6">My Contacts</h2>
                            <div className="flex flex-col gap-2">
                                {contacts.map((c, i) => (
                                    <div
                                        key={i}
                                        onClick={() => {
                                            setActiveChatPartner({
                                                id: c.partner.id,
                                                username: c.partner.username,
                                                email: c.partner.email,
                                                public_key: c.partner.public_key,
                                                avatar_seed: c.partner.avatar_seed,
                                                avatar_salt: c.partner.avatar_salt,
                                                avatar_style: c.partner.avatar_style
                                            });
                                        }}
                                        className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl p-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors cursor-pointer group"
                                    >
                                        <Avatar
                                            seed={(c.partner.avatar_seed || c.partner.id) + (c.partner.avatar_salt || '')}
                                            style={c.partner.avatar_style as any}
                                            size={40}
                                            className="shrink-0"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-gray-900 dark:text-white truncate">
                                                {c.partner.username}
                                            </div>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Contact</p>
                                        </div>
                                        <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transition-colors" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Empty State */}
                    {!query.trim() && contacts.length === 0 && suggestions.length === 0 && (
                        <div className="text-center py-24 text-gray-300 dark:text-gray-700">
                            <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
                            <p className="font-semibold">No contacts yet</p>
                            <p className="text-sm mt-1">Search for users to add them as contacts.</p>
                        </div>
                    )}
                    </div>

                    {/* BottomSheet chat for compact/mobile */}
                    <BottomSheet
                        isOpen={!!activeChatPartner}
                        onClose={() => setActiveChatPartner(null)}
                        title={activeChatPartner?.username || 'Chat'}
                        snapHeight="85vh"
                    >
                        {activeChatPartner && (
                            <ChatPanel
                                privateKey={privateKey}
                                onOpenFile={onOpenFile}
                                onOpenCalendar={onOpenCalendar}
                                onOpenProfile={onOpenProfile}
                                onFileCreated={() => {}}
                                activePartner={activeChatPartner}
                                onChatSelect={() => {}}
                            />
                        )}
                    </BottomSheet>
                </>
            ) : (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* Search Results */}
                {query.trim() && (
                    results.length > 0 ? (
                        <div className="mb-16">
                            <h2 className="text-xl font-black text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                                Search Results
                                <span className="text-xs py-0.5 px-2 bg-gray-100 dark:bg-white/10 rounded-full font-bold text-gray-500">{results.length}</span>
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {results.map((r, i) => {
                                    const alreadyContact = contacts.some(c => c.partner.id === (r.owner_id || r.id));
                                    const alreadyAdded = addedContacts[r.owner_id || r.id];
                                    return (
                                        <div
                                            key={i}
                                            onClick={() => onOpenProfile(r.owner_id || r.id, r.username)}
                                            className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl p-5 hover:shadow-lg hover:border-blue-200 dark:hover:border-blue-500/30 transition-all cursor-pointer group flex items-start gap-4"
                                        >
                                            <Avatar
                                                seed={(r.avatar_seed || r.username || r.owner_id || r.id) + (r.avatar_salt || '')}
                                                style={r.avatar_style}
                                                size={48}
                                                className="shrink-0 transition-transform group-hover:scale-110"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 mb-0.5">
                                                    <h3 className="font-bold text-gray-900 dark:text-white truncate">
                                                        {r.username || r.title || 'User'}
                                                    </h3>
                                                    {r.owner_is_verified && (
                                                        <CheckCircle2 className="w-4 h-4 fill-green-500 text-white shrink-0" />
                                                    )}
                                                </div>
                                                {r.title && r.title !== r.username && (
                                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">{r.title}</p>
                                                )}
                                                {r.type === 'profile' && r.bio && (
                                                    <p className="text-xs text-gray-500 line-clamp-1 italic">"{r.bio}"</p>
                                                )}
                                            </div>
                                            {!alreadyContact && (
                                                <button
                                                    onClick={(e) => handleAddContact(e, r.owner_id || r.id)}
                                                    disabled={alreadyAdded}
                                                    className={`p-2 -mr-2 -mt-2 rounded-xl transition-colors shrink-0 ${alreadyAdded ? 'text-green-500 cursor-default' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10'}`}
                                                    title={alreadyAdded ? 'Request Sent' : 'Add Contact'}
                                                >
                                                    {alreadyAdded ? <Check className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : !isSearching ? (
                        <div className="text-center py-12 mb-12 bg-gray-50 dark:bg-white/5 rounded-3xl border border-dashed border-gray-200 dark:border-white/10">
                            <p className="text-gray-400 font-medium">No results found for "{query}"</p>
                            <p className="text-xs text-gray-300 dark:text-gray-600 mt-2">Users only appear when their profile is set to public.</p>
                        </div>
                    ) : null
                )}

                {/* Suggestions */}
                {!query.trim() && suggestions.length > 0 && (
                    <div className="mb-16">
                        <h2 className="text-xl font-black text-gray-900 dark:text-white mb-6">Discover People</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {suggestions.map((s, i) => {
                                const alreadyContact = contacts.some(c => c.partner.id === (s.owner_id || s.id));
                                const alreadyAdded = addedContacts[s.owner_id || s.id];
                                return (
                                    <div
                                        key={`sug-${i}`}
                                        onClick={() => s?.id && onOpenProfile(s.owner_id || s.id, s.username)}
                                        className={`bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-3xl p-6 hover:shadow-lg transition-all flex flex-col gap-4 cursor-pointer ${alreadyContact ? 'hidden' : ''}`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <Avatar
                                                seed={(s?.avatar_seed || s?.username || `placeholder-${i}`) + (s?.avatar_salt || '')}
                                                style={s?.avatar_style}
                                                size={56}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <h3 className="font-black text-gray-900 dark:text-white truncate flex items-center gap-1">
                                                    {s?.username || `Community Member`}
                                                    {s?.owner_is_verified && <CheckCircle2 className="w-4 h-4 fill-green-500 text-white shrink-0" />}
                                                </h3>
                                                {s?.title && (
                                                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest truncate">{s.title}</p>
                                                )}
                                            </div>
                                        </div>
                                        {!alreadyContact && s?.id && (
                                            <button
                                                onClick={(e) => handleAddContact(e, s.owner_id || s.id)}
                                                disabled={alreadyAdded}
                                                className={`w-full py-2.5 rounded-xl font-bold text-sm transition-opacity ${alreadyAdded ? 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400 cursor-default' : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90'}`}
                                            >
                                                {alreadyAdded ? '✓ Request Sent' : 'Add Contact'}
                                            </button>
                                        )}
                                        {alreadyContact && (
                                            <div className="w-full py-2 text-center text-xs text-gray-400 font-semibold">Already in contacts</div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* My Contacts */}
                {!query.trim() && contacts.length > 0 && (
                    <div>
                        <h2 className="text-xl font-black text-gray-900 dark:text-white mb-6">My Contacts</h2>
                        <div className={compact ? 'flex flex-col gap-2' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'}>
                            {contacts.map((c, i) => (
                                <motion.div key={c.partner.id} layoutId={`contact-${c.partner.id}`}>
                                <div
                                    onClick={() => {
                                        setActiveChatPartner({
                                            id: c.partner.id,
                                            username: c.partner.username,
                                            email: c.partner.email,
                                            public_key: c.partner.public_key,
                                            avatar_seed: c.partner.avatar_seed,
                                            avatar_salt: c.partner.avatar_salt,
                                            avatar_style: c.partner.avatar_style
                                        });
                                        setProfileExpanded(true);
                                        if (!compact) setIsChatMode(true);
                                    }}
                                    className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl p-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors cursor-pointer group"
                                >
                                    <Avatar
                                        seed={(c.partner.avatar_seed || c.partner.id) + (c.partner.avatar_salt || '')}
                                        style={c.partner.avatar_style as any}
                                        size={40}
                                        className="shrink-0"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-gray-900 dark:text-white truncate">
                                            {c.partner.username}
                                        </div>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Contact</p>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transition-colors" />
                                </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Empty State */}
                {!query.trim() && contacts.length === 0 && suggestions.length === 0 && (
                    <div className="text-center py-24 text-gray-300 dark:text-gray-700">
                        <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <p className="font-semibold">No contacts yet</p>
                        <p className="text-sm mt-1">Search for users to add them as contacts.</p>
                    </div>
                )}
                </div>
            )}

            {/* Search form at bottom for compact mode */}
            {compact && (
                <div className="mt-auto pt-4 pb-2 px-1">
                    {searchForm}
                </div>
            )}
            </>
        )}
        </div>
        </LayoutGroup>
    );
}
