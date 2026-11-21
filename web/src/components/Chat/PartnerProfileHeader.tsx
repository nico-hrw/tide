// web/src/components/Chat/PartnerProfileHeader.tsx
"use client";
import { useState, useEffect } from 'react';
import Avatar from '@/components/Profile/Avatar';
import { CheckCircle2, ExternalLink, FileText } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface Partner {
    id: string;
    username: string;
    avatar_seed?: string;
    avatar_salt?: string;
    avatar_style?: string;
}

interface ProfileDetails {
    bio?: string;
    title?: string;
    is_verified?: boolean;
}

interface PartnerProfileHeaderProps {
    partner: Partner;
    expanded: boolean;
    onOpenProfile: (userId: string, username: string) => void;
    onToggle?: () => void;
}

export default function PartnerProfileHeader({ partner, expanded, onOpenProfile, onToggle }: PartnerProfileHeaderProps) {
    const [details, setDetails] = useState<ProfileDetails | null>(null);
    const [publicFiles, setPublicFiles] = useState<Array<{ id: string; title: string; type: string }>>([]);
    const [hasFetched, setHasFetched] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        setDetails(null);
        setPublicFiles([]);
        setHasFetched(false);
        apiFetch(`/api/v1/profiles/${partner.id}`, { signal: controller.signal })
            .then(r => r.ok ? r.json() : null)
            .then(d => {
                if (!controller.signal.aborted && d) {
                    setDetails({ bio: d.bio, title: d.title, is_verified: d.is_verified });
                }
            })
            .catch(() => {});
        return () => controller.abort();
    }, [partner.id]);

    useEffect(() => {
        if (!expanded || hasFetched) return;
        const controller = new AbortController();
        setHasFetched(true);
        apiFetch(`/api/v1/files/public/${partner.id}`, { signal: controller.signal })
            .then(r => r.ok ? r.json() : [])
            .then((data: any[]) => {
                if (controller.signal.aborted || !Array.isArray(data)) return;
                setPublicFiles(
                    data.slice(0, 5).map(f => ({
                        id: f.id,
                        title: (typeof f.public_meta === 'object' && f.public_meta !== null ? f.public_meta?.title : null) || f.title || 'Untitled',
                        type: f.type || 'note',
                    }))
                );
            })
            .catch(() => {});
        return () => controller.abort();
    }, [expanded, hasFetched, partner.id]);

    const seed = (partner.avatar_seed || partner.id) + (partner.avatar_salt || '');

    return (
        <div
            className="overflow-hidden transition-all duration-300 border-b border-t2-line-soft  bg-t2-surface "
            style={{ maxHeight: expanded ? '360px' : '56px' }}
        >
            {/* Compact view — always visible */}
            <div
                className="flex items-center gap-3 px-4 h-14 shrink-0 cursor-pointer hover:bg-t2-sub  transition-colors select-none"
                onClick={onToggle}
            >
                <Avatar seed={seed} style={partner.avatar_style as any} size={28} />
                <span className="font-semibold text-sm text-t2-ink  truncate flex-1">
                    {partner.username}
                    {details?.is_verified && <CheckCircle2 className="inline w-3.5 h-3.5 fill-green-500 text-white ml-1 mb-0.5" />}
                </span>
                <button
                    onClick={(e) => { e.stopPropagation(); onOpenProfile(partner.id, partner.username); }}
                    className="p-1.5 rounded-lg hover:bg-t2-hover  text-t2-ink-3 transition-colors shrink-0"
                    title="Profil ansehen"
                >
                    <ExternalLink size={14} />
                </button>
            </div>

            {/* Expanded extra content — only visible when expanded */}
            <div className="px-4 pb-4 flex flex-col gap-3">
                {/* Avatar + bio/title */}
                <div className="flex flex-col items-center gap-1.5">
                    <Avatar seed={seed} style={partner.avatar_style as any} size={52} />
                    {details?.title && (
                        <p className="text-[11px] text-t2-ink-3  font-bold uppercase tracking-widest">{details.title}</p>
                    )}
                    {details?.bio && (
                        <p className="text-xs text-t2-ink-2  text-center line-clamp-2">{details.bio}</p>
                    )}
                </div>

                {/* Public files section */}
                {publicFiles.length > 0 && (
                    <div>
                        <p className="text-[11px] font-bold uppercase tracking-widest text-t2-ink-3  mb-1.5">Öffentliche Notizen</p>
                        <div className="flex flex-col gap-0.5">
                            {publicFiles.map(f => (
                                <button
                                    key={f.id}
                                    onClick={(e) => { e.stopPropagation(); onOpenProfile(partner.id, partner.username); }}
                                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-t2-hover  transition-colors text-left w-full"
                                >
                                    <FileText size={12} className="text-t2-ink-3  shrink-0" />
                                    <span className="text-xs text-t2-ink  truncate">{f.title}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {publicFiles.length === 0 && hasFetched && (
                    <p className="text-[11px] text-t2-ink-3  text-center">Keine öffentlichen Notizen</p>
                )}
            </div>
        </div>
    );
}
