// web/src/components/Chat/PartnerProfileHeader.tsx
"use client";
import { useState, useEffect } from 'react';
import Avatar from '@/components/Profile/Avatar';
import { CheckCircle2, ExternalLink } from 'lucide-react';
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
}

export default function PartnerProfileHeader({ partner, expanded, onOpenProfile }: PartnerProfileHeaderProps) {
    const [details, setDetails] = useState<ProfileDetails | null>(null);

    useEffect(() => {
        setDetails(null);
        apiFetch(`/api/v1/profiles/${partner.id}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d) setDetails({ bio: d.bio, title: d.title, is_verified: d.is_verified }); })
            .catch(() => {});
    }, [partner.id]);

    const seed = (partner.avatar_seed || partner.id) + (partner.avatar_salt || '');

    return (
        <div
            className="overflow-hidden transition-all duration-300 border-b border-gray-100 dark:border-white/10 bg-white dark:bg-[#1a1c1e]"
            style={{ maxHeight: expanded ? '200px' : '56px' }}
        >
            {/* Compact view — always visible */}
            <div className="flex items-center gap-3 px-4 h-14 shrink-0">
                <Avatar seed={seed} style={partner.avatar_style as any} size={28} />
                <span className="font-semibold text-sm text-gray-900 dark:text-white truncate flex-1">
                    {partner.username}
                    {details?.is_verified && <CheckCircle2 className="inline w-3.5 h-3.5 fill-green-500 text-white ml-1 mb-0.5" />}
                </span>
                <button
                    onClick={() => onOpenProfile(partner.id, partner.username)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 transition-colors shrink-0"
                    title="Profil ansehen"
                >
                    <ExternalLink size={14} />
                </button>
            </div>

            {/* Expanded extra content — only visible when expanded */}
            <div className="px-4 pb-4 flex flex-col items-center gap-2">
                <Avatar seed={seed} style={partner.avatar_style as any} size={48} />
                {details?.title && (
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{details.title}</p>
                )}
                {details?.bio && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center line-clamp-2">{details.bio}</p>
                )}
            </div>
        </div>
    );
}
