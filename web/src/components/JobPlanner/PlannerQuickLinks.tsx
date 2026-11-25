/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
    Plus, 
    BookOpen, 
    Calendar, 
    FileText, 
    Users, 
    Settings, 
    Globe, 
    Briefcase, 
    GraduationCap, 
    ExternalLink, 
    Edit2, 
    Trash2, 
    X,
    Upload,
    Link as LinkIcon
} from 'lucide-react';
import { useJobPlannerStore, PlannerQuickLink } from '@/store/useJobPlannerStore';

const PRESET_ICONS: Record<string, React.ElementType> = {
    'book-open': BookOpen,
    'calendar': Calendar,
    'file-text': FileText,
    'users': Users,
    'settings': Settings,
    'globe': Globe,
    'briefcase': Briefcase,
    'graduation-cap': GraduationCap,
};

function sanitizeQuickLinkUrl(raw: string): string | null {
    const trimmed = raw.trim();
    if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) return null;
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
        return trimmed;
    }
    const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;
    try {
        const u = new URL(candidate);
        if (u.protocol === 'https:' || u.protocol === 'http:') {
            return u.toString();
        }
        return null;
    } catch {
        return null;
    }
}

function sanitizeQuickLinkIcon(raw: string): string | null {
    const trimmed = raw.trim();
    if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) return null;
    if (/^\/[^/]/.test(trimmed)) {
        return trimmed;
    }
    if (/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(trimmed)) {
        return trimmed;
    }
    try {
        const u = new URL(trimmed);
        if (u.protocol === 'https:' || u.protocol === 'http:') {
            return u.toString();
        }
        return null;
    } catch {
        return null;
    }
}

export default function PlannerQuickLinks() {
    const { quickLinks, addQuickLink, updateQuickLink, deleteQuickLink } = useJobPlannerStore();

    // Context menu state
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        link: PlannerQuickLink;
    } | null>(null);

    // Modal state for Add / Edit
    const [modalState, setModalState] = useState<{
        isOpen: boolean;
        editingId: string | null;
        name: string;
        url: string;
        icon: string;
        iconType: 'preset' | 'url' | 'upload';
    }>({
        isOpen: false,
        editingId: null,
        name: '',
        url: '',
        icon: 'book-open',
        iconType: 'preset',
    });

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Close context menu on outside click
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const openAddModal = () => {
        setModalState({
            isOpen: true,
            editingId: null,
            name: '',
            url: '',
            icon: 'globe',
            iconType: 'preset',
        });
        setContextMenu(null);
    };

    const openEditModal = (link: PlannerQuickLink) => {
        const isPreset = !!PRESET_ICONS[link.icon || ''];
        const isDataUrl = (link.icon || '').startsWith('data:');
        setModalState({
            isOpen: true,
            editingId: link.id,
            name: link.name,
            url: link.url,
            icon: link.icon || 'globe',
            iconType: isPreset ? 'preset' : (isDataUrl ? 'upload' : 'url'),
        });
        setContextMenu(null);
    };

    const handleSaveLink = () => {
        if (!modalState.name.trim()) return;
        const trimmedUrl = modalState.url.trim();
        let finalUrl = '';
        if (trimmedUrl) {
            const sanitized = sanitizeQuickLinkUrl(trimmedUrl);
            if (!sanitized) return;
            finalUrl = sanitized;
        }

        if (modalState.editingId) {
            updateQuickLink(modalState.editingId, {
                name: modalState.name.trim(),
                url: finalUrl,
                icon: modalState.icon,
            });
        } else {
            addQuickLink({
                name: modalState.name.trim(),
                url: finalUrl,
                icon: modalState.icon,
            });
        }

        setModalState(prev => ({ ...prev, isOpen: false }));
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = typeof event.target?.result === 'string' ? event.target.result : '';
            const safeDataUrl = dataUrl ? sanitizeQuickLinkIcon(dataUrl) : null;
            if (safeDataUrl && safeDataUrl.startsWith('data:')) {
                setModalState(prev => ({
                    ...prev,
                    icon: safeDataUrl,
                    iconType: 'upload',
                }));
            }
        };
        reader.readAsDataURL(file);
    };

    const handleIconClick = (link: PlannerQuickLink) => {
        if (!link.url) return;
        const targetUrl = sanitizeQuickLinkUrl(link.url);
        if (!targetUrl) return;
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
    };

    const visibleQuickLinks = useMemo(() => {
        return quickLinks.filter(l => 
            (l.name || '').trim().toLowerCase() !== 'kalender' && 
            (l.icon || '').toLowerCase() !== 'calendar'
        );
    }, [quickLinks]);

    const renderIconContent = (link: PlannerQuickLink) => {
        const iconValue = link.icon || '';
        const safeIconSrc = sanitizeQuickLinkIcon(iconValue);
        
        // Custom uploaded image or validated URL
        if (safeIconSrc) {
            return (
                <img 
                    src={safeIconSrc} 
                    alt={link.name} 
                    className="w-7 h-7 object-contain rounded-md"
                    onError={(e) => {
                        // fallback if image fails
                        (e.target as HTMLElement).style.display = 'none';
                    }}
                />
            );
        }

        // Preset Lucide icon
        const IconComp = PRESET_ICONS[iconValue] || PRESET_ICONS['globe'];
        return <IconComp size={24} className="text-t2-ink " />;
    };

    const safeUploadPreview = modalState.icon.startsWith('data:')
        ? sanitizeQuickLinkIcon(modalState.icon)
        : null;

    return (
        <div className="w-full relative">
            {/* Quick Links Row matching Figma */}
            <div className="flex items-center justify-between py-1 gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                    {visibleQuickLinks.map((link: PlannerQuickLink) => (
                        <div
                            key={link.id}
                            onClick={() => handleIconClick(link)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setContextMenu({
                                    x: e.clientX,
                                    y: e.clientY,
                                    link,
                                });
                            }}
                            title={`${link.name} (Rechtsklick zum Bearbeiten)`}
                            className="group relative w-13 h-13 md:w-14 md:h-14 rounded-2xl bg-t2-surface  border border-t2-line  flex items-center justify-center cursor-pointer shadow-xs hover:shadow-md hover:border-t2-accent  hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all"
                        >
                            {renderIconContent(link)}
                            {/* Hover tooltip */}
                            <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-t2-ink  text-t2-bg text-[11px] font-semibold px-2.5 py-1 rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-30 shadow-md">
                                {link.name}
                            </div>
                        </div>
                    ))}

                    {/* Add Button matching Figma (+) */}
                    <button
                        onClick={openAddModal}
                        title="Neuen Quick Link hinzufügen"
                        className="w-13 h-13 md:w-14 md:h-14 rounded-2xl bg-t2-hover  border border-t2-line  flex items-center justify-center cursor-pointer text-t2-ink-2  hover:text-t2-accent  hover:bg-t2-surface  hover:border-t2-line  hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all"
                    >
                        <Plus size={22} />
                    </button>
                </div>
            </div>

            {/* Custom Context Menu on Right Click */}
            {contextMenu && (
                <div
                    style={{
                        top: `${contextMenu.y}px`,
                        left: `${contextMenu.x}px`,
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="fixed z-50 min-w-[170px] bg-t2-surface  border border-t2-line  rounded-xl shadow-xl py-1 text-xs animate-in fade-in zoom-in-95 duration-100"
                >
                    <div className="px-3 py-1.5 font-bold text-t2-ink-3 text-[11px] uppercase border-b border-t2-line-soft  truncate">
                        {contextMenu.link.name}
                    </div>
                    {contextMenu.link.url && (
                        <button
                            onClick={() => {
                                handleIconClick(contextMenu.link);
                                setContextMenu(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-t2-ink  hover:bg-t2-hover  transition-colors text-left"
                        >
                            <ExternalLink size={13} className="text-t2-ink-3" />
                            <span>In neuem Tab öffnen</span>
                        </button>
                    )}
                    <button
                        onClick={() => openEditModal(contextMenu.link)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-t2-ink  hover:bg-t2-hover  transition-colors text-left"
                    >
                        <Edit2 size={13} className="text-t2-accent" />
                        <span>Bearbeiten</span>
                    </button>
                    <button
                        onClick={() => {
                            deleteQuickLink(contextMenu.link.id);
                            setContextMenu(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors text-left"
                    >
                        <Trash2 size={13} />
                        <span>Löschen</span>
                    </button>
                </div>
            )}

            {/* Add/Edit Modal */}
            {modalState.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
                    <div className="w-full max-w-md bg-t2-surface  border border-t2-line  rounded-2xl shadow-2xl p-5 animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between pb-3 border-b border-t2-line-soft ">
                            <h3 className="text-sm font-bold text-t2-ink  flex items-center gap-2">
                                <LinkIcon size={16} className="text-t2-accent" />
                                {modalState.editingId ? 'Quick Link bearbeiten' : 'Neuen Quick Link erstellen'}
                            </h3>
                            <button
                                onClick={() => setModalState(prev => ({ ...prev, isOpen: false }))}
                                className="p-1 rounded-lg text-t2-ink-3 hover:text-t2-ink-2 "
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="space-y-4 py-4 text-xs">
                            {/* Name Input */}
                            <div>
                                <label className="block font-semibold text-t2-ink  mb-1">
                                    Name
                                </label>
                                <input
                                    type="text"
                                    placeholder="z.B. Moodle, ILIAS, GitHub..."
                                    value={modalState.name}
                                    onChange={(e) => setModalState(prev => ({ ...prev, name: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-xl border border-t2-line  bg-t2-sub  text-t2-ink  outline-none focus:border-t2-accent transition-colors"
                                />
                            </div>

                            {/* URL Input */}
                            <div>
                                <label className="block font-semibold text-t2-ink  mb-1">
                                    Link / URL
                                </label>
                                <input
                                    type="text"
                                    placeholder="https://..."
                                    value={modalState.url}
                                    onChange={(e) => setModalState(prev => ({ ...prev, url: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-xl border border-t2-line  bg-t2-sub  text-t2-ink  outline-none focus:border-t2-accent transition-colors"
                                />
                            </div>

                            {/* Icon Selection */}
                            <div>
                                <label className="block font-semibold text-t2-ink  mb-1.5">
                                    Icon auswählen
                                </label>
                                <div className="flex gap-2 mb-2">
                                    <button
                                        type="button"
                                        onClick={() => setModalState(prev => ({ ...prev, iconType: 'preset' }))}
                                        className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                                            modalState.iconType === 'preset'
                                                ? 'bg-t2-accent text-t2-accent-ink'
                                                : 'bg-t2-hover  text-t2-ink-2 '
                                        }`}
                                    >
                                        Standard-Icons
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setModalState(prev => ({ ...prev, iconType: 'url' }))}
                                        className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                                            modalState.iconType === 'url'
                                                ? 'bg-t2-accent text-t2-accent-ink'
                                                : 'bg-t2-hover  text-t2-ink-2 '
                                        }`}
                                    >
                                        Bild-URL
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setModalState(prev => ({ ...prev, iconType: 'upload' }))}
                                        className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                                            modalState.iconType === 'upload'
                                                ? 'bg-t2-accent text-t2-accent-ink'
                                                : 'bg-t2-hover  text-t2-ink-2 '
                                        }`}
                                    >
                                        Datei hochladen
                                    </button>
                                </div>

                                {modalState.iconType === 'preset' && (
                                    <div className="grid grid-cols-4 gap-2 pt-1">
                                        {Object.entries(PRESET_ICONS).map(([key, Comp]) => (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => setModalState(prev => ({ ...prev, icon: key }))}
                                                className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                                                    modalState.icon === key
                                                        ? 'border-t2-accent bg-t2-sub  text-t2-accent '
                                                        : 'border-t2-line  hover:bg-t2-sub  text-t2-ink-2 '
                                                }`}
                                            >
                                                <Comp size={18} />
                                                <span className="text-[11px] truncate max-w-full">{key}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {modalState.iconType === 'url' && (
                                    <input
                                        type="text"
                                        placeholder="https://example.com/logo.png"
                                        value={modalState.icon.startsWith('data:') ? '' : modalState.icon}
                                        onChange={(e) => setModalState(prev => ({ ...prev, icon: e.target.value }))}
                                        className="w-full px-3 py-2 rounded-xl border border-t2-line  bg-t2-sub  text-t2-ink  outline-none focus:border-t2-accent transition-colors"
                                    />
                                )}

                                {modalState.iconType === 'upload' && (
                                    <div className="flex items-center gap-3 pt-1">
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={handleFileUpload}
                                            className="hidden"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="px-3 py-2 rounded-xl border border-dashed border-t2-line  hover:border-t2-accent flex items-center gap-2 text-t2-ink-2  hover:bg-t2-sub  transition-all"
                                        >
                                            <Upload size={14} />
                                            <span>Bilddatei wählen...</span>
                                        </button>
                                        {safeUploadPreview && (
                                            <img
                                                src={safeUploadPreview}
                                                alt="Preview"
                                                className="w-8 h-8 rounded-lg object-contain border border-t2-line  bg-t2-surface "
                                            />
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-t2-line-soft ">
                            <button
                                onClick={() => setModalState(prev => ({ ...prev, isOpen: false }))}
                                className="px-3.5 py-1.5 rounded-xl font-medium text-t2-ink-2  hover:bg-t2-hover  transition-colors text-xs"
                            >
                                Abbrechen
                            </button>
                            <button
                                onClick={handleSaveLink}
                                disabled={!modalState.name.trim()}
                                className="px-4 py-1.5 rounded-xl font-bold bg-t2-accent text-t2-accent-ink hover:opacity-90 disabled:opacity-40 transition-colors text-xs shadow-sm shadow-blue-500/20"
                            >
                                Speichern
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
