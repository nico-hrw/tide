import { useState } from 'react';
import { Download } from 'lucide-react';
import { SettingsCard, SettingsRow, SettingsSection } from '../ui/SettingsLayout';
import { Button, Chip, Notice } from '../ui/Controls';
import { useT } from '../useT';
import { exportVault } from '@/lib/vaultExport/exportVault';
import type { VaultExportProgress } from '@/lib/vaultExport/types';

type Outcome = { tone: 'success' | 'error'; lines: string[] };

function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Full-vault export: one ZIP with everything the user owns (see lib/vaultExport). */
export function VaultExportSection() {
    const t = useT();
    const [progress, setProgress] = useState<VaultExportProgress | null>(null);
    const [outcome, setOutcome] = useState<Outcome | null>(null);
    const running = progress !== null;

    const run = async () => {
        setOutcome(null);
        setProgress({ phase: 'listing', current: 0, total: 0 });
        try {
            const { blob, filename, manifest } = await exportVault(setProgress);
            download(blob, filename);
            const files = Object.values(manifest.counts).reduce((a, b) => a + b, 0);
            const lines = [
                manifest.failures.length > 0
                    ? t('export.doneIssues', { failures: manifest.failures.length })
                    : t('export.done', { files, assets: manifest.assetCount, tasks: manifest.taskCount }),
            ];
            if (manifest.skipped.length > 0) lines.push(t('export.skipped', { skipped: manifest.skipped.length }));
            setOutcome({ tone: manifest.failures.length > 0 ? 'error' : 'success', lines });
        } catch (err) {
            setOutcome({ tone: 'error', lines: [t('export.failed', { message: err instanceof Error ? err.message : String(err) })] });
        } finally {
            setProgress(null);
        }
    };

    const status = progress
        ? progress.phase === 'reading'
            ? t('export.phase.reading', { current: progress.current, total: progress.total })
            : progress.phase === 'packing'
              ? t('export.phase.packing')
              : t('export.phase.listing')
        : null;

    return (
        <SettingsSection title={t('export.section')} hint={t('export.sectionHint')} action={<Chip>{t('export.plaintext')}</Chip>}>
            <SettingsCard>
                <SettingsRow title={t('export.row')} description={t('export.rowDesc')}>
                    <Button onClick={run} disabled={running} icon={<Download className="h-[15px] w-[15px]" />}>
                        {running ? t('export.running') : t('export.action')}
                    </Button>
                </SettingsRow>
            </SettingsCard>
            {(status || outcome) && (
                <div className="mt-3 flex flex-col gap-2">
                    {status && <Notice>{status}</Notice>}
                    {outcome?.lines.map((line) => (
                        <Notice key={line} tone={outcome.tone}>{line}</Notice>
                    ))}
                </div>
            )}
        </SettingsSection>
    );
}
