// Problem report of the vault export: every issue has a cause (`kind`) and a severity, the manifest
// keeps them apart (failures = real loss, warnings = detail missing, notices = no loss) and a grouped
// summary is written as lesbar/PROBLEME.txt.

import type { VaultIssue, VaultIssueKind, VaultIssueSeverity, VaultIssueSummary, VaultManifest } from './types';

export const ISSUE_SEVERITY: Record<VaultIssueKind, VaultIssueSeverity> = {
    'content-unreadable': 'loss',
    'no-access-key': 'loss',
    'custom-password': 'loss',
    'v1-unreadable': 'loss',
    'ydoc-unreadable': 'loss',
    'asset-missing': 'loss',
    'asset-unreadable': 'loss',
    'event-details-unreadable': 'partial',
    'meta-unreadable': 'partial',
    'raw-text': 'partial',
    'plaintext-event': 'info',
    'plaintext-note': 'info',
    'helper-file': 'info',
    'legacy-format': 'info',
    'unassigned-asset': 'info',
    'orphan-asset': 'info',
};

/** German line per cause for PROBLEME.txt (the UI uses the i18n keys `export.kind.<kind>`). */
export const ISSUE_LABEL_DE: Record<VaultIssueKind, string> = {
    'content-unreadable': 'Inhalt nicht lesbar',
    'no-access-key': 'Kein Schlüssel für dieses Konto, Inhalt nicht lesbar',
    'custom-password': 'Mit eigenem Passwort (PIN) geschützt, im Export nicht lesbar',
    'v1-unreadable': 'Altes V1-Format, Schlüssel nicht lesbar',
    'ydoc-unreadable': 'Notiz-Zustand (Bilder, Stift, Canvas) nicht entschlüsselbar',
    'asset-missing': 'Bild nicht mehr auf dem Server',
    'asset-unreadable': 'Bild nicht entschlüsselbar',
    'event-details-unreadable': 'Termin-Detailblob nicht lesbar, Titel/Zeit/Wiederholung/Beschreibung aus den Klartext-Daten exportiert',
    'meta-unreadable': 'Verschlüsselte Zusatz-Metadaten nicht lesbar, roh aufbewahrt (securedMetaRaw); Titel aus Klartext',
    'raw-text': 'Inhalt ist kein Editor-JSON, als Text aufbewahrt',
    'plaintext-event': 'Termin ohne verschlüsselten Detailblob (z. B. über API angelegt), alle Felder im Klartext exportiert',
    'plaintext-note': 'Unverschlüsselte Notiz (API oder öffentlich), Text exportiert',
    'helper-file': 'App-Hilfsdatei (alte Canvas-Stildatei), Inhalt aufbewahrt',
    'legacy-format': 'Altes V1-Format, über den alten Lesepfad exportiert',
    'unassigned-asset': 'Bild ohne Verweis aus einer Notiz, trotzdem exportiert (nicht zugeordnet)',
    'orphan-asset': 'Bild ohne Verweis und ohne lesbaren Schlüssel (wird nirgends angezeigt)',
};

const SEVERITY_ORDER: Record<VaultIssueSeverity, number> = { loss: 0, partial: 1, info: 2 };
const MAX_EXAMPLES = 10;

/** Never empty: WebCrypto failures are DOMExceptions with an empty message (e.g. a wrong key). */
export function describeError(e: unknown): string {
    if (e instanceof Error || (typeof DOMException !== 'undefined' && e instanceof DOMException)) {
        const err = e as Error;
        if (err.message) return err.message;
        if (err.name === 'OperationError') return 'OperationError: Schlüssel passt nicht zu den gespeicherten Daten';
        return err.name || 'Unbekannter Fehler';
    }
    const text = String(e ?? '');
    return text || 'Unbekannter Fehler';
}

export class IssueLog {
    readonly items: VaultIssue[] = [];

    add(kind: VaultIssueKind, file: { id: string; type: string; title: string }, part: string, error: string): void {
        this.items.push({ id: file.id, type: file.type, title: file.title, part, error, kind, severity: ISSUE_SEVERITY[kind] });
    }

    bySeverity(severity: VaultIssueSeverity): VaultIssue[] {
        return this.items.filter((i) => i.severity === severity);
    }

    summary(): VaultIssueSummary[] {
        const groups = new Map<VaultIssueKind, VaultIssueSummary>();
        for (const i of this.items) {
            const g = groups.get(i.kind) ?? { kind: i.kind, severity: i.severity, count: 0, byType: {}, examples: [] };
            g.count++;
            g.byType[i.type] = (g.byType[i.type] ?? 0) + 1;
            const label = i.title || i.id;
            if (g.examples.length < MAX_EXAMPLES && !g.examples.includes(label)) g.examples.push(label);
            groups.set(i.kind, g);
        }
        return [...groups.values()].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count);
    }
}

const TYPE_DE: Record<string, string> = {
    note: 'Notiz', event: 'Termin', folder: 'Ordner', canvas: 'Canvas', 'canvas-asset': 'Bild', views: 'Ansicht', variables: 'Variablen',
};

function typeList(byType: Record<string, number>): string {
    return Object.entries(byType).map(([t, n]) => `${n} ${TYPE_DE[t] ?? t}`).join(', ');
}

/** lesbar/PROBLEME.txt: what is missing, what is only partly there, and what is safely in the archive. */
export function problemsText(manifest: VaultManifest): string {
    const summary = manifest.summary ?? [];
    const section = (severity: VaultIssueSeverity, heading: string, empty: string): string[] => {
        const rows = summary.filter((s) => s.severity === severity);
        if (rows.length === 0) return [heading, `  ${empty}`, ''];
        const out = [heading];
        for (const s of rows) {
            out.push(`  ${s.count} x ${ISSUE_LABEL_DE[s.kind]} (${typeList(s.byType)})`);
            for (const ex of s.examples) out.push(`      - ${ex}`);
            if (s.count > s.examples.length) out.push(`      ... und ${s.count - s.examples.length} weitere (siehe manifest.json)`);
        }
        out.push('');
        return out;
    };
    const files = Object.entries(manifest.counts).map(([t, n]) => `${n} ${TYPE_DE[t] ?? t}`).join(', ');
    const unassigned = manifest.unassignedAssets?.length ?? 0;
    return [
        'Tide-Export: Bericht über Lücken',
        '================================',
        '',
        'Sicher im Archiv',
        `  Dateien: ${files || 'keine'}`,
        `  Bilder: ${manifest.assetCount} (davon ${unassigned} ohne Zuordnung unter assets/)`,
        `  Todos: ${manifest.taskCount}`,
        '  Alle Termine stehen mit Titel, Zeit, Ganztägigkeit, Wiederholung, Ausnahmen und Tags in tree.json',
        '  und in lesbar/kalender.ics, auch wenn ihr Detailblob fehlt.',
        '',
        ...section('loss', 'ECHTE VERLUSTE (Inhalt fehlt im Archiv)', 'keine'),
        ...section('partial', 'TEILWEISE (Eintrag ist drin, ein Zusatzdetail fehlt oder liegt nur roh vor)', 'keine'),
        ...section('info', 'HINWEISE (nichts verloren)', 'keine'),
        `Bewusst übersprungen: ${manifest.skipped.length} (mit dir geteilte Dateien, App-Index). Details in manifest.json.`,
        '',
    ].join('\n');
}
