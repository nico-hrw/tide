import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { API_DOC } from '../apiDocs/content';
import { toMarkdown } from '../apiDocs/markdown';

// docs/API.md is generated from the same data as the public page /docs/api.
// After changing web/src/lib/apiDocs, rewrite it with:  UPDATE_API_MD=1 npx vitest run apiDocsFile
const API_MD_PATH = resolve(__dirname, '../../../../docs/API.md');
const HEADER =
    '<!-- Generated from web/src/lib/apiDocs (same source as the public page /docs/api).\n' +
    '     Do not edit by hand. Rewrite with: UPDATE_API_MD=1 npx vitest run apiDocsFile (in web/). -->\n\n';

describe('docs/API.md', () => {
    const expected = HEADER + toMarkdown(API_DOC);

    it('matches the generated documentation', () => {
        if (process.env.UPDATE_API_MD) writeFileSync(API_MD_PATH, expected, 'utf-8');
        expect(readFileSync(API_MD_PATH, 'utf-8').replace(/\r\n/g, '\n')).toBe(expected.replace(/\r\n/g, '\n'));
    });
});
