import React, { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import Avatar from '@/components/Profile/Avatar';
import { Search, Loader2, UserPlus, Check, ChevronRight, CheckCircle2, X, Bell, Users } from 'lucide-react';
import { useDataStore } from '@/store/useDataStore';

interface SearchResult {
    type: string;
    id: string;
    title: string;
    username: string;
    owner_id: string;
    owner_is_verified: boolean;
    bio: string;
    avatar_seed: string;
    avatar_style: 'notionists' | 'openPeeps';
}

interface SocialHubProps {
    onOpenProfile: (userId: string, username: string) => void;
    userProfile: { username: string; email: string; avatar_seed?: string; avatar_salt?: string; avatar_style?: string; bio?: string; title?: string; id?: string; user_id?: string; is_verified?: boolean } | null;
}

export default function SocialHub({ onOpenProfile, userProfile }: SocialHubProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [contacts, setContacts] = useState<any[]>([]);
    const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
    const [nicoSuggestion, setNicoSuggestion] = useState<SearchResult | null>(null);
    const [activeSection, setActiveSection] = useState<'search' | 'contacts'>('search');
    const [pendingRequests, setPendingRequests] = useState<any[]>([]);
    const [showRequests, setShowRequests] = useState(false);

    const { myId } = useDataStore();

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                // Fetch contacts
                const res = await apiFetch('/api/v1/contacts');
                if (res.ok) {
                    const data = await res.json();
                    setContacts(data.filter((c: any) => c.status === 'accepted'));
                }

                // Fetch Suggestions (Random)
                const sugRes = await apiFetch('/api/v1/profiles/suggestions');
                if (sugRes.ok) {
                    setSuggestions(await sugRes.json());
                }

                // Fetch Nico (Hardcoded)
                const nicoRes = await apiFetch('/api/v1/search?q=nico.heerwagen.mail@gmail.com');
                if (nicoRes.ok) {
                    const nicoData = await nicoRes.json();
                    if (nicoData && nicoData.length > 0) {
                        setNicoSuggestion(nicoData[0]);
                    }
                }
                // Fetch Pending Requests
                const reqRes = await apiFetch('/api/v1/contacts/requests');
                if (reqRes.ok) {
                    setPendingRequests(await reqRes.json());
                }
            } catch (e) {
                console.error("Failed to load hub data", e);
            }
        };
        fetchInitialData();
    }, []);

    const handleAcceptRequest = async (requestId: string) => {
        try {
            const res = await apiFetch(`/api/v1/contacts/accept/${requestId}`, { method: 'POST' });
            if (res.ok) {
                setPendingRequests(prev => prev.filter(r => r.id !== requestId));
                // Refresh contacts
                const cRes = await apiFetch('/api/v1/contacts');
                if (cRes.ok) setContacts(await cRes.json());
            }
        } catch (e) {
            console.error("Failed to accept request", e);
        }
    };

    const handleDeclineRequest = async (requestId: string) => {
        try {
            const res = await apiFetch(`/api/v1/contacts/${requestId}`, { method: 'DELETE' });
            if (res.ok) {
                setPendingRequests(prev => prev.filter(r => r.id !== requestId));
            }
        } catch (e) {
            console.error("Failed to decline request", e);
        }
    };

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
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
            console.error("Search error", e);
            setResults([]);
        } finally {
            setIsSearching(false);
            setActiveSection('search');
        }
    };

    const handleAddContact = async (e: React.MouseEvent, userId: string) => {
        e.stopPropagation();
        try {
            await apiFetch(`/api/v1/contacts/${userId}`, { method: 'POST' });
            alert("Contact request sent");
        } catch (error) {
            console.error("Failed to add contact", error);
            alert("Failed to add contact");
        }
    };

    return (
        <div className="max-w-5xl mx-auto py-12 px-8 min-h-screen">
            {/* Header & Own Profile */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-8 mb-8">
                <div className="flex-1">
                    <h1 className="text-4xl font-black text-gray-900 dark:text-white mb-6">Social</h1>
                    <div className="relative w-full max-w-2xl group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                        </div>
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyUp={(e) => e.key === 'Enter' && handleSearch(e as any)}
                            placeholder="Search users by name, email, or title..."
                            className="w-full bg-white dark:bg-black/40 border-2 border-gray-100 dark:border-white/10 rounded-2xl py-4 pl-12 pr-4 text-gray-900 dark:text-white font-medium outline-none focus:border-blue-500 transition-all shadow-sm focus:shadow-md"
                        />
                        <div className="absolute inset-y-2 right-2 flex items-center gap-2">
                            {pendingRequests.length > 0 && (
                                <button
                                    onClick={() => setShowRequests(!showRequests)}
                                    className={`relative p-3 rounded-xl transition-all ${showRequests ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-white/10 text-gray-500 hover:bg-gray-200 dark:hover:bg-white/20'}`}
                                    title="Contact Requests"
                                >
                                    <Bell className="w-5 h-5" />
                                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white dark:border-gray-900 animate-pulse">
                                        {pendingRequests.length}
                                    </span>
                                </button>
                            )}
                            {query && (
                                <button 
                                    onClick={handleSearch}
                                    className="px-6 h-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
                                >
                                    {isSearching ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Search"}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Contact Requests Popover */}
                    {showRequests && pendingRequests.length > 0 && (
                        <div className="absolute z-50 mt-4 w-full max-w-md bg-white dark:bg-[#1a1c1e] border border-gray-100 dark:border-white/10 rounded-[2rem] shadow-2xl p-6 animate-in fade-in zoom-in duration-200 origin-top">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-black text-gray-900 dark:text-white">Requests</h3>
                                <button onClick={() => setShowRequests(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition-colors">
                                    <X className="w-5 h-5 text-gray-400" />
                                </button>
                            </div>
                            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {pendingRequests.map((req, i) => (
                                    <div key={i} className="bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 rounded-2xl p-4 flex items-center gap-4 group">
                                        <Avatar seed={req.avatar_seed || req.user_id} style={req.avatar_style} size={44} />
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-gray-900 dark:text-white truncate">{req.username || "New Friend"}</p>
                                            <p className="text-xs text-gray-500">Contact Request</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => handleAcceptRequest(req.id)}
                                                className="p-2 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-colors shadow-lg shadow-green-500/20"
                                            >
                                                <Check className="w-4 h-4" />
                                            </button>
                                            <button 
                                                onClick={() => handleDeclineRequest(req.id)}
                                                className="p-2 bg-white dark:bg-white/10 text-gray-400 dark:text-gray-500 rounded-xl hover:bg-gray-100 dark:hover:bg-white/20 transition-colors"
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

                {userProfile && (
                    <div className="flex flex-col items-center bg-gray-50/50 dark:bg-white/5 p-6 rounded-[2.5rem] border border-gray-100 dark:border-white/10 min-w-[200px]">
                        <Avatar 
                            seed={(userProfile.avatar_seed || userProfile.username) + (userProfile.avatar_salt || '')} 
                            style={userProfile.avatar_style as any}
                            size={100} 
                            className="mb-4" 
                        />
                        <div className="text-center">
                            <h2 className="font-black text-gray-900 dark:text-white text-lg flex items-center justify-center gap-1">
                                {userProfile.username}
                                {userProfile.is_verified && <CheckCircle2 className="w-4 h-4 fill-green-500 text-white" />}
                            </h2>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] mt-1">{userProfile.title || "Explorer"}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Content Area */}
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* Pending Requests Section */}
                {pendingRequests.length > 0 && (
                    <div className="mb-12 bg-blue-50/50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/20 rounded-[2.5rem] p-8">
                        <h2 className="text-xl font-black text-blue-900 dark:text-blue-100 mb-6 flex items-center gap-2">
                            Contact Requests
                            <span className="text-xs py-0.5 px-2 bg-blue-100 dark:bg-blue-500/20 rounded-full font-bold text-blue-600">{pendingRequests.length}</span>
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {pendingRequests.map((req, i) => (
                                <div key={i} className="bg-white dark:bg-black/40 border border-blue-100 dark:border-blue-500/10 rounded-2xl p-4 flex items-center gap-4">
                                    <Avatar seed={req.avatar_seed || req.user_id} style={req.avatar_style} size={40} />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-gray-900 dark:text-white truncate">{req.username || "New Request"}</p>
                                        <p className="text-xs text-gray-500">sent you a contact request</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => handleAcceptRequest(req.id)}
                                            className="p-2 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-colors"
                                            title="Accept"
                                        >
                                            <Check className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={() => handleDeclineRequest(req.id)}
                                            className="p-2 bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400 rounded-xl hover:bg-gray-200 transition-colors"
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
                {query && results.length > 0 ? (
                    <div className="mb-16">
                        <h2 className="text-xl font-black text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                             Search Results
                            <span className="text-xs py-0.5 px-2 bg-gray-100 dark:bg-white/10 rounded-full font-bold text-gray-500">{results.length}</span>
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {results.map((r, i) => (
                                <div
                                    key={i}
                                    onClick={() => onOpenProfile(r.owner_id || r.id, r.username)}
                                    className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl p-5 hover:shadow-lg hover:border-blue-200 dark:hover:border-blue-500/30 transition-all cursor-pointer group flex items-start gap-4"
                                >
                                    <Avatar seed={r.avatar_seed || r.username || r.owner_id || r.id} style={r.avatar_style} size={48} className="shrink-0 transition-transform group-hover:scale-110" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                            <h3 className="font-bold text-gray-900 dark:text-white truncate">
                                                {r.username || r.title || 'User'}
                                            </h3>
                                            {r.owner_is_verified && (
                                                <div className="text-green-500 shrink-0" title="Verified">
                                                    <CheckCircle2 className="w-4 h-4 fill-green-500 text-white" />
                                                </div>
                                            )}
                                        </div>
                                        {r.title && r.title !== r.username && (
                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">{r.title}</p>
                                        )}
                                        {r.type === 'profile' && r.bio && <p className="text-xs text-gray-500 line-clamp-1 italic">"{r.bio}"</p>}
                                    </div>
                                    <button
                                        onClick={(e) => handleAddContact(e, r.owner_id || r.id)}
                                        className="p-2 -mr-2 -mt-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-xl transition-colors shrink-0"
                                    >
                                        <UserPlus className="w-5 h-5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : query && !isSearching && results.length === 0 ? (
                    <div className="text-center py-12 mb-12 bg-gray-50 dark:bg-white/5 rounded-3xl border border-dashed border-gray-200 dark:border-white/10">
                        <p className="text-gray-400 font-medium">No results found for "{query}"</p>
                    </div>
                ) : null}

                {/* Suggestions Section */}
                {!query && (
                    <div className="mb-16">
                        <h2 className="text-xl font-black text-gray-900 dark:text-white mb-6">Discover People</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {nicoSuggestion && (
                                <div 
                                    onClick={() => onOpenProfile(nicoSuggestion.owner_id || nicoSuggestion.id, nicoSuggestion.username)}
                                    className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-6 text-white shadow-xl shadow-blue-500/20 cursor-pointer hover:scale-[1.02] transition-transform group relative overflow-hidden"
                                >
                                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <Avatar seed={nicoSuggestion.avatar_seed} size={120} />
                                    </div>
                                    <div className="relative z-10 flex flex-col h-full">
                                        <div className="flex items-center gap-3 mb-4">
                                            <Avatar seed={nicoSuggestion.avatar_seed} style={nicoSuggestion.avatar_style} size={48} className="border-2 border-white/20" />
                                            <div>
                                                <h3 className="font-bold text-lg flex items-center gap-1">
                                                    {nicoSuggestion.username}
                                                    {nicoSuggestion.owner_is_verified && <CheckCircle2 className="w-4 h-4 fill-green-400 text-blue-700" />}
                                                </h3>
                                                <p className="text-xs text-blue-100 font-bold uppercase tracking-wider">Tide Lead Architect</p>
                                            </div>
                                        </div>
                                        <p className="text-sm text-blue-50/80 line-clamp-2 mt-auto">System maintainer and core developer.</p>
                                    </div>
                                </div>
                            )}
                            {/* Fill with random suggestions or placeholders */}
                            {(suggestions.length > 0 ? suggestions : Array.from({ length: suggestions.length < 2 ? 3 : 0 })).map((s: any, i) => (
                                <div 
                                    key={`sug-${i}`}
                                    onClick={() => s?.id && onOpenProfile(s.owner_id || s.id, s.username)}
                                    className={`bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-3xl p-6 hover:shadow-lg transition-all flex flex-col gap-4 ${s?.id ? 'cursor-pointer' : 'opacity-50 grayscale cursor-not-allowed'}`}
                                >
                                    <div className="flex items-center gap-4">
                                        <Avatar seed={s?.avatar_seed || `placeholder-${i}`} style={s?.avatar_style} size={56} />
                                        <div className="min-w-0">
                                            <h3 className="font-black text-gray-900 dark:text-white truncate flex items-center gap-1">
                                                {s?.username || `Community Member ${i+1}`}
                                                {s?.owner_is_verified && <CheckCircle2 className="w-4 h-4 fill-green-500 text-white" />}
                                            </h3>
                                            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest truncate">{s?.title || "Active User"}</p>
                                        </div>
                                    </div>
                                    {s?.id && (
                                        <button
                                            onClick={(e) => handleAddContact(e, s.owner_id || s.id)}
                                            className="w-full py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity"
                                        >
                                            Add Contact
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Contacts Section */}
                {!query && contacts.length > 0 && (
                    <div>
                        <h2 className="text-xl font-black text-gray-900 dark:text-white mb-6">My Contacts</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {contacts.map((c, i) => (
                                <div
                                    key={i}
                                    onClick={() => onOpenProfile(c.partner.id, c.partner.username)}
                                    className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl p-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors cursor-pointer group"
                                >
                                    <Avatar seed={c.partner.avatar_seed || c.partner.id} style={c.partner.avatar_style} size={40} className="shrink-0" />
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
            </div>
        </div>
    );
}
