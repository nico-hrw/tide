"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import Avatar from './Avatar';
import ProfileWeekCalendar, { ProfileCalendarEvent } from './ProfileWeekCalendar';
import { useSocialStore } from '@/store/useSocialStore';
import { useDataStore } from '@/store/useDataStore';
import {
    ArrowLeft, CheckCircle, Check, Calendar as CalendarIcon, FileText,
    Download, Eye, MessageSquare, UserPlus, UserMinus, User, Loader2, X
} from 'lucide-react';

export interface ProfilePageProps {
    userId: string;
    onOpenFile?: (fileId: string, title: string) => void;
    onMessage?: (userId: string) => void;
    onBack?: () => void;
}

export interface UserProfile {
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

export interface PublicFileMeta {
    title?: string;
    name?: string;
    start?: string;
    end?: string;
    date?: string;
    color?: string;
    effect?: string;
    description?: string;
    [key: string]: unknown;
}

export interface PublicFileItem {
    id: string;
    type: string;
    size: number;
    updated_at: string;
    title: string;
    public_meta?: PublicFileMeta;
    [key: string]: unknown;
}

function parseMeta(val: unknown): PublicFileMeta {
    if (!val) return {};
    if (typeof val === 'string') {
        try { return JSON.parse(val) as PublicFileMeta; } catch { return {}; }
    }
    return typeof val === 'object' ? (val as PublicFileMeta) : {};
}

export default function ProfilePage({ userId, onOpenFile, onMessage, onBack }: ProfilePageProps) {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [publicFiles, setPublicFiles] = useState<PublicFileItem[]>([]);
    const [events, setEvents] = useState<ProfileCalendarEvent[]>([]);
    const [myUserId, setMyUserId] = useState<string | null>(null);

    const [copyingFileIds, setCopyingFileIds] = useState<Set<string>>(() => new Set());
    const [copiedFileIds, setCopiedFileIds] = useState<Set<string>>(() => new Set());
    const [previewModalFile, setPreviewModalFile] = useState<PublicFileItem | null>(null);
    const [previewContent, setPreviewContent] = useState<string | null>(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null);

    const showToast = useCallback((message: string, isError = false) => {
        setToast({ message, isError });
        setTimeout(() => setToast((curr) => (curr?.message === message ? null : curr)), 3500);
    }, []);

    const { isContact: checkIsContact, sendRequest, fetchContacts, hasSentRequest, removeContact } = useSocialStore();
    const isContact = checkIsContact(userId);
    const requestSent = hasSentRequest(userId);
    const isOwnProfile = myUserId !== null && myUserId === userId;

    useEffect(() => {
        const fetchMe = async () => {
            try {
                const meRes = await apiFetch('/api/v1/auth/me');
                if (meRes.ok) {
                    const meData = (await meRes.json()) as { id?: string };
                    if (meData.id) setMyUserId(meData.id);
                }
            } catch (e) {
                console.error('Failed to fetch auth user', e);
            }
        };
        fetchMe();
        fetchContacts();
    }, [userId, fetchContacts]);

    useEffect(() => {
        let isCancelled = false;
        const fetchProfileData = async () => {
            setLoading(true);
            try {
                const res = await apiFetch(`/api/v1/profiles/${userId}`);
                if (res.ok) {
                    const data = (await res.json()) as UserProfile;
                    if (!isCancelled) setProfile(data);
                }

                const filesRes = await apiFetch(`/api/v1/files/public/${userId}`);
                if (filesRes.ok) {
                    const filesData = (await filesRes.json()) as Record<string, unknown>[];
                    const list = Array.isArray(filesData) ? filesData : [];
                    const parsedFiles: PublicFileItem[] = [];
                    const parsedEvents: ProfileCalendarEvent[] = [];

                    list.forEach((item) => {
                        const meta = parseMeta(item.public_meta);
                        const rawTitle = (typeof meta.title === 'string' && meta.title) || (typeof item.title === 'string' && item.title) || 'Unbenannt';
                        const fileType = typeof item.type === 'string' ? item.type : 'file';

                        const getStr = (a: unknown, b: unknown) => (typeof a === 'string' ? a : typeof b === 'string' ? b : undefined);
                        if (fileType === 'event') {
                            parsedEvents.push({
                                id: String(item.id || ''), title: rawTitle, public_meta: meta,
                                start: getStr(meta.start, item.start), end: getStr(meta.end, item.end), date: getStr(meta.date, item.date),
                                color: getStr(meta.color, item.color), effect: getStr(meta.effect, item.effect), description: getStr(meta.description, item.description),
                            });
                        } else {
                            parsedFiles.push({
                                id: String(item.id || ''), type: fileType, size: typeof item.size === 'number' ? item.size : 0,
                                updated_at: typeof item.updated_at === 'string' ? item.updated_at : new Date().toISOString(),
                                title: rawTitle, public_meta: meta,
                            });
                        }
                    });

                    if (!isCancelled) {
                        setPublicFiles(parsedFiles);
                        setEvents(parsedEvents);
                    }
                } else if (!isCancelled) {
                    setPublicFiles([]);
                    setEvents([]);
                }
            } catch (e) {
                console.error('Failed to load profile', e);
            } finally {
                if (!isCancelled) setLoading(false);
            }
        };

        if (userId) fetchProfileData();
        return () => { isCancelled = true; };
    }, [userId]);

    const handleBack = () => {
        if (onBack) onBack();
        else if (onMessage) onMessage(userId);
        else if (typeof window !== 'undefined' && window.history.length > 1) window.history.back();
    };

    const toggleContact = async () => {
        try {
            if (isContact) {
                const removed = await removeContact(userId);
                if (removed) {
                    showToast('Kontakt entfernt');
                } else {
                    const res = await apiFetch(`/api/v1/contacts/${userId}`, { method: 'DELETE' });
                    if (res.ok) { await fetchContacts(); showToast('Kontakt entfernt'); }
                }
            } else {
                if (requestSent) return;
                const sent = await sendRequest(userId);
                if (sent) showToast('Kontaktanfrage gesendet');
                else showToast('Fehler beim Senden der Kontaktanfrage', true);
            }
        } catch (e) {
            console.error('Failed to update contact', e);
            showToast('Fehler bei der Kontaktaktualisierung', true);
        }
    };

    const handleAdoptEvent = async (event: ProfileCalendarEvent) => {
        if (!event.id) return;
        try {
            const res = await apiFetch(`/api/v1/files/${event.id}/copy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_parent_id: null }),
            });
            if (!res.ok) {
                const errData = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
                throw new Error(errData.error || errData.message || 'Fehler beim Übernehmen des Termins');
            }
            const store = useDataStore.getState() as { fetchEvents?: () => Promise<void>; fetchDirectory?: (p: string | null, force: boolean) => Promise<void> };
            if (typeof store.fetchEvents === 'function') await store.fetchEvents();
            else if (typeof store.fetchDirectory === 'function') await store.fetchDirectory(null, true);
            showToast('Termin wurde in deinen Kalender übernommen');
        } catch (err: unknown) {
            console.error('Error adopting event:', err);
            showToast(err instanceof Error ? err.message : 'Fehler beim Übernehmen des Termins', true);
            throw err;
        }
    };

    const handleAdoptFile = async (file: PublicFileItem) => {
        setCopyingFileIds((prev) => new Set(prev).add(file.id));
        try {
            const res = await apiFetch(`/api/v1/files/${file.id}/copy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_parent_id: null }),
            });
            if (!res.ok) {
                const errData = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
                throw new Error(errData.error || errData.message || 'Fehler beim Kopieren der Datei');
            }
            const store = useDataStore.getState() as { fetchDirectory?: (p: string | null, force: boolean) => Promise<void> };
            if (typeof store.fetchDirectory === 'function') await store.fetchDirectory(null, true);
            setCopiedFileIds((prev) => new Set(prev).add(file.id));
            showToast('In deine Notizen übernommen!');
        } catch (err: unknown) {
            console.error('Error copying file:', err);
            showToast(err instanceof Error ? err.message : 'Fehler beim Übernehmen der Notiz', true);
        } finally {
            setCopyingFileIds((prev) => { const next = new Set(prev); next.delete(file.id); return next; });
        }
    };

    const handlePreviewFile = async (file: PublicFileItem) => {
        setPreviewModalFile(file);
        setIsPreviewLoading(true);
        setPreviewContent(null);
        try {
            const res = await apiFetch(`/api/v1/files/public/${userId}/download/${file.id}`);
            if (!res.ok) throw new Error('Fehler beim Herunterladen der Datei');
            setPreviewContent(await res.text());
        } catch (err: unknown) {
            setPreviewContent(err instanceof Error ? err.message : 'Fehler beim Laden der Vorschau.');
        } finally {
            setIsPreviewLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex-1 h-full flex flex-col bg-t2-sub overflow-y-auto animate-pulse">
                <div className="sticky top-0 z-30 flex items-center justify-between px-6 md:px-10 py-4 border-b border-t2-line  bg-t2-surface  backdrop-blur-md">
                    <div className="h-8 w-24 bg-t2-stage  rounded-xl" />
                    <div className="h-6 w-32 bg-t2-stage  rounded-lg" />
                </div>
                <div className="max-w-6xl w-full mx-auto px-4 md:px-8 py-6 flex flex-col gap-6">
                    <div className="h-44 w-full bg-t2-stage  rounded-3xl" />
                    <div className="h-96 w-full bg-t2-stage  rounded-2xl" />
                </div>
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center h-full text-t2-ink-2 bg-t2-sub">
                <User size={48} className="mb-4 opacity-40 text-t2-ink-3" />
                <p className="text-sm font-semibold">Profil konnte nicht geladen werden</p>
                <button type="button" onClick={handleBack} className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold bg-t2-surface  border border-t2-line  text-t2-ink  hover:bg-t2-sub transition-colors">
                    Zurück
                </button>
            </div>
        );
    }

    return (
        <div className="flex-1 h-full flex flex-col bg-t2-sub overflow-y-auto relative select-none">
            {/* Sticky Header with Back Button */}
            <div className="sticky top-0 z-30 flex items-center justify-between px-6 md:px-10 py-4 border-b border-t2-line  bg-t2-surface  backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <button type="button" onClick={handleBack} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-t2-ink-2  hover:text-t2-ink  hover:bg-t2-hover  transition-colors cursor-pointer border border-transparent hover:border-t2-line " title="Zurück">
                        <ArrowLeft size={16} />
                        <span>Zurück</span>
                    </button>
                    <span className="text-sm font-bold text-t2-ink  hidden sm:inline">Öffentliches Profil</span>
                </div>
                {isOwnProfile && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-t2-sub  text-t2-accent  border border-t2-line ">
                        <span className="w-1.5 h-1.5 rounded-full bg-t2-accent" />
                        <span>Eigenes Profil</span>
                    </span>
                )}
            </div>

            {/* Layout Container */}
            <div className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-8 py-6 flex flex-col gap-6">
                {/* Profile Card */}
                <div className="bg-t2-surface  border border-t2-line  rounded-3xl p-6 sm:p-8 shadow-xs flex flex-col md:flex-row items-center md:items-start gap-6 transition-all">
                    <div className="shrink-0">
                        <Avatar seed={(profile.avatar_seed || profile.user_id) + (profile.avatar_salt || '')} style={profile.avatar_style} size={92} verified={profile.is_verified} />
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col items-center md:items-start text-center md:text-left">
                        <div className="flex items-center gap-2 flex-wrap justify-center md:justify-start">
                            <h1 className="text-2xl sm:text-3xl font-extrabold text-t2-ink  tracking-tight">{profile.username || 'Benutzer'}</h1>
                            {profile.is_verified && (
                                <span title="Verifiziertes Profil" className="inline-flex items-center">
                                    <CheckCircle size={22} className="text-emerald-500 fill-emerald-500/10 shrink-0" />
                                </span>
                            )}
                        </div>
                        {profile.title && <p className="text-xs font-bold uppercase tracking-wider text-t2-accent  mt-1">{profile.title}</p>}
                        <div className="mt-2.5 max-w-xl">
                            {profile.bio ? <p className="text-sm text-t2-ink-2  leading-relaxed whitespace-pre-wrap">{profile.bio}</p> : <p className="text-xs text-t2-ink-3 italic">Keine Biografie hinterlegt.</p>}
                        </div>

                        {/* Quick counters */}
                        <div className="flex items-center gap-3 mt-4 flex-wrap justify-center md:justify-start">
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-t2-sub  border border-t2-line  text-xs font-medium text-t2-ink ">
                                <CalendarIcon size={14} className="text-t2-accent shrink-0" />
                                <span>{events.length} Termin{events.length === 1 ? '' : 'e'}</span>
                            </div>
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-t2-sub  border border-t2-line  text-xs font-medium text-t2-ink ">
                                <FileText size={14} className="text-amber-500 shrink-0" />
                                <span>{publicFiles.length} Notiz{publicFiles.length === 1 ? '' : 'en'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Action buttons (if not own profile) */}
                    {!isOwnProfile && (
                        <div className="flex md:flex-col gap-2.5 w-full md:w-auto shrink-0 md:ml-auto">
                            <button type="button" onClick={() => onMessage?.(userId)} className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-t2-accent hover:opacity-90 text-t2-accent-ink shadow-xs hover:shadow-md transition-all cursor-pointer">
                                <MessageSquare size={15} />
                                <span>Nachricht senden</span>
                            </button>
                            <button
                                type="button"
                                onClick={toggleContact}
                                disabled={requestSent}
                                className={`flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                                    isContact
                                        ? 'border-t2-line  bg-t2-sub  text-t2-ink  hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-600 hover:border-rose-200 dark:hover:border-rose-800/40'
                                        : requestSent
                                        ? 'border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 cursor-default'
                                        : 'border-t2-line  bg-t2-surface  text-t2-ink  hover:bg-t2-sub '
                                }`}
                            >
                                {isContact ? (<><UserMinus size={15} /><span>Kontakt entfernen</span></>) : requestSent ? (<><Check size={15} /><span>Anfrage gesendet</span></>) : (<><UserPlus size={15} /><span>Kontakt anfragen</span></>)}
                            </button>
                        </div>
                    )}
                </div>

                {/* Section 1: Öffentlicher Kalender */}
                <section className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-xl bg-t2-sub text-t2-accent"><CalendarIcon size={18} /></div>
                            <div>
                                <h2 className="text-lg font-bold text-t2-ink  leading-tight">Öffentlicher Kalender</h2>
                                <p className="text-xs text-t2-ink-2 ">Wochenübersicht aller von {profile.username} freigegebenen Termine</p>
                            </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-t2-sub  text-t2-accent  border border-t2-line ">
                            {events.length} Termin{events.length === 1 ? '' : 'e'}
                        </span>
                    </div>

                    <ProfileWeekCalendar events={events} ownerName={profile.username} onAdoptEvent={handleAdoptEvent} isOwnProfile={isOwnProfile} />
                </section>

                {/* Section 2: Öffentliche Notizen & Dokumente */}
                <section className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500"><FileText size={18} /></div>
                            <div>
                                <h2 className="text-lg font-bold text-t2-ink  leading-tight">Öffentliche Notizen & Dokumente</h2>
                                <p className="text-xs text-t2-ink-2 ">Öffentlich freigegebene Notizen und Dokumente von {profile.username}</p>
                            </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-100 dark:border-amber-800/40">
                            {publicFiles.length} {publicFiles.length === 1 ? 'Dokument' : 'Dokumente'}
                        </span>
                    </div>

                    {publicFiles.length === 0 ? (
                        <div className="py-14 text-center border-2 border-dashed border-t2-line  rounded-2xl bg-white/40 dark:bg-white/[0.02]">
                            <FileText className="mx-auto h-10 w-10 text-t2-ink-3  mb-3" />
                            <p className="text-sm font-medium text-t2-ink-2 ">Keine öffentlichen Notizen vorhanden</p>
                            <p className="text-xs text-t2-ink-3  mt-1">Dieser Benutzer hat aktuell keine Notizen oder Dokumente freigegeben.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {publicFiles.map((file) => {
                                const isCopied = copiedFileIds.has(file.id);
                                const isCopying = copyingFileIds.has(file.id);
                                const formattedDate = file.updated_at ? new Date(file.updated_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Unbekannt';

                                return (
                                    <div key={file.id} className="bg-t2-surface  border border-t2-line  rounded-2xl p-5 shadow-xs hover:border-t2-line  transition-all flex flex-col justify-between group">
                                        <div>
                                            <div className="flex items-start justify-between gap-3 mb-3">
                                                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 group-hover:bg-amber-500/20 transition-colors">
                                                    <FileText size={20} />
                                                </div>
                                                <span className="text-[11px] font-mono text-t2-ink-3 ">{formattedDate}</span>
                                            </div>
                                            <h3 className="font-bold text-sm text-t2-ink  line-clamp-2 leading-snug">{file.title}</h3>
                                            {file.size > 0 && <p className="text-[11px] text-t2-ink-3  mt-1">{(file.size / 1024).toFixed(1)} KB</p>}
                                        </div>

                                        <div className="flex items-center gap-2 pt-4 mt-4 border-t border-t2-line-soft ">
                                            <button type="button" onClick={() => handlePreviewFile(file)} className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold text-t2-ink  bg-t2-sub  hover:bg-t2-hover  transition-colors cursor-pointer border border-t2-line ">
                                                <Eye size={14} />
                                                <span>Vorschau</span>
                                            </button>
                                            {!isOwnProfile && (
                                                <button type="button" onClick={() => handleAdoptFile(file)} disabled={isCopying || isCopied} className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs ${isCopied ? 'bg-emerald-600 text-t2-accent-ink cursor-default' : 'bg-t2-accent hover:opacity-90 text-t2-accent-ink hover:shadow-xs'} disabled:opacity-85`} title="In Tresor übernehmen">
                                                    {isCopying ? <Loader2 size={14} className="animate-spin" /> : isCopied ? (<><Check size={14} /><span>Übernommen</span></>) : (<><Download size={14} /><span>Übernehmen</span></>)}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>

            {/* File Preview Modal */}
            {previewModalFile && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200" onClick={() => setPreviewModalFile(null)}>
                    <div className="bg-t2-surface  border border-t2-line  rounded-2xl sm:rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 text-t2-ink " onClick={(e) => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-t2-line-soft  flex items-center justify-between">
                            <div className="flex items-center gap-2.5 min-w-0 pr-4">
                                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 shrink-0"><FileText size={18} /></div>
                                <div className="min-w-0">
                                    <h3 className="font-bold text-base truncate">{previewModalFile.title}</h3>
                                    <p className="text-[11px] text-t2-ink-3 ">Öffentliche Vorschau</p>
                                </div>
                            </div>
                            <button type="button" onClick={() => setPreviewModalFile(null)} className="p-1.5 rounded-xl text-t2-ink-3 hover:text-t2-ink  hover:bg-t2-hover  transition-colors cursor-pointer" title="Schließen">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-6 flex-1 overflow-auto bg-t2-sub  text-xs sm:text-sm font-mono whitespace-pre-wrap text-t2-ink  leading-relaxed">
                            {isPreviewLoading ? (
                                <div className="flex flex-col items-center justify-center h-48 gap-3 text-t2-ink-3">
                                    <Loader2 size={24} className="animate-spin text-t2-accent" />
                                    <span className="text-xs">Lade Inhalt...</span>
                                </div>
                            ) : (
                                previewContent || 'Kein Inhalt verfügbar.'
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-t2-line-soft  flex items-center justify-end gap-3 bg-t2-surface ">
                            <button type="button" onClick={() => setPreviewModalFile(null)} className="px-4 py-2 rounded-xl text-xs font-semibold text-t2-ink-2  hover:bg-t2-hover  transition-colors cursor-pointer">
                                Schließen
                            </button>
                            {onOpenFile && (
                                <button type="button" onClick={() => { onOpenFile(previewModalFile.id, previewModalFile.title); setPreviewModalFile(null); }} className="px-4 py-2 rounded-xl text-xs font-semibold text-t2-accent  hover:bg-t2-sub  transition-colors cursor-pointer">
                                    In Tide öffnen
                                </button>
                            )}
                            {!isOwnProfile && (
                                <button
                                    type="button"
                                    onClick={() => { if (previewModalFile) handleAdoptFile(previewModalFile); }}
                                    disabled={copyingFileIds.has(previewModalFile.id) || copiedFileIds.has(previewModalFile.id)}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-t2-accent hover:opacity-90 text-t2-accent-ink transition-all cursor-pointer shadow-xs disabled:opacity-85"
                                >
                                    {copiedFileIds.has(previewModalFile.id) ? (<><Check size={14} /><span>Übernommen</span></>) : (<><Download size={14} /><span>In Tresor übernehmen</span></>)}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Floating Toast Notification */}
            {toast && (
                <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-200 pointer-events-none">
                    <div className={`px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-semibold text-white ${toast.isError ? 'bg-rose-600' : 'bg-emerald-600'}`}>
                        {toast.isError ? <X size={16} /> : <Check size={16} />}
                        <span>{toast.message}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
