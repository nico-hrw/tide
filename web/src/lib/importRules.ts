import type { ParsedIcsEvent } from '@/lib/icsParser';
import { normalizeTagName } from '@/lib/tags';

export type ImportRuleField = 'title' | 'description' | 'both';
export type ImportRuleMode = 'startsWith' | 'contains';

/** Adds the tag `tagName` to every imported event whose text matches. */
export interface ImportRule {
    id: string;
    field: ImportRuleField;
    mode: ImportRuleMode;
    pattern: string;
    tagName: string;
    /** Also delete the matched text from the title / description of the imported event. */
    removeMatch?: boolean;
}

const STORAGE_KEY = 'tide_calendar_import_rules';

function haystacks(event: Pick<ParsedIcsEvent, 'title' | 'description'>, field: ImportRuleField): string[] {
    const out: string[] = [];
    if (field !== 'description') out.push(event.title);
    if (field !== 'title') out.push(event.description ?? '');
    return out;
}

export function ruleMatches(rule: ImportRule, event: Pick<ParsedIcsEvent, 'title' | 'description'>): boolean {
    const needle = rule.pattern.trim().toLowerCase();
    if (!needle || !normalizeTagName(rule.tagName)) return false;
    return haystacks(event, rule.field).some((text) => {
        const hay = text.trim().toLowerCase();
        return rule.mode === 'startsWith' ? hay.startsWith(needle) : hay.includes(needle);
    });
}

/** Tag names (deduplicated by normalized name, in rule order) that apply to the event. */
export function tagNamesForEvent(
    event: Pick<ParsedIcsEvent, 'title' | 'description'>,
    rules: readonly ImportRule[],
): string[] {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const rule of rules) {
        if (!ruleMatches(rule, event)) continue;
        const key = normalizeTagName(rule.tagName);
        if (seen.has(key)) continue;
        seen.add(key);
        names.push(rule.tagName.trim());
    }
    return names;
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Removes the rule's pattern from the text and tidies leftover spaces and leading separators. */
export function removeRuleMatch(text: string, rule: Pick<ImportRule, 'mode' | 'pattern'>): string {
    const needle = rule.pattern.trim();
    if (!needle) return text;
    const source = rule.mode === 'startsWith' ? `^\\s*${escapeRegExp(needle)}` : escapeRegExp(needle);
    const stripped = text.replace(new RegExp(source, 'gi'), ' ');
    if (stripped === text) return text;
    return stripped.replace(/\s{2,}/g, ' ').replace(/^[\s:|,;-]+/, '').trim();
}

export interface AppliedRules {
    title: string;
    description?: string;
    tagNames: string[];
}

/** Tags plus the title and description with all matched strings removed (for rules with `removeMatch`). */
export function applyImportRules(
    event: Pick<ParsedIcsEvent, 'title' | 'description'>,
    rules: readonly ImportRule[],
): AppliedRules {
    let title = event.title;
    let description = event.description;
    for (const rule of rules) {
        if (!rule.removeMatch || !ruleMatches(rule, event)) continue;
        if (rule.field !== 'description') title = removeRuleMatch(title, rule);
        if (rule.field !== 'title' && description !== undefined) description = removeRuleMatch(description, rule);
    }
    // Never leave an event without a title.
    if (!title.trim()) title = event.title;
    return { title, ...(description !== undefined ? { description } : {}), tagNames: tagNamesForEvent(event, rules) };
}

const PREFIX_NAMES: Record<string, string> = { v: 'Vorlesung', p: 'Praktikum', 'ü': 'Übung', s: 'Seminar' };

/** Suggests one "starts with" rule per `X:` title prefix found (e.g. `V:`, `P:`, `Ü:`). */
export function suggestPrefixRules(events: readonly Pick<ParsedIcsEvent, 'title'>[]): ImportRule[] {
    const prefixes: string[] = [];
    for (const e of events) {
        const m = e.title.trim().match(/^([^\s:]{1,12}):/);
        if (m && !prefixes.includes(m[1])) prefixes.push(m[1]);
    }
    // A prefix only makes sense as a filter when it separates events, i.e. not every title has the same one.
    if (prefixes.length < 2) return [];
    return prefixes.map((p, i) => ({
        id: `suggest-${i}-${p}`,
        field: 'title' as const,
        mode: 'startsWith' as const,
        pattern: `${p}:`,
        tagName: PREFIX_NAMES[p.toLowerCase()] ?? p,
        removeMatch: true,
    }));
}

export function loadImportRules(): ImportRule[] {
    try {
        const raw = typeof window === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (r): r is ImportRule =>
                !!r && typeof r === 'object' && typeof (r as ImportRule).id === 'string' &&
                typeof (r as ImportRule).pattern === 'string' && typeof (r as ImportRule).tagName === 'string',
        );
    } catch {
        return [];
    }
}

export function saveImportRules(rules: readonly ImportRule[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
    } catch {
        /* storage unavailable: rules just stay in memory */
    }
}
