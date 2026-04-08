"use client";

import { useState, useEffect, useRef } from "react";
import { MessageSquare, Search, UserPlus, X, Send, FileText, Share2, CheckCircle, XCircle, FolderOpen, ChevronRight, ChevronDown, Folder, Calendar, Trash } from "lucide-react";
import { useIslandStore } from "@/components/extensions/smart_island/useIslandStore";
import { apiFetch, getApiBase } from "@/lib/api";
import * as cryptoLib from "@/lib/crypto";
import Avatar from '@/components/Profile/Avatar';

interface Message {
    id: string;
    sender_id: string;
    recipient_id: string;
    content: string;
    status?: string;
    created_at: string;
}

interface UserBasic {
    id: string;
    username: string;
    email: string;
    avatar_seed?: string;
    avatar_salt?: string;
}

interface Contact {
    contact_row_id: string;
    partner: UserBasic;
}

interface ChatPanelProps {
    privateKey: CryptoKey | null;
    onOpenFile: (fileId: string, title: string, fileData?: any) => void;
    onFileCreated?: (file: any) => void;
    activePartner?: { id: string; username: string; email: string };
    onChatSelect?: (partnerId: string, partnerName: string, partnerEmail: string) => void;
    onAccept?: () => void;
    onOpenCalendar?: () => void;
    onOpenProfile?: (userId: string, username: string) => void;
}

interface ProfileTreeProps {
    items: any[];
    parentId: string | null;
    onSelect: (file: any) => void;
    level?: number;
}
function ProfileTree({ items, parentId, onSelect, level = 0 }: ProfileTreeProps) {
    const children = parentId === null
        ? items.filter(f => f.parent_id === null || !items.some(p => p.id === f.parent_id))
        : items.filter(f => f.parent_id === parentId);
    const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

    if (children.length === 0) return null;

    return (
        <div className="flex flex-col">
            {children.map(f => {
                const isFolder = f.type === 'folder';
                const isExpanded = expandedFolders[f.id];
                const title = f.public_meta?.title || f.title || "Untitled";

                if (isFolder) {
                    return (
                        <div key={f.id} className="flex flex-col">
                            <div
                                onClick={() => setExpandedFolders(prev => ({ ...prev, [f.id]: !prev[f.id] }))}
                                className="flex items-center gap-1 p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded cursor-pointer group"
                                style={{ paddingLeft: `${level * 12 + 4}px` }}
                            >
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                <Folder size={14} className="text-blue-500" />
                                <span className="text-xs font-semibold truncate">{title}</span>
                            </div>
                            {isExpanded && (
                                <ProfileTree items={items} parentId={f.id} onSelect={onSelect} level={level + 1} />
                            )}
                        </div>
                    );
                }

                return (
                    <div
                        key={f.id}
                        onClick={() => onSelect(f)}
                        className="flex items-center gap-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded cursor-pointer group"
                        style={{ paddingLeft: `${level * 12 + 20}px` }}
                    >
                        <FileText size={14} className="text-gray-400 group-hover:text-black dark:group-hover:text-white" />
                        <span className="text-xs truncate group-hover:text-black dark:group-hover:text-white">{title}</span>
                    </div>
                );
            })}
        </div>
    );
}

export default function ChatPanel({ privateKey, onOpenFile, onOpenCalendar, onOpenProfile, onFileCreated, activePartner, onChatSelect, onAccept }: ChatPanelProps) {
    const [view, setView] = useState<'contacts' | 'search' | 'shared'>('contacts');
    const [showActionsMenu, setShowActionsMenu] = useState(false);

    // Data
    const [contacts, setContacts] = useState<Contact[]>([]);


    // Chat State
    const [partner, setPartner] = useState<UserBasic | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState("");

    // Search State
    const [searchEmail, setSearchEmail] = useState("");
    const [searchResult, setSearchResult] = useState<any[]>([]);
    const [searchError, setSearchError] = useState("");

    // Profile State
    const [publicFiles, setPublicFiles] = useState<any[]>([]);
    const [sharedFiles, setSharedFiles] = useState<any[]>([]);
    const [allSharedFiles, setAllSharedFiles] = useState<any[]>([]);
    const [myId, setMyId] = useState("");
    const cryptoLib = require("@/lib/crypto");

    // Close dropdown when clicking outside
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowActionsMenu(false);
            }
        }

        if (showActionsMenu) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showActionsMenu]);

    useEffect(() => {
        const storedId = sessionStorage.getItem("tide_user_id");
        if (storedId) setMyId(storedId);
    }, []);

    // Sync activePartner prop to internal state
    useEffect(() => {
        if (activePartner) {
            setPartner(activePartner);
        }
    }, [activePartner]);

    const fetchContacts = async () => {
        try {
            const res = await apiFetch("/api/v1/contacts");
            if (res.ok) {
                const data = await res.json().catch(() => null);
                if (Array.isArray(data)) setContacts(data);
            }
        } catch (e) { console.error(e); }
    };

    interface FileData {
        id: string;
        title?: string;
        type: string;
        size: number;
        updated_at: string;
        owner_id: string;
        owner_email?: string;
        share_status?: string;
        visibility?: string;
        secured_meta?: string;
        public_meta?: { title?: string };
    }

    interface DecryptedShare extends FileData {
        ownerEmail: string;
        title: string;
        share_status?: string;
    }

    const fetchAllSharedFiles = async () => {
        try {
            const url = myId ? `/api/v1/files?user_id=${myId}` : "/api/v1/files";
            const res = await apiFetch(url);
            if (res.ok) {
                const allFiles: FileData[] = await res.json().catch(() => []);
                if (!Array.isArray(allFiles)) {
                    console.error("[ChatPanel] Expected array for files, got:", allFiles);
                    return;
                }
                // Filter files shared with me (owner_id is not me)
                // We KEEP pending shares to show them in the list with Accept/Decline options
                const sharedWithMe = allFiles.filter(f => f.owner_id !== myId);

                const decryptedShares: DecryptedShare[] = [];
                for (const f of sharedWithMe) {
                    try {
                        if (privateKey && f.secured_meta) {
                            const securedMetaBase64 = typeof f.secured_meta === 'string'
                                ? f.secured_meta
                                : cryptoLib.arrayBufferToBase64(new Uint8Array(f.secured_meta).buffer as ArrayBuffer);
                            const meta = await cryptoLib.decryptMetadata(securedMetaBase64, privateKey);
                            decryptedShares.push({
                                ...f,
                                title: meta.title,
                                ownerEmail: f.owner_email || "Unknown"
                            } as DecryptedShare);
                        } else {
                            decryptedShares.push({
                                ...f,
                                title: "Untitled",
                                ownerEmail: f.owner_email || "Unknown"
                            } as DecryptedShare);
                        }
                    } catch (e) {
                        decryptedShares.push({
                            ...f,
                            title: "Untitled",
                            ownerEmail: f.owner_email || "Unknown"
                        } as DecryptedShare);
                    }
                }
                setAllSharedFiles(decryptedShares);
            }
        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        if (myId) {
            fetchContacts();
            fetchAllSharedFiles();
        }
    }, [myId]);

    const handleSearch = async () => {
        setSearchResult([]);
        setSearchError("");
        try {
            const res = await apiFetch(`/api/v1/search?q=${encodeURIComponent(searchEmail)}`);
            if (res.ok) {
                const results = await res.json();
                setSearchResult(results);
                if (results.length === 0) setSearchError("No results found");
            } else {
                setSearchError("Error searching");
            }
        } catch (e) { setSearchError("Error searching"); }
    };

    // Feedback State
    const [processedRequests, setProcessedRequests] = useState<Record<string, 'accepted' | 'declined'>>({});

    const handleCopyAndOpen = async (file: any) => {
        try {
            // Check if we already have it? (Simplistic: just copy)
            const res = await apiFetch(`/api/v1/files/${file.id}/copy`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    new_owner_id: myId,
                    target_parent_id: null
                })
            });

            if (res.ok) {
                const newFile = await res.json();

                // 1. Update Parent State (Fix Race Condition)
                if (onFileCreated) {
                    onFileCreated(newFile);
                }

                // 2. Open File
                // Use newFile.id and ensure we use the title from public_meta or title prop
                const title = newFile.public_meta?.title || file.title || "Untitled";
                onOpenFile(newFile.id, title, newFile);
            } else {
                alert("Failed to copy file");
            }
        } catch (e) {
            console.error(e);
            alert("Error copying file");
        }
    };

    const handleDeleteConversation = async () => {
        if (!partner) return;
        if (!confirm(`Are you sure you want to delete the conversation with ${partner.username}? This cannot be undone.`)) return;

        try {
            const query = partner.email === "Hidden" 
                ? `partner_id=${partner.id}`
                : `partner_email=${encodeURIComponent(partner.email)}`;
                
            const res = await apiFetch(`/api/v1/messages/conversation?${query}`, {
                method: "DELETE"
            });

            if (res.ok) {
                setMessages([]);
                setPartner(null);
                fetchContacts(); // Refresh contact list to update the conversation previews
            } else {
                alert("Failed to delete conversation");
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleAccept = async (fileId: string, messageId?: string) => {
        try {
            await apiFetch(`/api/v1/files/${fileId}/accept`, {
                method: "POST"
            });

            // Update persistent status if from a message
            if (messageId) {
                await apiFetch(`/api/v1/messages/${messageId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: 'accepted' })
                });
            }

            // Update local state for immediate feedback
            setProcessedRequests(prev => ({ ...prev, [fileId]: 'accepted' }));
            if (messageId) {
                setMessages(prev => prev.map(m => m.id === messageId ? { ...m, status: 'accepted' } : m));
            }

            // Refresh lists
            fetchAllSharedFiles();
            if (partner) fetchPartnerFiles(partner.id);
            if (onAccept) onAccept();
        } catch (e) { alert("Error"); }
    };

    const handleDecline = async (fileId: string, messageId?: string) => {
        if (!confirm("Decline and remove this share?")) return;
        try {
            const res = await apiFetch(`/api/v1/files/${fileId}`, {
                method: "DELETE"
            });
            if (res.ok) {
                // Update persistent status if from a message
                if (messageId) {
                    await apiFetch(`/api/v1/messages/${messageId}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: 'declined' })
                    });
                }

                setProcessedRequests(prev => ({ ...prev, [fileId]: 'declined' }));
                if (messageId) {
                    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, status: 'declined' } : m));
                }

                fetchAllSharedFiles();
                if (partner) fetchPartnerFiles(partner.id);
            } else {
                alert("Failed to decline share");
            }
        } catch (e) { alert("Error declining share"); }
    };

    const startChat = (user: UserBasic) => {
        setPartner(user);
        fetchMessages(user.email);
        fetchPartnerFiles(user.id);
    };

    const fetchPartnerFiles = async (partnerId: string) => {
        try {
            // Public Files
            const resPub = await apiFetch(`/api/v1/files/public/${partnerId}`);
            if (resPub.ok) {
                const results: FileData[] = await resPub.json() || [];
                const decryptedPublic = results.map(f => {
                    // Parse public_meta if it's a string
                    let publicMeta = f.public_meta;
                    if (typeof publicMeta === 'string') {
                        try {
                            publicMeta = JSON.parse(publicMeta);
                        } catch (e) {
                            publicMeta = {};
                        }
                    }
                    return { ...f, title: publicMeta?.title || "Untitled", public_meta: publicMeta };
                });
                setPublicFiles(decryptedPublic);
            } else {
                setPublicFiles([]);
            }

            // Shared Files
            const url = myId ? `/api/v1/files?user_id=${myId}` : "/api/v1/files";
            const resShared = await apiFetch(url);
            if (resShared.ok) {
                const allFiles: FileData[] = await resShared.json() || [];
                const myShares = allFiles.filter(f => f.owner_id === partnerId);
                const decryptedShares: DecryptedShare[] = [];
                for (const f of myShares) {
                    try {
                        if (privateKey && f.secured_meta) {
                            const securedMetaBase64 = typeof f.secured_meta === 'string'
                                ? f.secured_meta
                                : cryptoLib.arrayBufferToBase64(new Uint8Array(f.secured_meta).buffer as ArrayBuffer);
                            const meta = await cryptoLib.decryptMetadata(securedMetaBase64, privateKey);
                            decryptedShares.push({ ...f, title: meta.title, ownerEmail: f.owner_email || "Unknown" } as DecryptedShare);
                        } else {
                            decryptedShares.push(f as DecryptedShare);
                        }
                    } catch (e) { decryptedShares.push(f as DecryptedShare); }
                }
                setSharedFiles(decryptedShares);
            } else {
                setSharedFiles([]);
            }
        } catch (e) { console.error(e); }
    };

    const fetchMessages = async (email: string, id?: string) => {
        try {
            const query = email === "Hidden" && id
                ? `partner_id=${id}`
                : `partner_email=${encodeURIComponent(email)}`;
                
            const res = await apiFetch(`/api/v1/messages/?${query}`);
            if (res.ok) {
                setMessages(await res.json() || []);
            }
        } catch (e) { console.error(e); }
    };

    // Fetch messages when partner changes or occasionally to refresh
    useEffect(() => {
        if (partner) {
            fetchMessages(partner.email, partner.id);
        }
    }, [partner, myId]);

    const partnerRef = useRef<UserBasic | null>(null);
    useEffect(() => { partnerRef.current = partner; }, [partner]);

    const { push: islandPush } = useIslandStore();
    const contactsRef = useRef<Contact[]>([]);
    useEffect(() => { contactsRef.current = contacts; }, [contacts]);

    // Prevent double-pushing same incoming message from multiple SSE events connecting/disconnecting
    const pushedMessageIdsRef = useRef<Set<string>>(new Set());

    // SSE Connection
    useEffect(() => {
        const token = sessionStorage.getItem("tide_session_token") || localStorage.getItem("tide_session_token");
        // Bypass Next.js proxy rewrite by calling the backend URL directly to prevent Next.js proxy timeout (ECONNRESET)
        const eventSource = new EventSource(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/events?user_id=${myId}&token=${token}`);

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'new_message' && data.message) {
                    const msg = data.message;
                    const currentPartner = partnerRef.current;

                    if (currentPartner && (msg.sender_id === currentPartner.id || msg.recipient_id === currentPartner.id)) {
                        setMessages(prev => {
                            if (prev.some(m => m.id === msg.id)) return prev;
                            return [...prev, msg];
                        });
                    }

                    // Push island notification if the message is incoming
                    if (msg.sender_id !== myId) {
                        const senderContact = contactsRef.current.find(c => c.partner.id === msg.sender_id);
                        const senderName = senderContact?.partner?.username || senderContact?.partner?.email || 'New message';

                        let shareData = null;
                        let previewText: string | undefined;
                        try {
                            const parsed = JSON.parse(msg.content);
                            if (parsed && parsed.type === 'file_share_request') {
                                shareData = parsed;
                            } else if (parsed?.type) {
                                previewText = undefined; // System message, no preview
                            }
                        } catch {
                            previewText = msg.content?.slice(0, 100);
                        }

                        if (shareData) {
                            islandPush({
                                type: 'interactive_card',
                                payload: {
                                    fileName: shareData.file_name || 'New Share',
                                    fileType: shareData.file_type || 'file',
                                    senderName: senderName,
                                    onAction: () => {
                                        if (shareData.file_type === 'event') {
                                            if (onOpenCalendar) onOpenCalendar();
                                        } else {
                                            if (onOpenFile) onOpenFile(shareData.file_id, shareData.file_name);
                                        }
                                    }
                                }
                            });
                        } else {
                            islandPush({
                                type: 'message',
                                payload: {
                                    senderName,
                                    text: previewText,
                                },
                            });
                        }
                    }
                } else if (data.type === 'contact_request') {
                    // Handled elsewhere
                } else if (data.type === 'contact_accepted') {
                    fetchContacts();
                } else if (['file_created', 'file_updated', 'file_deleted', 'file_shared'].includes(data.type)) {
                    fetchAllSharedFiles();
                }
            } catch (e) {
                console.error("SSE Parse Error", e);
            }
        };

        eventSource.onerror = (e) => {
            console.error("SSE Error", e);
            eventSource.close();
        };

        return () => {
            eventSource.close();
        };
    }, [myId]);

    const handleSend = async () => {
        if (!newMessage || !partner) return;
        try {
            const body: any = { content: newMessage };
            if (partner.email === "Hidden") {
                body.recipient_id = partner.id;
            } else {
                body.recipient_email = partner.email;
            }

            const res = await apiFetch("/api/v1/messages/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                const msg = await res.json();
                setMessages(prev => {
                    if (prev.some(m => m.id === msg.id)) return prev;
                    return [...prev, msg];
                });
                setNewMessage("");
            }
        } catch (e) { alert("Error sending"); }
    };

    const messagesEndRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    return (
        <div className="flex h-full bg-transparent relative gap-4 p-4">
            {/* Left Panel: Contacts - Hidden if activePartner is passed (Single Chat Mode) */}
            <div className={`w-72 glass-panel flex flex-col shrink-0 overflow-hidden ${activePartner ? 'hidden' : ''}`}>
                {/* Header */}
                <div className="p-4 border-b border-white/40">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Contacts</h2>
                        <div className="flex gap-1 relative" ref={dropdownRef}>
                            <button
                                onClick={() => setShowActionsMenu(!showActionsMenu)}
                                className="relative p-2 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg transition-colors"
                                title="Actions"
                            >
                                <UserPlus size={18} className="text-gray-600 dark:text-gray-400" />
                            </button>
                            <button
                                onClick={() => setView(view === 'shared' ? 'contacts' : 'shared')}
                                className={`p-2 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg transition-colors ${view === 'shared' ? 'bg-gray-100 dark:bg-gray-900' : ''}`}
                                title="Shared Files"
                            >
                                {view === 'shared' ? <X size={18} className="text-gray-600 dark:text-gray-400" /> : <FolderOpen size={18} className="text-gray-600 dark:text-gray-400" />}
                            </button>

                            {/* Dropdown Menu */}
                            {showActionsMenu && (
                                <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-xl z-50">
                                    <button
                                        onClick={() => {
                                            setView('search');
                                            setShowActionsMenu(false);
                                        }}
                                        className="w-full px-4 py-3 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-2 text-sm"
                                    >
                                        <Search size={16} />
                                        Add Contact
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    {view === 'contacts' ? (
                        <div className="p-2">
                            {contacts.length === 0 ? (
                                <div className="text-center py-12 px-4">
                                    <MessageSquare size={48} className="mx-auto mb-4 text-gray-300 dark:text-gray-700" />
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">No contacts yet</p>
                                    <button
                                        onClick={() => setView('search')}
                                        className="text-sm text-gray-900 dark:text-gray-100 underline hover:no-underline"
                                    >
                                        Add your first contact
                                    </button>
                                </div>
                            ) : (
                                contacts.map(c => (
                                    <div
                                        key={c.contact_row_id}
                                        className={`p-3 mb-1 rounded-lg cursor-pointer transition-all ${partner?.id === c.partner.id
                                            ? 'bg-gray-800/90 dark:bg-gray-200/90 text-white dark:text-black'
                                            : 'hover:bg-gray-100 dark:hover:bg-gray-900'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="cursor-pointer hover:opacity-80 transition-opacity shrink-0"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (onOpenProfile) onOpenProfile(c.partner.id, c.partner.username);
                                                }}
                                                title="View Profile"
                                            >
                                                <Avatar seed={(c.partner.avatar_seed || c.partner.id) + (c.partner.avatar_salt || '')} size={40} className="border border-gray-200 dark:border-gray-800" />
                                            </div>
                                            <div className="flex-1 overflow-hidden" onClick={() => {
                                                if (onChatSelect) {
                                                    onChatSelect(c.partner.id, c.partner.username, c.partner.email);
                                                } else {
                                                    startChat(c.partner);
                                                }
                                            }}>
                                                <div className="font-semibold text-sm truncate">{c.partner.username}</div>
                                                <div className={`text-xs truncate ${partner?.id === c.partner.id ? 'text-gray-300 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'}`}>{c.partner.email}</div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                    ) : view === 'search' ? (
                        <div className="p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-sm">Find Contacts</h3>
                                <button onClick={() => setView('contacts')} className="text-xs text-gray-500 hover:text-gray-900 dark:hover:text-gray-100">
                                    Back
                                </button>
                            </div>
                            <div className="flex gap-2 mb-4">
                                <input
                                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-800 dark:focus:ring-gray-200"
                                    placeholder="Email address"
                                    value={searchEmail}
                                    onChange={e => setSearchEmail(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                />
                                <button
                                    onClick={handleSearch}
                                    className="px-4 py-2 bg-gray-800 dark:bg-gray-200 text-white dark:text-black rounded-lg text-sm font-medium hover:opacity-80 transition-opacity"
                                >
                                    Search
                                </button>
                            </div>
                            {searchError && <p className="text-sm text-red-500 mb-4">{searchError}</p>}
                            {searchResult.map(res => {
                                if (res.type === 'profile') {
                                    return (
                                        <div key={`profile-${res.owner_id}`} className="p-3 mb-2 border border-gray-200 dark:border-gray-800 rounded-lg flex flex-col gap-2">
                                            <div className="flex items-center gap-2">
                                                <div className="font-semibold text-sm">{res.title || "User"}</div>
                                                {res.owner_is_verified && <CheckCircle size={14} className="text-green-500" />}
                                            </div>
                                            <div className="text-xs text-gray-500">{res.bio}</div>

                                            <div className="flex gap-2 mt-1">
                                                <button
                                                    onClick={() => {
                                                        if (onOpenProfile) onOpenProfile(res.owner_id, res.title || "User");
                                                    }}
                                                    className="w-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white py-2 rounded-lg text-xs font-bold transition-all"
                                                >
                                                    View Profile
                                                </button>
                                            </div>
                                        </div>
                                    );
                                } else {
                                    return (
                                        <div key={`note-${res.id}`} className="p-3 mb-2 border border-gray-200 dark:border-gray-800 rounded-lg flex flex-col gap-2 bg-gray-50 dark:bg-black/20">
                                            <div className="flex items-center gap-2">
                                                <FileText size={16} className="text-blue-500" />
                                                <div className="font-semibold text-sm truncate">{res.title}</div>
                                            </div>
                                            <div className="text-xs text-gray-500 flex items-center gap-1">
                                                Owner verified: {res.owner_is_verified ? <CheckCircle size={12} className="text-green-500" /> : <XCircle size={12} className="text-gray-400" />}
                                            </div>
                                            <button
                                                onClick={() => onOpenFile(res.id, res.title, null)}
                                                className="mt-1 w-full border border-blue-500 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 py-2 rounded-lg text-xs font-bold transition-colors"
                                            >
                                                View Public File
                                            </button>
                                        </div>
                                    );
                                }
                            })}
                        </div>
                    ) : (
                        <div className="p-4">
                            <div className="mb-4">
                                <h3 className="font-semibold text-sm">Shared Files</h3>
                                <p className="text-xs text-gray-500 mt-1">Files shared with you by contacts</p>
                            </div>
                            {allSharedFiles.length === 0 ? (
                                <p className="text-sm text-gray-500 text-center py-8">No shared files</p>
                            ) : (
                                <div className="space-y-2">
                                    {allSharedFiles.map(f => {
                                        // Try to find sender in contacts
                                        const senderContact = contacts.find(c => c.partner.email === f.ownerEmail);
                                        const senderName = senderContact ? senderContact.partner.username : (f.ownerEmail || "Unknown");

                                        return (
                                            <div
                                                key={f.id}
                                                className={`p-3 border rounded-lg transition-colors group ${(f.share_status || 'owner') === 'pending'
                                                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                                                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer'
                                                    }`}
                                                onClick={() => (f.share_status || 'owner') !== 'pending' && onOpenFile(f.id, f.title)}
                                            >
                                                <div className="flex items-start gap-2">
                                                    <FileText size={16} className={`${(f.share_status || 'owner') === 'pending' ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-600 dark:text-gray-400'} mt-0.5 flex-shrink-0`} />
                                                    <div className="flex-1 overflow-hidden">
                                                        <div className="text-sm font-medium truncate">{f.title || "Untitled"}</div>
                                                        <div className="text-xs text-gray-500 truncate">From: {senderName}</div>
                                                        <div className="flex justify-between items-center mt-1">
                                                            <div className="text-xs text-gray-400">{f.type}</div>
                                                            {(f.share_status || 'owner') === 'pending' && (
                                                                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                                                    <button
                                                                        onClick={() => handleAccept(f.id)}
                                                                        className="p-1 bg-green-500 hover:bg-green-600 text-white rounded shadow-sm"
                                                                        title="Accept"
                                                                    >
                                                                        <CheckCircle size={12} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDecline(f.id)}
                                                                        className="p-1 bg-red-500 hover:bg-red-600 text-white rounded shadow-sm"
                                                                        title="Decline"
                                                                    >
                                                                        <XCircle size={12} />
                                                                    </button>
                                                                </div>
                                                            )}
                                                            {(f.share_status || 'owner') !== 'pending' && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleDecline(f.id); }}
                                                                    className="p-1 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                                                    title="Remove Share"
                                                                >
                                                                    <XCircle size={12} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );

                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Right Panel: Chat */}
            <div className={`flex-1 flex flex-col glass-panel overflow-hidden ${!activePartner ? 'relative' : ''}`}>
                {partner ? (
                    <>
                        {/* Chat Header */}
                        <div className="p-4 border-b border-white/40 bg-transparent">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div
                                        className="cursor-pointer hover:opacity-80 transition-opacity shrink-0"
                                        onClick={() => { if (onOpenProfile && partner) onOpenProfile(partner.id, partner.username); }}
                                        title="View Profile"
                                    >
                                        <Avatar seed={(partner?.avatar_seed || partner?.id || "Unknown") + (partner?.avatar_salt || '')} size={40} className="border border-gray-200 dark:border-gray-800" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">{partner?.username}</h3>
                                        <p className="text-xs text-gray-500">{partner?.email}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleDeleteConversation}
                                        className="p-2 hover:bg-red-50 dark:hover:bg-red-950/30 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                                        title="Delete Conversation"
                                    >
                                        <Trash size={18} />
                                    </button>
                                    <button
                                        onClick={() => setPartner(null)}
                                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-lg transition-colors"
                                    >
                                        <X size={18} className="text-gray-600 dark:text-gray-400" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto px-4 py-3 bg-transparent">
                            <div className="max-w-4xl mx-auto w-full py-6 space-y-4">
                                {messages.length === 0 ? (
                                    <div className="h-full flex items-center justify-center text-gray-400 text-sm py-20">
                                        Keine Nachrichten vorhanden. Schreib etwas!
                                    </div>
                                ) : (
                                    messages.map((m, idx) => {
                                        const isMe = m.sender_id === myId;
                                        const mDate = new Date(m.created_at);
                                        const prevDate = idx > 0 ? new Date(messages[idx - 1].created_at) : null;

                                        const isNewDay = !prevDate ||
                                            mDate.getDate() !== prevDate.getDate() ||
                                            mDate.getMonth() !== prevDate.getMonth() ||
                                            mDate.getFullYear() !== prevDate.getFullYear();

                                        const getDateLabel = (date: Date) => {
                                            const now = new Date();
                                            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                                            const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                                            const diff = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

                                            if (diff === 0) return "Heute";
                                            if (diff === 1) return "Gestern";
                                            if (diff === 2) return "Vorgestern";
                                            if (diff < 7) {
                                                return new Intl.DateTimeFormat('de-DE', { weekday: 'long' }).format(date);
                                            }
                                            return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
                                        };

                                        // Check for file share request
                                        let isShareRequest = false;
                                        interface ShareRequestData {
                                            type: string;
                                            file_id: string;
                                            file_name: string;
                                            file_type: string;
                                            file_preview?: any;
                                        }
                                        let shareData: ShareRequestData | null = null;
                                        try {
                                            const parsed = JSON.parse(m.content);
                                            if (parsed && parsed.type === 'file_share_request') {
                                                isShareRequest = true;
                                                shareData = parsed as ShareRequestData;
                                            }
                                        } catch (e) { }

                                        return (
                                            <div key={m.id || idx} className="w-full">
                                                {isNewDay && (
                                                    <div className="flex items-center gap-4 my-8">
                                                        <div className="flex-1 h-[1px] bg-gray-100 dark:bg-gray-800"></div>
                                                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 whitespace-nowrap">
                                                            {getDateLabel(mDate)}
                                                        </span>
                                                        <div className="flex-1 h-[1px] bg-gray-100 dark:bg-gray-800"></div>
                                                    </div>
                                                )}
                                                <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} w-full`}>
                                                    <div
                                                        className={`rounded-3xl shadow-float-sm ${isMe
                                                            ? 'accent-gradient-primary text-gray-900 dark:text-gray-100 rounded-br-sm'
                                                            : 'bg-white/60 dark:bg-black/40 backdrop-blur-md border border-white/50 dark:border-white/10 text-gray-900 dark:text-gray-100 rounded-bl-sm'
                                                            } ${isShareRequest ? 'max-w-[280px] w-full overflow-hidden flex flex-col' : 'max-w-[75%] px-5 py-3'}`}
                                                    >
                                                        {isShareRequest && shareData ? (
                                                            <div className="flex flex-col h-full">
                                                                <div className={`p-4 flex flex-col gap-3 ${isMe ? 'bg-white/10' : 'bg-white/60 dark:bg-black/20'}`}>
                                                                    <div className="flex items-start gap-3">
                                                                        <div className={`p-2.5 rounded-xl shrink-0 ${shareData.file_type === 'event' ? 'bg-amber-100 dark:bg-amber-900/30' : (isMe ? 'bg-white/20' : 'bg-white dark:bg-blue-900/40')}`}>
                                                                            {shareData.file_type === 'event' ? (
                                                                                <Calendar size={20} className="text-amber-600 dark:text-amber-400" />
                                                                            ) : (
                                                                                <FileText size={20} className="text-gray-900 dark:text-gray-100" />
                                                                            )}
                                                                        </div>
                                                                        <div className="flex-1 overflow-hidden">
                                                                            <div className="text-[15px] font-bold truncate leading-tight text-gray-900 dark:text-gray-100">{shareData.file_name}</div>
                                                                            <div className="text-[9px] uppercase tracking-wider font-extrabold opacity-70 mt-1 text-gray-600 dark:text-gray-400">
                                                                                {shareData.file_type === 'event' ? 'Kalender Termin' : `${shareData.file_type.toUpperCase()} Paket`}
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Preview Section */}
                                                                    {shareData.file_preview && (
                                                                        <div className="mt-1">
                                                                            {shareData.file_type === 'event' ? (
                                                                                <div className={`space-y-1.5 p-3 rounded-lg text-xs leading-relaxed opacity-90 ${isMe ? 'bg-black/10' : 'bg-black/5 dark:bg-white/5'}`}>
                                                                                    <div className="font-semibold text-gray-900 dark:text-gray-100">{new Date(shareData.file_preview.start).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                                                                                    {shareData.file_preview.description && (
                                                                                        <div className="text-[11px] opacity-80 line-clamp-3 italic text-gray-900 dark:text-gray-100">"{shareData.file_preview.description}"</div>
                                                                                    )}
                                                                                </div>
                                                                            ) : shareData.file_preview ? (
                                                                                <div className={`p-3 rounded-lg text-[11px] leading-relaxed line-clamp-4 italic opacity-90 ${isMe ? 'bg-black/10' : 'bg-black/5 dark:bg-white/5'}`}>
                                                                                    "{typeof shareData.file_preview === 'string' ? shareData.file_preview : JSON.stringify(shareData.file_preview)}"
                                                                                </div>
                                                                            ) : null}
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                <div className={`px-4 pb-4 pt-3 mt-auto ${isMe ? '' : 'bg-white/30 dark:bg-black/10'}`}>
                                                                    {!isMe && (() => {
                                                                        const currentStatus = m.status || processedRequests[shareData.file_id];

                                                                        if (currentStatus === 'accepted') {
                                                                            return (
                                                                                <div className="w-full py-2 bg-green-500/10 text-green-700 dark:text-green-400 rounded-lg text-xs font-bold flex items-center justify-center gap-2 border border-green-500/20">
                                                                                    <CheckCircle size={14} /> Gespeichert
                                                                                </div>
                                                                            );
                                                                        }

                                                                        if (currentStatus === 'declined') {
                                                                            return (
                                                                                <div className="w-full py-2 bg-red-500/10 text-red-700 dark:text-red-400 rounded-lg text-xs font-bold flex items-center justify-center gap-2 border border-red-500/20">
                                                                                    <XCircle size={14} /> Abgelehnt
                                                                                </div>
                                                                            );
                                                                        }

                                                                        return (
                                                                            <button
                                                                                onClick={() => shareData && handleAccept(shareData.file_id, m.id)}
                                                                                className={`w-full py-2 rounded-lg text-[12px] font-bold transition-all flex items-center justify-center gap-2 shadow-sm ${shareData.file_type === 'event'
                                                                                    ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-200 dark:bg-amber-900/40 dark:hover:bg-amber-900/60 dark:text-amber-100 dark:border-amber-800'
                                                                                    : 'bg-blue-100 hover:bg-blue-200 text-blue-900 border border-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 dark:text-blue-100 dark:border-blue-800'
                                                                                    }`}
                                                                            >
                                                                                {shareData.file_type === 'event' ? (
                                                                                    <>
                                                                                        <Calendar size={14} /> Zum Kalender hinzufügen
                                                                                    </>
                                                                                ) : (
                                                                                    <>
                                                                                        <FileText size={14} /> Datei speichern
                                                                                    </>
                                                                                )}
                                                                            </button>
                                                                        );
                                                                    })()}
                                                                    {isMe && (
                                                                        <div className="text-[9px] text-center opacity-70 font-extrabold uppercase tracking-[0.2em] pt-1">
                                                                            Datenpaket übertragen
                                                                            {isShareRequest && shareData?.type === 'event' && (
                                                                                <div className="mt-2 text-right">
                                                                                    <div className={`text-[9px] mt-1.5 font-bold uppercase tracking-wider ${isMe ? 'text-white/60 text-right' : 'text-gray-500 dark:text-gray-400 text-right pr-2'}`}>
                                                                                        Event • {shareData.file_name || 'Unknown Date'}
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="text-[15px] leading-snug font-medium pr-1 break-words whitespace-pre-wrap">
                                                                {m.content}
                                                            </div>
                                                        )}


                                                        {!isShareRequest && (
                                                            <div className={`text-[9px] mt-1.5 font-bold uppercase tracking-wider ${isMe ? 'text-white/60 text-right' : 'text-gray-400 pr-4'}`}>
                                                                {mDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-4 bg-transparent pb-32">
                            <div className="flex gap-2">
                                <input
                                    className="flex-1 px-5 py-3 glass-input rounded-3xl text-sm outline-none"
                                    placeholder="Type a message..."
                                    value={newMessage}
                                    onChange={e => setNewMessage(e.target.value)}
                                    // Make sure hitting enter sends if not empty
                                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!newMessage.trim()}
                                    className="w-11 h-11 shrink-0 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded-full flex items-center justify-center transition-all shadow-md active:scale-95"
                                >
                                    <Send size={18} className={newMessage.trim() ? "ml-1" : ""} />
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="h-full flex items-center justify-center text-gray-400">
                        <div className="text-center">
                            <MessageSquare size={64} className="mx-auto mb-4 text-gray-300 dark:text-gray-700" />
                            <p className="text-lg font-medium mb-2">Select a conversation</p>
                            <p className="text-sm">Choose a contact from the list to start messaging</p>
                        </div>
                    </div>
                )}
            </div>

        </div>
    );
}
