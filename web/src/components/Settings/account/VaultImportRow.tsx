import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { SettingsRow } from '../ui/SettingsLayout';
import { Button, ConfirmButton, Notice, Toggle } from '../ui/Controls';
import { useT } from '../useT';
import { openVaultArchive } from '@/lib/vaultExport/archive';
import { importVault, type ImportProgress, type ImportReport } from '@/lib/vaultExport/importVault';

interface Picked {
    bytes: Uint8Array;
    date: string;
    files: number;
    assets: number;
    tasks: number;
    exportFailures: number;
}

type Outcome = { tone: 'success' | 'error'; lines: string[] };

const PHASE_KEYS = {
    checking: 'import.phase.checking',
    folders: 'import.phase.folders',
    notes: 'import.phase.notes',
    events: 'import.phase.events',
    todos: 'import.phase.todos',
    verifying: 'import.phase.verifying',
    done: 'import.phase.verifying',
} as const;

/** Import half of the vault export card: pick ZIP, see what is inside, confirm, watch progress, read the report. */
export function VaultImportRow() {
    const t = useT();
    const input = useRef<HTMLInputElement>(null);
    const [picked, setPicked] = useState<Picked | null>(null);
    const [intoFolder, setIntoFolder] = useState(true);
    const [progress, setProgress] = useState<ImportProgress | null>(null);
    const [outcome, setOutcome] = useState<Outcome | null>(null);
    const running = progress !== null;

    const choose = async (file: File | undefined) => {
        if (!file) return;
        setOutcome(null);
        setPicked(null);
        try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const { manifest } = openVaultArchive(bytes);
            const files = Object.values(manifest.counts).reduce((a, b) => a + b, 0);
            setPicked({ bytes, date: manifest.exportedAt.slice(0, 10), files, assets: manifest.assetCount, tasks: manifest.taskCount, exportFailures: manifest.failures.length });
        } catch (err) {
            setOutcome({ tone: 'error', lines: [t('import.failed', { message: err instanceof Error ? err.message : String(err) })] });
        } finally {
            if (input.current) input.current.value = '';
        }
    };

    const run = async () => {
        if (!picked) return;
        setOutcome(null);
        setProgress({ phase: 'checking', current: 0, total: 0 });
        try {
            const report: ImportReport = await importVault(picked.bytes, { intoFolder, onProgress: setProgress });
            const files = Object.values(report.created).reduce((a, b) => a + b, 0);
            const problems = report.failures.length + report.missing.length > 0;
            const head = problems
                ? t('import.doneIssues', { failures: report.failures.length, missing: report.missing.length })
                : report.exportFailures > 0
                  ? t('import.doneExportGaps')
                  : t('import.done', { files, images: report.images, todos: report.todos });
            const details = report.failures.slice(0, 5).map((f) => t('import.failedItem', { title: f.title || f.id, error: f.error }));
            setOutcome({ tone: report.complete ? 'success' : 'error', lines: [head, ...details] });
            if (!problems) setPicked(null);
        } catch (err) {
            setOutcome({ tone: 'error', lines: [t('import.failed', { message: err instanceof Error ? err.message : String(err) })] });
        } finally {
            setProgress(null);
        }
    };

    const status = progress ? t(PHASE_KEYS[progress.phase], { current: progress.current, total: progress.total }) : null;

    return (
        <>
            <SettingsRow title={t('import.row')} description={t('import.rowDesc')}>
                <Button onClick={() => input.current?.click()} disabled={running} icon={<Upload className="h-[15px] w-[15px]" />}>{t('import.choose')}</Button>
                <input ref={input} type="file" accept=".zip,application/zip" className="hidden" aria-label={t('import.row')} onChange={(e) => void choose(e.target.files?.[0])} />
            </SettingsRow>
            {picked && (
                <SettingsRow
                    title={t('import.summary', { date: picked.date, files: picked.files, assets: picked.assets, tasks: picked.tasks })}
                    description={picked.exportFailures > 0 ? t('import.exportIncomplete', { failures: picked.exportFailures }) : undefined}
                >
                    <Toggle checked={intoFolder} onChange={setIntoFolder} label={t('import.intoFolder')} disabled={running} />
                    <ConfirmButton variant="primary" label={running ? t('import.running') : t('import.start')} confirmLabel={t('import.confirm')} onConfirm={run} disabled={running} />
                </SettingsRow>
            )}
            {(status || outcome) && (
                <div className="flex flex-col gap-2 px-4 py-3">
                    {status && <Notice>{status}</Notice>}
                    {outcome?.lines.map((line) => (
                        <Notice key={line} tone={outcome.tone}>{line}</Notice>
                    ))}
                </div>
            )}
        </>
    );
}
