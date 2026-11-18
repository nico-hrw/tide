import React, { useState } from 'react';
import { Check, Copy, Eye, Loader2, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { Button, Chip, IconButton, SelectField, TextField } from '../ui/Controls';
import { SettingsBlock } from '../ui/SettingsLayout';
import { cx } from '../ui/cx';
import { useT } from '../useT';
import type { DebugTools, ServerFile, TypeFilter } from './useDebugTools';

function BlobBadge({ status }: { status?: string }) {
    if (status === 'ok') return <Chip>200 OK</Chip>;
    if (status === '404') return <Chip className="!text-t2-late">404</Chip>;
    if (status === 'checking') return <Loader2 className="h-3 w-3 animate-spin text-t2-ink-3" aria-hidden />;
    return null;
}

function JsonModal({ file, onClose }: { file: ServerFile; onClose: () => void }) {
    const t = useT();
    const [copied, setCopied] = useState(false);
    const json = JSON.stringify(file, null, 2);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(json);
        } catch {
            /* Zwischenablage nicht verfuegbar */
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <div role="dialog" aria-label={t('debug.rawPayload')} className="fixed inset-0 z-[1100] flex items-center justify-center p-4" style={{ backgroundColor: 'color-mix(in srgb, var(--t2-ink) 40%, transparent)' }}>
            <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-modal bg-t2-surface shadow-modal ring-1 ring-t2-line">
                <div className="flex items-center justify-between gap-3 border-b border-t2-line px-4 py-3">
                    <h3 className="truncate text-[14px] font-semibold text-t2-ink">
                        {t('debug.rawPayload')} <span className="font-mono text-[12px] font-normal text-t2-ink-3">{file.id}</span>
                    </h3>
                    <div className="flex items-center gap-1">
                        <Button onClick={copy} icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}>{copied ? t('common.copied') : t('common.copy')}</Button>
                        <IconButton label={t('common.close')} onClick={onClose}><X className="h-4 w-4" /></IconButton>
                    </div>
                </div>
                <pre className="flex-1 select-all overflow-y-auto whitespace-pre-wrap break-all bg-t2-sub p-4 font-mono text-[11.5px] leading-relaxed text-t2-ink">{json}</pre>
                <div className="flex items-center justify-between border-t border-t2-line px-4 py-2.5 text-[12px] text-t2-ink-3">
                    <span>{t('debug.sizeType', { size: file.size || 0, type: file.type || 'note' })}</span>
                    <Button onClick={onClose}>{t('common.close')}</Button>
                </div>
            </div>
        </div>
    );
}

export function DebugExplorer({ tools }: { tools: DebugTools }) {
    const t = useT();
    const [jsonFile, setJsonFile] = useState<ServerFile | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const copyId = async (id: string) => {
        try {
            await navigator.clipboard.writeText(id);
        } catch {
            /* Zwischenablage nicht verfuegbar */
        }
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1500);
    };

    return (
        <>
            <SettingsBlock className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[160px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-t2-ink-3" aria-hidden />
                    <TextField block value={tools.query} onChange={(e) => tools.setQuery(e.target.value)} placeholder={t('debug.filter')} aria-label={t('debug.filter')} className="pl-8" />
                </div>
                <SelectField<TypeFilter>
                    label={t('debug.typeFilter')}
                    value={tools.typeFilter}
                    onChange={tools.setTypeFilter}
                    options={[
                        { value: 'all', label: t('debug.typeAll') },
                        { value: 'note', label: 'Notes' },
                        { value: 'canvas', label: 'Canvas' },
                        { value: 'folder', label: 'Folders' },
                        { value: 'event', label: 'Events' },
                    ]}
                />
            </SettingsBlock>
            <div className="max-h-80 overflow-auto">
                <table className="w-full min-w-[620px] border-collapse text-left text-[12.5px]">
                    <thead className="sticky top-0 z-10 bg-t2-sub text-[11px] font-semibold uppercase tracking-[0.05em] text-t2-ink-3">
                        <tr>
                            <th className="px-3 py-2">{t('debug.colTitle')}</th>
                            <th className="px-3 py-2">ID</th>
                            <th className="px-3 py-2">{t('debug.colType')}</th>
                            <th className="px-3 py-2">{t('debug.colUpdated')}</th>
                            <th className="px-3 py-2 text-right">{t('debug.colActions')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-t2-line-soft">
                        {tools.displayedFiles.length === 0 ? (
                            <tr><td colSpan={5} className="px-3 py-6 text-center text-t2-ink-3">{t('debug.noMatch')}</td></tr>
                        ) : (
                            tools.displayedFiles.map((file) => {
                                const title = tools.resolveTitle(file);
                                const isFolder = file.type === 'folder';
                                const status = tools.blobStatus[file.id];
                                return (
                                    <tr key={file.id} className={cx('hover:bg-t2-hover', file.id === tools.activeNoteId && 'bg-t2-sub')}>
                                        <td className="max-w-[160px] truncate px-3 py-2 font-medium text-t2-ink" title={title}>{title}</td>
                                        <td className="px-3 py-2 font-mono text-[11.5px] text-t2-ink-3">
                                            <span className="inline-flex items-center gap-1">
                                                {file.id.slice(0, 8)}…
                                                <IconButton label={t('debug.copyId')} onClick={() => copyId(file.id)}>
                                                    {copiedId === file.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                                </IconButton>
                                            </span>
                                        </td>
                                        <td className="px-3 py-2"><Chip className="font-mono">{file.type || 'note'}</Chip></td>
                                        <td className="whitespace-nowrap px-3 py-2 text-t2-ink-3">
                                            {file.updated_at ? new Date(file.updated_at).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="flex items-center justify-end gap-1">
                                                {!isFolder && <BlobBadge status={status} />}
                                                {!isFolder && (
                                                    <IconButton label={t('debug.testBlob')} onClick={() => tools.testBlob(file.id)} disabled={status === 'checking'}>
                                                        <RefreshCw className={cx('h-3.5 w-3.5', status === 'checking' && 'animate-spin')} />
                                                    </IconButton>
                                                )}
                                                <IconButton label={t('debug.showRaw')} onClick={() => setJsonFile(file)}><Eye className="h-3.5 w-3.5" /></IconButton>
                                                <IconButton label={t('debug.deletePermanent')} tone="danger" onClick={() => tools.deleteFile(file.id, title)}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
            {jsonFile && <JsonModal file={jsonFile} onClose={() => setJsonFile(null)} />}
        </>
    );
}
