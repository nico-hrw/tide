import React, { useState } from 'react';
import { Bookmark, Plus, X } from 'lucide-react';
import { useReferenceStore, ReferenceItem } from '@/store/useReferenceStore';

export const REFERENCE_PALETTE = [
    { label: 'Blue', value: '#3b82f6' },
    { label: 'Green', value: '#10b981' },
    { label: 'Amber', value: '#f59e0b' },
    { label: 'Red', value: '#ef4444' },
    { label: 'Purple', value: '#8b5cf6' },
    { label: 'Pink', value: '#ec4899' },
] as const;

export const QUICK_EMOJIS = ['🔖', '💡', '📌', '⭐', '🏷️', '📖'] as const;

export function ReferencesDictionary() {
    const references = useReferenceStore((state) => state.references);
    const removeReference = useReferenceStore((state) => state.removeReference);
    const updateReference = useReferenceStore((state) => state.updateReference);
    const addReference = useReferenceStore((state) => state.addReference);

    const [editRefId, setEditRefId] = useState<string | null>(null);
    const [editRefTerm, setEditRefTerm] = useState('');
    const [editRefColor, setEditRefColor] = useState<string | undefined>(undefined);
    const [editRefEmoji, setEditRefEmoji] = useState('');
    const [isAddingRef, setIsAddingRef] = useState(false);
    const [newRefTerm, setNewRefTerm] = useState('');
    const [newRefPreview, setNewRefPreview] = useState('');
    const [newRefColor, setNewRefColor] = useState<string | undefined>(undefined);
    const [newRefEmoji, setNewRefEmoji] = useState('');

    const handleStartEditRef = (r: ReferenceItem) => {
        setEditRefId(r.id);
        setEditRefTerm(r.term);
        setEditRefColor(r.color);
        setEditRefEmoji(r.emoji || '');
    };

    const handleSaveEditRef = () => {
        if (!editRefId) return;
        const trimmed = editRefTerm.trim();
        if (trimmed) {
            updateReference(editRefId, {
                term: trimmed,
                color: editRefColor,
                emoji: editRefEmoji.trim() || undefined,
            });
        }
        setEditRefId(null);
        setEditRefTerm('');
        setEditRefColor(undefined);
        setEditRefEmoji('');
    };

    const handleCancelEditRef = () => {
        setEditRefId(null);
        setEditRefTerm('');
        setEditRefColor(undefined);
        setEditRefEmoji('');
    };

    const handleCreateRef = () => {
        const trimmed = newRefTerm.trim();
        if (!trimmed) return;
        addReference({
            term: trimmed,
            previewText: newRefPreview.trim() || `Definition für "${trimmed}"`,
            sourceNoteId: '',
            color: newRefColor,
            emoji: newRefEmoji.trim() || undefined,
        });
        setNewRefTerm('');
        setNewRefPreview('');
        setNewRefColor(undefined);
        setNewRefEmoji('');
        setIsAddingRef(false);
    };

    return (
        <div className="w-full mt-4 pt-4 border-t border-gray-100 dark:border-white/5 animate-in slide-in-from-top-2">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Reference Dictionary ({references.length})
                </h4>
                <button
                    type="button"
                    onClick={() => setIsAddingRef(!isAddingRef)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#111827] dark:text-white hover:underline cursor-pointer"
                >
                    <Plus className="w-3.5 h-3.5" />
                    {isAddingRef ? 'Abbrechen' : 'Begriff hinzufügen'}
                </button>
            </div>

            {isAddingRef && (
                <div className="p-3 mb-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-[#e5e7eb] dark:border-zinc-700 space-y-3">
                    <div className="text-xs font-bold text-[#111827] dark:text-white">Neuen Begriff hinzufügen</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                            type="text"
                            placeholder="Begriff (z.B. API, Docker...)"
                            value={newRefTerm}
                            onChange={(e) => setNewRefTerm(e.target.value)}
                            className="bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400"
                        />
                        <input
                            type="text"
                            placeholder="Beschreibung / Vorschau (optional)"
                            value={newRefPreview}
                            onChange={(e) => setNewRefPreview(e.target.value)}
                            className="bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400"
                        />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-medium text-gray-500">Farbe:</span>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setNewRefColor(undefined)}
                                    className={`w-5 h-5 rounded-full border text-[9px] flex items-center justify-center transition-all ${
                                        !newRefColor ? 'border-gray-900 dark:border-white ring-2 ring-gray-900/30' : 'border-gray-300 dark:border-zinc-600'
                                    }`}
                                    title="Keine Farbe"
                                >
                                    ✕
                                </button>
                                {REFERENCE_PALETTE.map((c) => (
                                    <button
                                        key={c.value}
                                        type="button"
                                        onClick={() => setNewRefColor(c.value)}
                                        className={`w-5 h-5 rounded-full transition-transform ${
                                            newRefColor === c.value ? 'ring-2 ring-offset-2 ring-gray-900 dark:ring-white scale-110' : 'hover:scale-105'
                                        }`}
                                        style={{ backgroundColor: c.value }}
                                        title={c.label}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-medium text-gray-500">Emoji:</span>
                            <div className="flex items-center gap-1">
                                {QUICK_EMOJIS.map((em) => (
                                    <button
                                        key={em}
                                        type="button"
                                        onClick={() => setNewRefEmoji(newRefEmoji === em ? '' : em)}
                                        className={`w-6 h-6 rounded-md text-xs flex items-center justify-center transition-all ${
                                            newRefEmoji === em
                                                ? 'bg-gray-200 dark:bg-white/20 border border-gray-400'
                                                : 'hover:bg-gray-100 dark:hover:bg-white/10'
                                        }`}
                                    >
                                        {em}
                                    </button>
                                ))}
                                <input
                                    type="text"
                                    maxLength={4}
                                    placeholder="Emoji"
                                    value={newRefEmoji}
                                    onChange={(e) => setNewRefEmoji(e.target.value)}
                                    className="w-12 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-md px-1.5 py-0.5 text-xs text-center text-gray-900 dark:text-white outline-none"
                                    title="Eigenes Emoji eingeben"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                        <button
                            type="button"
                            onClick={() => {
                                setIsAddingRef(false);
                                setNewRefTerm('');
                                setNewRefPreview('');
                                setNewRefColor(undefined);
                                setNewRefEmoji('');
                            }}
                            className="px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                            Abbrechen
                        </button>
                        <button
                            type="button"
                            onClick={handleCreateRef}
                            disabled={!newRefTerm.trim()}
                            className="px-3 py-1 bg-[#111827] hover:bg-[#2c2c2c] text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 rounded-[8px] text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                            Hinzufügen
                        </button>
                    </div>
                </div>
            )}

            <div className="max-h-[220px] overflow-y-auto space-y-2 pr-2">
                {references.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No references saved yet.</p>
                ) : references.map((r) => (
                    <div key={r.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5">
                        {editRefId === r.id ? (
                            <div className="p-2 rounded-lg bg-gray-50 dark:bg-white/5 border border-[#e5e7eb] dark:border-zinc-700 space-y-2 w-full">
                                <div className="flex items-center gap-2">
                                    <input
                                        autoFocus
                                        value={editRefTerm}
                                        onChange={(e) => setEditRefTerm(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleSaveEditRef();
                                            if (e.key === 'Escape') {
                                                e.stopPropagation();
                                                handleCancelEditRef();
                                            }
                                        }}
                                        className="bg-white dark:bg-black/40 border border-[#e5e7eb] dark:border-zinc-700 focus:ring-2 focus:ring-[#111827] focus:ring-offset-2 dark:focus:ring-zinc-400 rounded px-2 py-1 text-sm font-bold text-gray-900 dark:text-white outline-none flex-1"
                                        placeholder="Begriff..."
                                    />
                                    <button
                                        type="button"
                                        onClick={handleSaveEditRef}
                                        className="px-2.5 py-1 bg-[#111827] hover:bg-[#2c2c2c] text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 rounded-[8px] text-xs font-semibold transition-all"
                                    >
                                        Speichern
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCancelEditRef}
                                        className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                                    >
                                        Abbrechen
                                    </button>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-blue-200/60 dark:border-blue-800/60">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">Farbe:</span>
                                        <button
                                            type="button"
                                            onClick={() => setEditRefColor(undefined)}
                                            className={`w-4 h-4 rounded-full border text-[8px] flex items-center justify-center transition-all ${
                                                !editRefColor ? 'border-blue-500 ring-2 ring-blue-500/30 font-bold' : 'border-gray-300 dark:border-zinc-600'
                                            }`}
                                            title="Keine Farbe"
                                        >
                                            ✕
                                        </button>
                                        {REFERENCE_PALETTE.map((c) => (
                                            <button
                                                key={c.value}
                                                type="button"
                                                onClick={() => setEditRefColor(c.value)}
                                                className={`w-4 h-4 rounded-full transition-transform ${
                                                    editRefColor === c.value ? 'ring-2 ring-offset-1 ring-blue-500 scale-110' : 'hover:scale-105'
                                                }`}
                                                style={{ backgroundColor: c.value }}
                                                title={c.label}
                                            />
                                        ))}
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">Emoji:</span>
                                        {QUICK_EMOJIS.map((em) => (
                                            <button
                                                key={em}
                                                type="button"
                                                onClick={() => setEditRefEmoji(editRefEmoji === em ? '' : em)}
                                                className={`w-5 h-5 rounded text-xs flex items-center justify-center transition-all ${
                                                    editRefEmoji === em
                                                        ? 'bg-blue-200 dark:bg-blue-800 border border-blue-500'
                                                        : 'hover:bg-gray-100 dark:hover:bg-white/10'
                                                }`}
                                            >
                                                {em}
                                            </button>
                                        ))}
                                        <input
                                            type="text"
                                            maxLength={4}
                                            placeholder="Emoji"
                                            value={editRefEmoji}
                                            onChange={(e) => setEditRefEmoji(e.target.value)}
                                            className="w-10 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded px-1 py-0.5 text-xs text-center text-gray-900 dark:text-white outline-none"
                                            title="Eigenes Emoji"
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div
                                    className="flex-1 min-w-0 mr-2 cursor-pointer group"
                                    onClick={() => handleStartEditRef(r)}
                                    title="Klicken zum Bearbeiten"
                                >
                                    <div className="flex items-center gap-1.5">
                                        {r.color && (
                                            <span
                                                className="w-2.5 h-2.5 rounded-full inline-block shrink-0 ring-1 ring-black/10 dark:ring-white/20"
                                                style={{ backgroundColor: r.color }}
                                                title={`Farbe: ${r.color}`}
                                            />
                                        )}
                                        {r.emoji && (
                                            <span className="text-sm leading-none shrink-0" title={`Emoji: ${r.emoji}`}>
                                                {r.emoji}
                                            </span>
                                        )}
                                        <span className="text-sm font-bold text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                            {r.term}
                                        </span>
                                    </div>
                                    <div className="text-xs text-gray-500 truncate mt-0.5">{r.previewText || 'No custom preview generated'}</div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => handleStartEditRef(r)}
                                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/20 rounded-md transition-colors"
                                        title="Bearbeiten"
                                    >
                                        <Bookmark className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => removeReference(r.id)}
                                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20 rounded-md transition-colors"
                                        title="Löschen"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

export default ReferencesDictionary;
