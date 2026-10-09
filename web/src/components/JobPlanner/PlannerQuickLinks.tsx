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
        let finalUrl = modalState.url.trim();
        if (finalUrl && !finalUrl.startsWith('http://') && !finalUrl.startsWith('https://') && !finalUrl.startsWith('/')) {
            finalUrl = `https://${finalUrl}`;
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
            const dataUrl = event.target?.result as string;
            if (dataUrl) {
                setModalState(prev => ({
                    ...prev,
                    icon: dataUrl,
                    iconType: 'upload',
                }));
            }
        };
        reader.readAsDataURL(file);
    };

    const handleIconClick = (link: PlannerQuickLink) => {
        if (!link.url) return;
        const targetUrl = link.url.startsWith('http') || link.url.startsWith('/') 
            ? link.url 
            : `https://${link.url}`;
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
        
        // Custom uploaded image or HTTP URL
        if (iconValue.startsWith('data:') || iconValue.startsWith('http')) {
            return (
                <img 
                    src={iconValue} 
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
        return <IconComp size={24} className="text-gray-700 dark:text-gray-200" />;
    };

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
                            className="group relative w-13 h-13 md:w-14 md:h-14 rounded-2xl bg-white dark:bg-[#1a1a1a] border border-gray-200/80 dark:border-white/10 flex items-center justify-center cursor-pointer shadow-xs hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all"
                        >
                            {renderIconContent(link)}
                            {/* Hover tooltip */}
                            <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[11px] font-semibold px-2.5 py-1 rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-30 shadow-md">
                                {link.name}
                            </div>
                        </div>
                    ))}

                    {/* Add Button matching Figma (+) */}
                    <button
                        onClick={openAddModal}
                        title="Neuen Quick Link hinzufügen"
                        className="w-13 h-13 md:w-14 md:h-14 rounded-2xl bg-gray-100/80 dark:bg-white/10 border border-gray-200/80 dark:border-white/10 flex items-center justify-center cursor-pointer text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-white/15 hover:border-blue-300 dark:hover:border-blue-500 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all"
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
                    className="fixed z-50 min-w-[170px] bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-white/10 rounded-xl shadow-xl py-1 text-xs animate-in fade-in zoom-in-95 duration-100"
                >
                    <div className="px-3 py-1.5 font-bold text-gray-400 text-[10px] uppercase border-b border-gray-100 dark:border-white/5 truncate">
                        {contextMenu.link.name}
                    </div>
                    {contextMenu.link.url && (
                        <button
                            onClick={() => {
                                handleIconClick(contextMenu.link);
                                setContextMenu(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-left"
                        >
                            <ExternalLink size={13} className="text-gray-400" />
                            <span>In neuem Tab öffnen</span>
                        </button>
                    )}
                    <button
                        onClick={() => openEditModal(contextMenu.link)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-left"
                    >
                        <Edit2 size={13} className="text-blue-500" />
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
                    <div className="w-full max-w-md bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl p-5 animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-white/5">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <LinkIcon size={16} className="text-blue-500" />
                                {modalState.editingId ? 'Quick Link bearbeiten' : 'Neuen Quick Link erstellen'}
                            </h3>
                            <button
                                onClick={() => setModalState(prev => ({ ...prev, isOpen: false }))}
                                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="space-y-4 py-4 text-xs">
                            {/* Name Input */}
                            <div>
                                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                    Name
                                </label>
                                <input
                                    type="text"
                                    placeholder="z.B. Moodle, ILIAS, GitHub..."
                                    value={modalState.name}
                                    onChange={(e) => setModalState(prev => ({ ...prev, name: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white outline-none focus:border-blue-500 transition-colors"
                                />
                            </div>

                            {/* URL Input */}
                            <div>
                                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                    Link / URL
                                </label>
                                <input
                                    type="text"
                                    placeholder="https://..."
                                    value={modalState.url}
                                    onChange={(e) => setModalState(prev => ({ ...prev, url: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white outline-none focus:border-blue-500 transition-colors"
                                />
                            </div>

                            {/* Icon Selection */}
                            <div>
                                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                    Icon auswählen
                                </label>
                                <div className="flex gap-2 mb-2">
                                    <button
                                        type="button"
                                        onClick={() => setModalState(prev => ({ ...prev, iconType: 'preset' }))}
                                        className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                                            modalState.iconType === 'preset'
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300'
                                        }`}
                                    >
                                        Standard-Icons
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setModalState(prev => ({ ...prev, iconType: 'url' }))}
                                        className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                                            modalState.iconType === 'url'
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300'
                                        }`}
                                    >
                                        Bild-URL
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setModalState(prev => ({ ...prev, iconType: 'upload' }))}
                                        className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                                            modalState.iconType === 'upload'
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300'
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
                                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                                        : 'border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 text-gray-600 dark:text-gray-400'
                                                }`}
                                            >
                                                <Comp size={18} />
                                                <span className="text-[10px] truncate max-w-full">{key}</span>
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
                                        className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white outline-none focus:border-blue-500 transition-colors"
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
                                            className="px-3 py-2 rounded-xl border border-dashed border-gray-300 dark:border-white/20 hover:border-blue-500 flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-all"
                                        >
                                            <Upload size={14} />
                                            <span>Bilddatei wählen...</span>
                                        </button>
                                        {modalState.icon.startsWith('data:') && (
                                            <img
                                                src={modalState.icon}
                                                alt="Preview"
                                                className="w-8 h-8 rounded-lg object-contain border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20"
                                            />
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100 dark:border-white/5">
                            <button
                                onClick={() => setModalState(prev => ({ ...prev, isOpen: false }))}
                                className="px-3.5 py-1.5 rounded-xl font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-xs"
                            >
                                Abbrechen
                            </button>
                            <button
                                onClick={handleSaveLink}
                                disabled={!modalState.name.trim()}
                                className="px-4 py-1.5 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors text-xs shadow-sm shadow-blue-500/20"
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
