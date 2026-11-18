/**
 * Structured source for the public API documentation.
 * One data tree is rendered to HTML (components/Docs) and to Markdown (markdown.ts).
 *
 * Inline syntax inside every `text`/cell string: `code` and **bold**. Nothing else.
 */
export type NoteTone = 'info' | 'warn' | 'unverified';

export type DocBlock =
  | { kind: 'p'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'note'; tone: NoteTone; text: string }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'code'; lang: string; label?: string; code: string }
  | { kind: 'endpoint'; method: string; path: string; scope: string; summary: string };

export interface DocSection {
  id: string;
  title: string;
  blocks: DocBlock[];
}

export interface ApiDoc {
  title: string;
  lead: string;
  sections: DocSection[];
}

/** Production API base. All example requests use it verbatim. */
export const API_BASE_URL = 'https://hrw.rocks/api/v1';

/** Placeholder used in every example request. */
export const TOKEN_PLACEHOLDER = 'tide_pat_DEIN_TOKEN';

export const NOTE_LABEL: Record<NoteTone, string> = {
  info: 'Hinweis',
  warn: 'Achtung',
  unverified: 'Nicht verifiziert',
};
