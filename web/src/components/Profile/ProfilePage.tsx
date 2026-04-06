"use client";

import React, { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import Avatar from './Avatar';
import { CheckCircle, FolderOpen, User, Link as LinkIcon } from 'lucide-react';

interface ProfilePageProps {
    userId: string;
    onOpenFile?: (fileId: string, title: string) => void;
}

interface UserProfile {
    user_id: string;
    username: string;
    is_verified: boolean;
    avatar_seed: string;
    bio: string;
    title: string;
    avatar_salt: string;
    profile_status: number;
}

export default function ProfilePage({ userId, onOpenFile }: ProfilePageProps) {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'about' | 'files' | 'calendar'>('about');
    const [publicFiles, setPublicFiles] = useState<any[]>([]);
    const [events, setEvents] = useState<any[]>([]);

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
        <div className="flex-1 h-full flex flex-col bg-[#f8f9fc] dark:bg-black overflow-y-auto">
            {/* Header Section */}
            <div className="relative w-full bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 pt-16 pb-8 px-8 flex flex-col items-center text-center shadow-sm">
                <Avatar
                    seed={(profile.avatar_seed || profile.user_id) + (profile.avatar_salt || '')}
                    size={120}
                    verified={profile.is_verified}
                    className="mb-6 -mt-8 bg-white dark:bg-black"
                />
                <h1 className="text-3xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                    {profile.username || "User"}
                    {profile.is_verified && <CheckCircle size={22} className="text-green-500 shrink-0" />}
                </h1>

                {profile.title && (
                    <div className="mt-2 text-sm font-bold text-gray-400 tracking-wider uppercase">
                        {profile.title}
                    </div>
                )}
            </div>

            {/* Content Section */}
            <div className="max-w-4xl w-full mx-auto p-4 sm:p-8 flex-1">
                {/* Tabs */}
                <div className="flex items-center gap-6 mb-8 border-b border-gray-200 dark:border-gray-800 pb-2">
                    <button
                        onClick={() => setActiveTab('about')}
                        className={`pb-2 text-sm font-bold transition-all relative ${activeTab === 'about' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-300'}`}
                    >
                        About
                        {activeTab === 'about' && (
                            <span className="absolute bottom-0 left-0 w-full h-[2px] bg-blue-600 dark:bg-blue-400 rounded-t-full shadow-[0_0_8px_rgba(37,99,235,0.5)]"></span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('files')}
                        className={`pb-2 text-sm font-bold transition-all relative ${activeTab === 'files' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-300'}`}
                    >
                        Notes
                        <span className="ml-1.5 text-[10px] bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full text-gray-400 border border-gray-200 dark:border-gray-700">
                            {publicFiles.length}
                        </span>
                        {activeTab === 'files' && (
                            <span className="absolute bottom-0 left-0 w-full h-[2px] bg-blue-600 dark:bg-blue-400 rounded-t-full shadow-[0_0_8px_rgba(37,99,235,0.5)]"></span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('calendar')}
                        className={`pb-2 text-sm font-bold transition-all relative ${activeTab === 'calendar' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-300'}`}
                    >
                        Calendar
                        <span className="ml-1.5 text-[10px] bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full text-gray-400 border border-gray-200 dark:border-gray-700">
                            {events.length}
                        </span>
                        {activeTab === 'calendar' && (
                            <span className="absolute bottom-0 left-0 w-full h-[2px] bg-blue-600 dark:bg-blue-400 rounded-t-full shadow-[0_0_8px_rgba(37,99,235,0.5)]"></span>
                        )}
                    </button>
                </div>

                {/* Tab Content */}
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {activeTab === 'about' && (
                        <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 leading-relaxed">
                            {profile.bio ? (
                                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap text-base">
                                    {profile.bio}
                                </p>
                            ) : (
                                <p className="text-gray-400 italic text-center py-8">
                                    This user hasn't written a bio yet.
                                </p>
                            )}
                        </div>
                    )}

                    {activeTab === 'files' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {(!publicFiles || publicFiles.length === 0) ? (
                                <div className="col-span-full py-12 text-center border border-dashed border-gray-200 dark:border-gray-800 rounded-3xl bg-white/50 dark:bg-gray-900/50">
                                    <FolderOpen className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-700 mb-3" />
                                    <p className="text-sm text-gray-500">No public files shared yet.</p>
                                </div>
                            ) : (
                                publicFiles.map(file => (
                                    <div
                                        key={file.id}
                                        onClick={() => onOpenFile && onOpenFile(file.id, file.title)}
                                        className="bg-white dark:bg-gray-900 p-5 rounded-2xl shadow-sm hover:shadow-md border border-gray-100 dark:border-gray-800 cursor-pointer transition-all hover:-translate-y-1 group"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl">
                                                <LinkIcon className="w-5 h-5 text-blue-500" />
                                            </div>
                                            <div className="text-[10px] text-gray-400">{new Date(file.updated_at).toLocaleDateString()}</div>
                                        </div>
                                        <h3 className="mt-4 font-bold text-gray-900 dark:text-white truncate group-hover:text-blue-500 transition-colors">
                                            {file.title}
                                        </h3>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === 'calendar' && (
                        <div className="space-y-4">
                            {(!events || events.length === 0) ? (
                                <div className="py-12 text-center border border-dashed border-gray-200 dark:border-gray-800 rounded-3xl bg-white/50 dark:bg-gray-900/50">
                                    <p className="text-sm text-gray-500 font-medium">No events shared in this profile.</p>
                                </div>
                            ) : (
                                events.sort((a, b) => new Date(a.public_meta?.start || 0).getTime() - new Date(b.public_meta?.start || 0).getTime()).map(event => (
                                    <div
                                        key={event.id}
                                        className="bg-white dark:bg-gray-900/40 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 flex items-center gap-4 group hover:border-blue-200 dark:hover:border-blue-900/50 transition-all font-sans"
                                    >
                                        <div className="flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                                            <span className="text-[10px] uppercase font-black opacity-60">
                                                {new Date(event.public_meta?.start).toLocaleDateString('en-US', { month: 'short' })}
                                            </span>
                                            <span className="text-xl font-black leading-none">
                                                {new Date(event.public_meta?.start).getDate()}
                                            </span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-bold text-gray-900 dark:text-white truncate">
                                                {event.title}
                                            </h3>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[11px] font-bold text-gray-400">
                                                    {new Date(event.public_meta?.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    {" - "}
                                                    {new Date(event.public_meta?.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
