"use client";

import React, { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import * as cryptoLib from '@/lib/crypto';
import { format } from 'date-fns';
import Avatar from './Avatar';
import { CheckCircle, FolderOpen, User, Link as LinkIcon, Calendar as CalendarIcon } from 'lucide-react';
import CalendarView from '../Calendar/CalendarView';

interface ProfilePageProps {
    userId: string;
    onOpenFile?: (fileId: string, title: string) => void;
    onMessage?: (userId: string) => void;
}

interface UserProfile {
    user_id: string;
    username: string;
    is_verified: boolean;
    avatar_seed: string;
    bio: string;
    title: string;
    avatar_salt: string;
    avatar_style: 'notionists' | 'openPeeps';
    profile_status: number;
}

import { useSocialStore } from '@/store/useSocialStore';

export default function ProfilePage({ userId, onOpenFile, onMessage }: ProfilePageProps) {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'about' | 'files' | 'calendar'>('about');
    const [publicFiles, setPublicFiles] = useState<any[]>([]);
    const [events, setEvents] = useState<any[]>([]);
    
    const { isContact: checkIsContact, sendRequest, pendingRequests, fetchContacts, hasSentRequest } = useSocialStore();
    const isContact = checkIsContact(userId);
    const isPending = pendingRequests.some(r => r.user_id === userId); // Request sent to me? Wait, this checks if they sent ME a request. What if I sent them one? We don't have outgoing requests in store yet. Let's just track locally or ignore.
    const requestSent = hasSentRequest(userId);
    const [myUserId, setMyUserId] = useState<string | null>(null);

    useEffect(() => {
        const fetchMe = async () => {
            try {
                const meRes = await apiFetch('/api/v1/auth/me');
                if (meRes.ok) {
                    const meData = await meRes.json();
                    setMyUserId(meData.id);
                }
            } catch (e) { }
        };
        fetchMe();
        fetchContacts();
    }, [userId, fetchContacts]);

    const toggleContact = async () => {
        try {
            if (isContact) {
                await apiFetch(`/api/v1/contacts/${userId}`, { method: 'DELETE' });
                // Note: a robust approach would be to refetch contacts or emit an event
                alert("Contact removed");
                window.location.reload();
            } else {
                if (requestSent) return;
                const success = await sendRequest(userId);
                if (success) {
                    alert("Contact request sent");
                } else {
                    alert("Failed to send contact request or already sent");
                }
            }
        } catch (e) {
            console.error("Failed to update contact", e);
        }
    };

    useEffect(() => {
        const fetchProfile = async () => {
            setLoading(true);
            try {
                const res = await apiFetch(`/api/v1/profiles/${userId}`);
                if (res.ok) {
                    setProfile(await res.json());
                }

                // Fetch public files for this user
                const filesRes = await apiFetch(`/api/v1/files/public/${userId}`);
                if (filesRes.ok) {
                    const filesData = await filesRes.json();

                    const decryptedPublic = (filesData || []).map((f: any) => {
                        let publicMeta = f.public_meta;
                        if (typeof publicMeta === 'string') {
                            try { publicMeta = JSON.parse(publicMeta); } catch { publicMeta = {}; }
                        }
                        return { ...f, title: publicMeta?.title || "Untitled", public_meta: publicMeta };
                    });

                    // Separate files and events
                    setPublicFiles(decryptedPublic.filter((f: any) => f.type !== 'event'));
                    setEvents(decryptedPublic.filter((f: any) => f.type === 'event'));
                } else {
                    setPublicFiles([]);
                    setEvents([]);
                }
            } catch (e) {
                console.error("Failed to load profile", e);
            } finally {
                setLoading(false);
            }
        };

        if (userId) {
            fetchProfile();
        }
    }, [userId]);

    const handleSaveEvent = async (id: string, updates: any) => {
        if (myUserId !== userId) return;

        try {
            const publicKeyStr = sessionStorage.getItem("tide_user_public_key");
            if (!publicKeyStr) return;
            const publicKey = await window.crypto.subtle.importKey(
                "spki", cryptoLib.base64ToArrayBuffer(publicKeyStr),
                { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]
            );

            const isOccurrence = id.includes('_');
            const baseId = isOccurrence ? id.split('_')[0] : id;
            const event = events.find(e => e.id === baseId);
            if (!event) return;

            // Handle recurring logic if needed, simplify for profile edit
            const updatedEvent = { ...event, ...updates };

            const meta = {
                title: updatedEvent.title,
                start: updatedEvent.public_meta?.start,
                end: updatedEvent.public_meta?.end,
                color: updatedEvent.public_meta?.color,
                description: updatedEvent.public_meta?.description,
                is_public: updates.is_public !== undefined ? updates.is_public : true
            };

            const securedMeta = await cryptoLib.encryptMetadata(meta, publicKey);

            const payload: any = {
                secured_meta: securedMeta,
                public_meta: {
                    ...updatedEvent.public_meta,
                    title: meta.title,
                    start: meta.start,
                    end: meta.end,
                    color: meta.color,
                    description: meta.description,
                    is_public: meta.is_public
                }
            };

            const res = await apiFetch(`/api/v1/files/${baseId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                // Refresh local state or just let it be optimistic
                setEvents(prev => prev.map(e => e.id === baseId ? { ...e, public_meta: payload.public_meta } : e));
            }
        } catch (err) {
            console.error("Update event failed:", err);
        }
    };

    if (loading) {
        return (
            <div className="flex-1 h-full flex flex-col bg-[#f8f9fc] dark:bg-black overflow-y-auto w-full animate-pulse">
                <div className="relative w-full bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 pt-16 pb-8 px-8 flex flex-col items-center shadow-sm">
                    <div className="w-[120px] h-[120px] rounded-full bg-gray-200 dark:bg-gray-800 mb-6 -mt-8 border-4 border-white dark:border-black"></div>
                    <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded-md mb-3"></div>
                    <div className="h-4 w-32 bg-gray-200 dark:bg-gray-800 rounded-md"></div>
                </div>
                <div className="max-w-4xl w-full mx-auto p-4 sm:p-8 flex-1">
                    <div className="h-40 w-full bg-gray-200 dark:bg-gray-800 rounded-3xl mt-4"></div>
                </div>
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center h-full text-gray-500">
                <User size={48} className="mb-4 opacity-50" />
                <p>Profile could not be loaded</p>
            </div>
        );
    }

    return (
        <div className="flex-1 h-full flex flex-col bg-[#f8f9fc] dark:bg-black overflow-y-auto pb-24">
            {/* Header Section */}
            <div className="relative w-full bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 pt-16 pb-12 px-8 flex flex-col items-center text-center shadow-sm">
                <Avatar
                    seed={(profile.avatar_seed || profile.user_id) + (profile.avatar_salt || '')}
                    style={profile.avatar_style}
                    size={120}
                    verified={profile.is_verified}
                    className="mb-6 -mt-8 bg-white dark:bg-black"
                />
                <h1 className="text-3xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                    {profile.username || "User"}
                    {profile.is_verified && <CheckCircle size={22} className="text-green-500 shrink-0" />}
                </h1>

                {profile.title && (
                    <div className="mt-2 text-xs font-bold text-gray-400 tracking-[0.2em] uppercase">
                        {profile.title}
                    </div>
                )}

                {/* Integrated Bio in Header */}
                <div className="mt-6 max-w-2xl px-4">
                    {profile.bio ? (
                        <p className="text-gray-600 dark:text-gray-400 leading-relaxed text-sm">
                            {profile.bio}
                        </p>
                    ) : (
                        <p className="text-xs text-gray-300 italic">No bio available.</p>
                    )}
                </div>

                {myUserId !== userId && (
                    <div className="flex gap-3 mt-8">
                        <button
                            onClick={toggleContact}
                            disabled={requestSent}
                            className={`px-8 py-3 rounded-2xl font-bold text-sm transition-all focus:outline-none ${isContact ? 'bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700' : requestSent ? 'bg-green-500 text-white cursor-default' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xl shadow-blue-500/20'}`}
                        >
                            {isContact ? 'Disconnect' : requestSent ? 'Request Sent' : 'Connect'}
                        </button>
                        <button
                            onClick={() => onMessage?.(userId)}
                            className="px-8 py-3 rounded-2xl font-bold text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all focus:outline-none shadow-sm flex items-center gap-2"
                        >
                            Message
                        </button>
                    </div>
                )}
            </div>

            {/* Content Section */}
            <div className="max-w-[1400px] w-full mx-auto p-4 sm:p-12 flex flex-col gap-16 animate-in fade-in slide-in-from-bottom-2 duration-500">

                {/* Public Calendar Section (Hidden for redesign) */}
                {/*
                <section>
                    <div className="flex items-center justify-between mb-6">
                        ...
                    </div>
                    ...
                </section>
                */}

                {/* Public Notes Section */}
                <section>
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-500">
                            <FolderOpen size={20} />
                        </div>
                        <h2 className="text-xl font-black text-gray-900 dark:text-white">Public Notes</h2>
                        {publicFiles.length > 0 && <span className="ml-2 text-xs py-0.5 px-2 bg-gray-100 dark:bg-white/10 rounded-full font-bold text-gray-400">{publicFiles.length}</span>}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {(!publicFiles || publicFiles.length === 0) ? (
                            <div className="col-span-full py-16 text-center border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-[2.5rem] bg-white/30 dark:bg-white/5">
                                <FolderOpen className="mx-auto h-12 w-12 text-gray-200 dark:text-gray-800 mb-4" />
                                <p className="text-sm text-gray-400 font-medium">No public notes shared yet.</p>
                            </div>
                        ) : (
                            publicFiles.map(file => (
                                <div
                                    key={file.id}
                                    onClick={() => onOpenFile && onOpenFile(file.id, file.title)}
                                    className="bg-white dark:bg-gray-900 p-6 rounded-3xl shadow-sm hover:shadow-xl border border-gray-100 dark:border-gray-800 cursor-pointer transition-all hover:-translate-y-2 group"
                                >
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="p-3 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl text-indigo-500 group-hover:scale-110 transition-transform">
                                            <LinkIcon size={20} />
                                        </div>
                                        <div className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">{new Date(file.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
                                    </div>
                                    <h3 className="font-bold text-gray-900 dark:text-white truncate group-hover:text-blue-500 transition-colors">
                                        {file.title}
                                    </h3>
                                    <p className="text-xs text-gray-400 mt-1">Shared publicly</p>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
