import React from 'react';
import { Check, Copy, Loader2, Search } from 'lucide-react';
import { SettingsCard, SettingsRow, SettingsSection } from '../ui/SettingsLayout';
import { Button, ConfirmButton, IconButton, Notice, StatusPill } from '../ui/Controls';
import { useT } from '../useT';
import { DebugExplorer } from './DebugExplorer';
import { useDebugTools } from './useDebugTools';

/** Die vier Debug-Sektionen: Zustand, Audit, Reparatur, Dateien. Wird erst nach dem Aufklappen geladen. */
export function DebugSections() {
    const t = useT();
    const tools = useDebugTools();
    const { report, running, scanning } = tools;
    const [copied, setCopied] = React.useState(false);

    const copyActive = async () => {
        if (!tools.activeNoteId) return;
        try {
            await navigator.clipboard.writeText(tools.activeNoteId);
        } catch {
            /* Zwischenablage nicht verfuegbar */
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const serverCount = tools.serverFiles !== null ? tools.serverFiles.length : tools.loadingFiles ? '…' : '—';
    const verdict = (n: number) => (n > 0 ? <StatusPill tone="warn">{n}</StatusPill> : <StatusPill>{n}</StatusPill>);

    return (
        <>
            <SettingsSection title={t('debug.state')} hint={t('debug.stateHint')}>
                <SettingsCard>
                    <SettingsRow title={t('debug.notes')} description={t('debug.notesDesc')}>
                        <span className="tabular-nums text-t2-ink">{tools.notes.length} / {serverCount}</span>
                    </SettingsRow>
                    <SettingsRow title={t('debug.activeNote')} description={t('debug.activeNoteDesc')}>
                        {tools.activeNoteId ? (
                            <>
                                <code className="font-mono text-[12.5px] text-t2-ink">{tools.activeNoteId.slice(0, 8)}…</code>
                                <IconButton label={t('debug.copyId')} onClick={copyActive}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</IconButton>
                            </>
                        ) : (
                            <span className="text-t2-ink-3">{t('common.none')}</span>
                        )}
                    </SettingsRow>
                    <SettingsRow title={t('debug.tabs')} description={t('debug.tabsDesc')}>
                        <span className="tabular-nums text-t2-ink">{tools.openTabsCount}</span>
                    </SettingsRow>
                    <SettingsRow title={t('debug.dirs')} description={Array.from(tools.loadedDirectories).slice(0, 2).join(', ') || 'root'}>
                        <span className="tabular-nums text-t2-ink">{tools.loadedDirectories.size}</span>
                    </SettingsRow>
                </SettingsCard>
            </SettingsSection>

            <SettingsSection title={t('debug.audit')} hint={t('debug.auditHint')}>
                <SettingsCard>
                    <SettingsRow title={t('debug.scan')} description={t('debug.scanDesc')}>
                        <Button
                            variant="primary"
                            onClick={tools.runAudit}
                            disabled={scanning}
                            icon={scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                        >
                            {scanning ? (tools.scanProgress ? `${tools.scanProgress.current}/${tools.scanProgress.total}` : t('debug.scanning')) : t('debug.scanAction')}
                        </Button>
                    </SettingsRow>
                    {report && (
                        <>
                            <SettingsRow title={t('debug.missingBlobs')} description={t('debug.missingBlobsDesc')}>{verdict(report.missingBlobFiles.length)}</SettingsRow>
                            <SettingsRow title={t('debug.emptyNotes')} description={t('debug.emptyNotesDesc')}>{verdict(report.untitledEmptyFiles.length)}</SettingsRow>
                            <SettingsRow title={t('debug.orphans')} description={t('debug.orphansDesc')}>{verdict(report.orphanedFiles.length)}</SettingsRow>
                        </>
                    )}
                </SettingsCard>
                {tools.feedback && (
                    <div className="mt-3">
                        <Notice tone={tools.feedback.type === 'error' ? 'error' : tools.feedback.type === 'success' ? 'success' : 'info'}>{tools.feedback.message}</Notice>
                    </div>
                )}
            </SettingsSection>

            <SettingsSection title={t('debug.repair')} hint={t('debug.repairHint')} tone="danger">
                <SettingsCard tone="danger">
                    <SettingsRow title={t('debug.purge')} description={t('debug.purgeDesc', { n: report?.missingBlobFiles.length || 0 })}>
                        <ConfirmButton label={t('debug.purgeAction')} confirmLabel={t('debug.confirm')} onConfirm={tools.purgeGhosts} disabled={running !== null || !report?.missingBlobFiles.length} />
                    </SettingsRow>
                    <SettingsRow title={t('debug.deleteEmpty')} description={t('debug.deleteEmptyDesc', { n: report?.untitledEmptyFiles.length || 0 })}>
                        <ConfirmButton label={t('debug.deleteEmptyAction')} confirmLabel={t('debug.confirm')} onConfirm={tools.deleteEmpty} disabled={running !== null || !report?.untitledEmptyFiles.length} />
                    </SettingsRow>
                    <SettingsRow title={t('debug.resync')} description={t('debug.resyncDesc')}>
                        <ConfirmButton label={t('debug.resyncAction')} confirmLabel={t('debug.confirm')} onConfirm={tools.deepResync} disabled={running !== null} />
                    </SettingsRow>
                </SettingsCard>
            </SettingsSection>

            <SettingsSection title={t('debug.files', { n: tools.displayedFiles.length })} hint={t('debug.filesHint')}>
                <SettingsCard>
                    <DebugExplorer tools={tools} />
                </SettingsCard>
            </SettingsSection>
        </>
    );
}
