import { describe, expect, it } from 'vitest';
import { settingsCoreDe } from '@/lib/i18n/settingsCore.de';
import { settingsCoreEn } from '@/lib/i18n/settingsCore.en';
import { ISSUE_LABEL_DE, ISSUE_SEVERITY, IssueLog, describeError, problemsText } from '../issues';
import type { VaultManifest } from '../types';

describe('vault export issue report', () => {
  it('has a UI label in German and English for every cause', () => {
    for (const kind of Object.keys(ISSUE_SEVERITY)) {
      const key = `export.kind.${kind}`;
      expect(settingsCoreDe).toHaveProperty([key]);
      expect(settingsCoreEn).toHaveProperty([key]);
      expect(ISSUE_LABEL_DE).toHaveProperty([kind]);
    }
  });

  it('never returns an empty error text', () => {
    expect(describeError(new DOMException('', 'OperationError'))).toContain('Schlüssel passt nicht');
    expect(describeError(new Error(''))).toBe('Error');
    expect(describeError(undefined)).toBe('Unbekannter Fehler');
    expect(describeError(new Error('kaputt'))).toBe('kaputt');
  });

  it('groups issues by cause, worst first, with counts per type and readable examples', () => {
    const log = new IssueLog();
    for (let i = 0; i < 12; i++) log.add('plaintext-event', { id: `e${i}`, type: 'event', title: `Termin ${i}` }, 'content', 'x');
    log.add('meta-unreadable', { id: 'f1', type: 'folder', title: 'Mai' }, 'meta', 'x');
    log.add('meta-unreadable', { id: 'e99', type: 'event', title: 'Alt' }, 'meta', 'x');
    log.add('asset-missing', { id: 'n1', type: 'note', title: 'Konzept' }, 'asset', 'x');

    const summary = log.summary();
    expect(summary.map((s) => s.kind)).toEqual(['asset-missing', 'meta-unreadable', 'plaintext-event']);
    expect(summary[1].byType).toEqual({ folder: 1, event: 1 });
    expect(summary[2]).toMatchObject({ count: 12, severity: 'info' });
    expect(summary[2].examples).toHaveLength(10);
    expect(log.bySeverity('loss').map((i) => i.id)).toEqual(['n1']);

    const manifest = {
      counts: { note: 2, event: 12 }, assetCount: 3, taskCount: 4, skipped: [], summary, unassignedAssets: [],
    } as unknown as VaultManifest;
    const text = problemsText(manifest);
    expect(text).toContain('ECHTE VERLUSTE');
    expect(text).toContain('1 x Bild nicht mehr auf dem Server (1 Notiz)');
    expect(text).toContain('      - Konzept');
    expect(text).toContain('... und 2 weitere');
    expect(text).toContain('Todos: 4');
  });
});
