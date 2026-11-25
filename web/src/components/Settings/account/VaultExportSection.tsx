import { useState } from 'react';
import { Download } from 'lucide-react';
import { SettingsCard, SettingsRow, SettingsSection } from '../ui/SettingsLayout';
import { Button, Chip, Notice } from '../ui/Controls';
import { useT } from '../useT';
import { VaultImportRow } from './VaultImportRow';
import { exportVault } from '@/lib/vaultExport/exportVault';
import type { VaultExportProgress, VaultIssueSeverity, VaultManifest } from '@/lib/vaultExport/types';
import type { SettingsKey } from '@/lib/i18n';

type Line = { tone: 'success' | 'error' | 'info'; text: string };
type Outcome = Line[];
type Translate = ReturnType<typeof useT>;

const HEADINGS: Array<{ severity: VaultIssueSeverity; key: SettingsKey; tone: Line['tone'] }> = [
    { severity: 'loss', key: 'export.lossHeading', tone: 'error' },
    { severity: 'partial', key: 'export.partialHeading', tone: 'info' },
    { severity: 'info', key: 'export.infoHeading', tone: 'info' },
];

/** Separates real loss ("content missing") from missing extra details and from notes without any loss. */
function exportOutcome(manifest: VaultManifest, t: Translate): Outcome {
    const files = Object.values(manifest.counts).reduce((a, b) => a + b, 0);
    const summary = manifest.summary ?? [];
    const lines: Line[] = [{ tone: 'success', text: t('export.done', { files, assets: manifest.assetCount, tasks: manifest.taskCount }) }];
    for (const h of HEADINGS) {
        const rows = summary.filter((s) => s.severity === h.severity);
        if (rows.length === 0) continue;
        const count = rows.reduce((n, s) => n + s.count, 0);
        const kinds = rows.map((s) => t('export.kindLine', { count: s.count, label: t(`export.kind.${s.kind}` as SettingsKey) })).join(' · ');
        lines.push({ tone: h.tone, text: `${t(h.key, { count })} ${kinds}` });
    }
    if (summary.length > 0) lines.push({ tone: 'info', text: t('export.reportHint') });
    if (manifest.skipped.length > 0) lines.push({ tone: 'info', text: t('export.skipped', { skipped: manifest.skipped.length }) });
    return lines;
}

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
            setOutcome(exportOutcome(manifest, t));
        } catch (err) {
            setOutcome([{ tone: 'error', text: t('export.failed', { message: err instanceof Error ? err.message : String(err) }) }]);
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
                <VaultImportRow />
            </SettingsCard>
            {(status || outcome) && (
                <div className="mt-3 flex flex-col gap-2">
                    {status && <Notice>{status}</Notice>}
                    {outcome?.map((line) => (
                        <Notice key={line.text} tone={line.tone}>{line.text}</Notice>
                    ))}
                </div>
            )}
        </SettingsSection>
    );
}
