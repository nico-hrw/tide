import { useMemo, useState } from "react";
import { ArrowDownToLine, FileText, Folder } from "lucide-react";
import { useDataStore } from "@/store/useDataStore";
import { normalizeSafe } from "@/lib/todoSafes";

const MAX_RESULTS = 8;
const label = (s: string) => (s === 'main' ? 'Standard' : s);
const NON_NOTE_TYPES = new Set(['event', 'task', 'todo', 'index', 'views', 'calendar_shares', 'canvas-asset']);

/**
 * Sidebar context menu entry "Aus Workspace ziehen": search a note or a whole folder of another
 * workspace by name and link it into the active workspace (it stays in its home workspace).
 */
export default function PullFromWorkspace({ onDone }: { onDone: () => void }) {
    const notes = useDataStore((s) => s.notes);
    const activeSafes = useDataStore((s) => s.activeSafes);
    const linkNoteToSafe = useDataStore((s) => s.linkNoteToSafe);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    const target = normalizeSafe(activeSafes?.[0] || 'main');

    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!open || !q) return [];
        return notes
            .filter((n) => {
                if (NON_NOTE_TYPES.has(String(n.type)) || n.isGroup) return false;
                const home = normalizeSafe(n.safe || n.metadata?.safe || 'main');
                const linked: string[] = (Array.isArray(n.linkedSafes) ? n.linkedSafes : Array.isArray(n.metadata?.linkedSafes) ? n.metadata.linkedSafes : []).map(normalizeSafe);
                if (home === target || linked.includes(target)) return false;
                return String(n.title || '').toLowerCase().includes(q);
            })
            .slice(0, MAX_RESULTS);
    }, [notes, query, open, target]);

    return (
        <div>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-t2-ink hover:bg-t2-hover rounded-lg transition-colors group"
            >
                <ArrowDownToLine size={16} className="text-t2-ink-3 group-hover:text-t2-accent" />
                <span className="font-medium">Aus Workspace ziehen</span>
            </button>
            {open && (
                <div className="px-2 pb-1">
                    <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Notiz oder Ordner suchen"
                        aria-label="Notiz oder Ordner suchen"
                        className="w-full rounded-lg border border-t2-line bg-transparent px-2.5 py-1.5 text-[13px] text-t2-ink outline-none placeholder:text-t2-ink-3"
                    />
                    <div role="listbox" className="mt-1 flex max-h-56 flex-col gap-0.5 overflow-y-auto">
                        {results.map((n) => {
                            const isFolder = n.type === 'folder';
                            const home = normalizeSafe(n.safe || n.metadata?.safe || 'main');
                            return (
                                <button
                                    key={n.id}
                                    type="button"
                                    role="option"
                                    aria-selected={false}
                                    onClick={() => { void linkNoteToSafe(n.id, target); onDone(); }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-t2-ink hover:bg-t2-hover"
                                >
                                    {isFolder ? <Folder size={13} className="shrink-0 text-amber-500" /> : <FileText size={13} className="shrink-0 text-t2-ink-3" />}
                                    <span className="truncate">{n.title || 'Unbenannt'}</span>
                                    <span className="ml-auto shrink-0 text-[11px] text-t2-ink-3">{label(home)}</span>
                                </button>
                            );
                        })}
                        {open && query.trim() && results.length === 0 && (
                            <div className="px-2 py-1.5 text-xs text-t2-ink-3">Nichts gefunden</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
