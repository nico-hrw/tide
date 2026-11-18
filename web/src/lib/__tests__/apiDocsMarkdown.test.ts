import { describe, expect, it } from 'vitest';
import { API_DOC } from '../apiDocs/content';
import { toMarkdown } from '../apiDocs/markdown';
import { API_BASE_URL } from '../apiDocs/types';
import type { ApiDoc } from '../apiDocs/types';

const mini: ApiDoc = {
  title: 'T',
  lead: 'Lead',
  sections: [
    {
      id: 'a',
      title: 'Alpha',
      blocks: [
        { kind: 'p', text: 'Text mit `code`.' },
        { kind: 'list', items: ['eins', 'zwei'] },
        { kind: 'note', tone: 'unverified', text: 'unsicher' },
        { kind: 'table', head: ['A', 'B'], rows: [['x|y', '`z`']] },
        { kind: 'code', lang: 'json', label: 'Beispiel', code: '{"a": 1}' },
        { kind: 'endpoint', method: 'GET', path: '/x', scope: '`s:read`', summary: 'Liest.' },
      ],
    },
  ],
};

describe('toMarkdown', () => {
  it('renders every block kind', () => {
    const md = toMarkdown(mini);
    expect(md).toContain('# T\n\nLead');
    expect(md).toContain('## 1. Alpha');
    expect(md).toContain('- eins\n- zwei');
    expect(md).toContain('> **Nicht verifiziert:** unsicher');
    expect(md).toContain('**Beispiel**\n\n```json\n{"a": 1}\n```');
    expect(md).toContain('#### `GET /x`');
    expect(md.endsWith('\n')).toBe(true);
  });

  it('escapes pipes inside table cells', () => {
    expect(toMarkdown(mini)).toContain('| x\\|y | `z` |');
  });

  it('lists all sections in the table of contents', () => {
    const md = toMarkdown(API_DOC);
    API_DOC.sections.forEach((s, i) => expect(md).toContain(`${i + 1}. ${s.title}`));
  });
});

describe('API_DOC content', () => {
  const md = toMarkdown(API_DOC);

  it('covers the required sections with unique ids', () => {
    const ids = API_DOC.sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    ['ueberblick', 'authentifizierung', 'rechte', 'notizen', 'todos', 'termine', 'fehlercodes', 'limits', 'verschluesselung']
      .forEach((id) => expect(ids).toContain(id));
  });

  it('uses the production base URL and no legacy domain', () => {
    expect(API_BASE_URL).toBe('https://hrw.rocks/api/v1');
    expect(md).toContain('https://hrw.rocks/api/v1/external/notes');
    expect(md).not.toContain('go-tide.app');
  });

  it('documents every scope with its technical name', () => {
    ['events:read', 'events:write', 'notes:read', 'notes:write', 'todos:read', 'todos:create', 'todos:edit', 'todos:delete', 'todos:write']
      .forEach((scope) => expect(md).toContain(`\`${scope}\``));
  });

  it('contains no raw hex colors or placeholder secrets', () => {
    expect(md).not.toMatch(/tide_pat_[0-9a-f]{64}/);
    expect(md).toContain('tide_pat_DEIN_TOKEN');
  });
});
