/**
 * German-first date/time parser for SmartIsland event suggestions.
 *
 * Pure function — no side effects, no React. Easy to unit-test.
 *
 * Supported patterns (V1):
 *   - Weekdays: "Freitag", "Fr", "Fr.", "nächster Freitag", "kommenden Freitag"
 *   - Relative: "heute", "morgen", "übermorgen", "in N Tagen", "nächste Woche"
 *   - Explicit dates: "1.5.", "01.05.2026", "1. Mai", "15.03."
 *   - Times: "15 Uhr", "15:00", "15:30"
 *   - Time ranges: "15-17 Uhr", "15:00-17:00", "von 15 bis 17 Uhr"
 *
 * Future (separate spec): chrono-node migration for multi-language + fuzzy.
 */

export type DetectedToken =
    | { type: 'date'; span: [number, number]; date: Date; raw: string }
    | { type: 'time'; span: [number, number]; hour: number; minute: number; raw: string };

export interface ParseResult {
    /** Span covering the contiguous detected region (first token to last). */
    span: [number, number];

    /** Default proposed values, derived from first date + first 1-2 times. */
    proposedDate: Date;
    proposedStart: Date;
    /** Defaults to start + 60min if only one time was detected. */
    proposedEnd: Date;

    /** All date/time tokens found in this block — used by Smart Cycling. */
    allTokens: DetectedToken[];

    /** Heuristic title — capitalized noun(s) near the date. May be empty. */
    titleHint: string;
}

// ── Vocabulary ────────────────────────────────────────────────────────────────

const WEEKDAY_MAP: Record<string, number> = {
    // 0 = Sunday, 1 = Monday … (JS Date.getDay convention)
    'sonntag': 0, 'so': 0,
    'montag': 1, 'mo': 1,
    'dienstag': 2, 'di': 2,
    'mittwoch': 3, 'mi': 3,
    'donnerstag': 4, 'do': 4,
    'freitag': 5, 'fr': 5,
    'samstag': 6, 'sa': 6,
};

const MONTH_MAP: Record<string, number> = {
    // 0-indexed
    'januar': 0, 'jan': 0,
    'februar': 1, 'feb': 1,
    'märz': 2, 'mär': 2, 'maerz': 2,
    'april': 3, 'apr': 3,
    'mai': 4,
    'juni': 5, 'jun': 5,
    'juli': 6, 'jul': 6,
    'august': 7, 'aug': 7,
    'september': 8, 'sep': 8, 'sept': 8,
    'oktober': 9, 'okt': 9,
    'november': 10, 'nov': 10,
    'dezember': 11, 'dez': 11,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c;
}

function withTime(d: Date, hour: number, minute: number): Date {
    const c = new Date(d);
    c.setHours(hour, minute, 0, 0);
    return c;
}

/**
 * Returns the next date for the given weekday (0=Sunday, 1=Monday…).
 * If forceNext is true, "next Friday" never returns today.
 */
function nextWeekday(base: Date, weekday: number, forceNext = false): Date {
    const result = startOfDay(base);
    const baseDay = result.getDay();
    let diff = (weekday - baseDay + 7) % 7;
    if (diff === 0 && forceNext) diff = 7;
    result.setDate(result.getDate() + diff);
    return result;
}

// ── Main API ──────────────────────────────────────────────────────────────────

/**
 * Parses German date/time tokens out of a single text block.
 *
 * Returns one ParseResult per detected event "cluster" — V1 is naive and treats
 * the whole block as one cluster. Smart Cycling lets the user navigate other
 * tokens in the block if the default heuristic picked the wrong ones.
 */
export function parseGermanDate(text: string, baseDate: Date = new Date()): ParseResult[] {
    const tokens: DetectedToken[] = [];

    // ── Pattern 1: explicit dates "1.5.", "01.05.2026" ──────────────────────────
    const dateNumRe = /\b(0?[1-9]|[12][0-9]|3[01])\.(0?[1-9]|1[0-2])\.(\d{4}|\d{2})?\b/g;
    let m: RegExpExecArray | null;
    while ((m = dateNumRe.exec(text)) !== null) {
        const day = parseInt(m[1], 10);
        const month = parseInt(m[2], 10) - 1;
        let year = m[3] ? parseInt(m[3], 10) : baseDate.getFullYear();
        if (year < 100) year += 2000;
        const d = new Date(year, month, day);
        if (!isNaN(d.getTime()) && d.getDate() === day) {
            tokens.push({ type: 'date', span: [m.index, m.index + m[0].length], date: d, raw: m[0] });
        }
    }

    // ── Pattern 2: "1. Mai", "15. März 2026" ────────────────────────────────────
    const monthNames = Object.keys(MONTH_MAP).join('|');
    const dateNamedRe = new RegExp(`\\b(0?[1-9]|[12][0-9]|3[01])\\.\\s*(${monthNames})(?:\\s+(\\d{4}))?\\b`, 'gi');
    while ((m = dateNamedRe.exec(text)) !== null) {
        const day = parseInt(m[1], 10);
        const monthIdx = MONTH_MAP[m[2].toLowerCase()];
        if (monthIdx === undefined) continue;
        const year = m[3] ? parseInt(m[3], 10) : baseDate.getFullYear();
        const d = new Date(year, monthIdx, day);
        if (!isNaN(d.getTime()) && d.getDate() === day) {
            tokens.push({ type: 'date', span: [m.index, m.index + m[0].length], date: d, raw: m[0] });
        }
    }

    // ── Pattern 3: weekdays w/ optional "nächster"/"kommenden" prefix ───────────
    const weekdayNames = Object.keys(WEEKDAY_MAP).join('|');
    const weekdayRe = new RegExp(`\\b(nächster|nächsten|nächste|kommenden|kommender|kommende)?\\s*(${weekdayNames})\\.?\\b`, 'gi');
    while ((m = weekdayRe.exec(text)) !== null) {
        const prefix = m[1]?.toLowerCase();
        const wkRaw = m[2].toLowerCase();
        const weekday = WEEKDAY_MAP[wkRaw];
        if (weekday === undefined) continue;
        const forceNext = !!prefix;
        const d = nextWeekday(baseDate, weekday, forceNext);
        const start = m.index + (m[0].length - m[2].length - (m[0].endsWith('.') ? 1 : 0));
        // Use the entire match span (including the prefix word if any)
        tokens.push({ type: 'date', span: [m.index, m.index + m[0].length], date: d, raw: m[0] });
    }

    // ── Pattern 4: relative ("heute", "morgen", "übermorgen", "in N Tagen") ─────
    const relWords: Array<[RegExp, (b: Date) => Date]> = [
        [/\bheute\b/gi, (b) => startOfDay(b)],
        [/\bmorgen\b/gi, (b) => { const d = startOfDay(b); d.setDate(d.getDate() + 1); return d; }],
        [/\bübermorgen\b/gi, (b) => { const d = startOfDay(b); d.setDate(d.getDate() + 2); return d; }],
        [/\bnächste\s+woche\b/gi, (b) => { const d = startOfDay(b); d.setDate(d.getDate() + 7); return d; }],
    ];
    for (const [re, fn] of relWords) {
        while ((m = re.exec(text)) !== null) {
            tokens.push({ type: 'date', span: [m.index, m.index + m[0].length], date: fn(baseDate), raw: m[0] });
        }
    }
    // "in N Tagen"
    const inDaysRe = /\bin\s+(\d{1,3})\s+tagen\b/gi;
    while ((m = inDaysRe.exec(text)) !== null) {
        const n = parseInt(m[1], 10);
        const d = startOfDay(baseDate);
        d.setDate(d.getDate() + n);
        tokens.push({ type: 'date', span: [m.index, m.index + m[0].length], date: d, raw: m[0] });
    }

    // ── Pattern 5: time ranges ("15-17 Uhr", "15:00-17:00", "von 15 bis 17 Uhr") ─
    // We push two distinct time tokens (start + end) so Smart Cycling treats them
    // as independent.
    const rangeRe1 = /\b([0-1]?[0-9]|2[0-3])(?::([0-5][0-9]))?\s*[-–]\s*([0-1]?[0-9]|2[0-3])(?::([0-5][0-9]))?(?:\s*uhr)?\b/gi;
    while ((m = rangeRe1.exec(text)) !== null) {
        const h1 = parseInt(m[1], 10), mn1 = m[2] ? parseInt(m[2], 10) : 0;
        const h2 = parseInt(m[3], 10), mn2 = m[4] ? parseInt(m[4], 10) : 0;
        const wholeStart = m.index;
        const wholeEnd = m.index + m[0].length;
        // Approximate the inner spans — good enough for visualization.
        tokens.push({ type: 'time', span: [wholeStart, wholeStart + m[1].length + (m[2] ? m[2].length + 1 : 0)], hour: h1, minute: mn1, raw: m[0].split(/[-–]/)[0].trim() });
        tokens.push({ type: 'time', span: [wholeEnd - (m[4] ? m[3].length + m[4].length + 1 : m[3].length), wholeEnd], hour: h2, minute: mn2, raw: m[0].split(/[-–]/)[1].trim() });
    }
    const rangeRe2 = /\bvon\s+([0-1]?[0-9]|2[0-3])(?::([0-5][0-9]))?\s*(?:uhr\s*)?bis\s+([0-1]?[0-9]|2[0-3])(?::([0-5][0-9]))?(?:\s*uhr)?\b/gi;
    while ((m = rangeRe2.exec(text)) !== null) {
        const h1 = parseInt(m[1], 10), mn1 = m[2] ? parseInt(m[2], 10) : 0;
        const h2 = parseInt(m[3], 10), mn2 = m[4] ? parseInt(m[4], 10) : 0;
        const wholeStart = m.index;
        const wholeEnd = m.index + m[0].length;
        tokens.push({ type: 'time', span: [wholeStart, wholeStart + 'von'.length + 1 + m[1].length + (m[2] ? m[2].length + 1 : 0)], hour: h1, minute: mn1, raw: `${h1}${m[2] ? ':' + m[2] : ''}` });
        tokens.push({ type: 'time', span: [wholeEnd - m[3].length - (m[4] ? m[4].length + 1 : 0), wholeEnd], hour: h2, minute: mn2, raw: `${h2}${m[4] ? ':' + m[4] : ''}` });
    }

    // ── Pattern 6: standalone times ("15 Uhr", "15:00", "15:30") ────────────────
    const timeRe = /\b([0-1]?[0-9]|2[0-3])(?::([0-5][0-9]))?\s*uhr\b|\b([0-1]?[0-9]|2[0-3]):([0-5][0-9])\b/gi;
    while ((m = timeRe.exec(text)) !== null) {
        const span: [number, number] = [m.index, m.index + m[0].length];
        // Skip if this token is already covered by a range match (overlap check)
        if (tokens.some(t => t.type === 'time' && t.span[0] <= span[0] && t.span[1] >= span[1])) continue;
        let hour: number, minute: number;
        if (m[1] !== undefined) {
            hour = parseInt(m[1], 10);
            minute = m[2] ? parseInt(m[2], 10) : 0;
        } else {
            hour = parseInt(m[3], 10);
            minute = parseInt(m[4], 10);
        }
        tokens.push({ type: 'time', span, hour, minute, raw: m[0] });
    }

    // Sort tokens by position
    tokens.sort((a, b) => a.span[0] - b.span[0]);

    // De-duplicate overlapping tokens (keep the longest match for the same span start)
    const dedup: DetectedToken[] = [];
    for (const tk of tokens) {
        const overlap = dedup.find(d => d.type === tk.type && d.span[0] === tk.span[0]);
        if (overlap) {
            if (tk.span[1] - tk.span[0] > overlap.span[1] - overlap.span[0]) {
                const idx = dedup.indexOf(overlap);
                dedup[idx] = tk;
            }
            continue;
        }
        dedup.push(tk);
    }

    if (dedup.length === 0) return [];

    // V1: treat all tokens in the block as one cluster.
    const dates = dedup.filter(t => t.type === 'date') as Extract<DetectedToken, { type: 'date' }>[];
    const times = dedup.filter(t => t.type === 'time') as Extract<DetectedToken, { type: 'time' }>[];

    // Need at least one date OR one time to propose anything.
    if (dates.length === 0 && times.length === 0) return [];

    // Default date: first detected, fallback to today.
    const proposedDate = dates.length > 0 ? dates[0].date : startOfDay(baseDate);

    // Default times: first two; if only one, end = start + 60min.
    let proposedStart: Date;
    let proposedEnd: Date;
    if (times.length >= 1) {
        proposedStart = withTime(proposedDate, times[0].hour, times[0].minute);
        if (times.length >= 2) {
            proposedEnd = withTime(proposedDate, times[1].hour, times[1].minute);
            // Guard: if end <= start, force end = start + 5min
            if (proposedEnd.getTime() <= proposedStart.getTime()) {
                proposedEnd = new Date(proposedStart.getTime() + 5 * 60_000);
            }
        } else {
            proposedEnd = new Date(proposedStart.getTime() + 60 * 60_000);
        }
    } else {
        // Date only — default 09:00-10:00
        proposedStart = withTime(proposedDate, 9, 0);
        proposedEnd = withTime(proposedDate, 10, 0);
    }

    // Title heuristic: prefer capitalized words that are NOT in the detected
    // tokens, NOT date/weekday/month names, NOT generic prepositions.
    const titleHint = extractTitleHeuristic(text, dedup);

    // Whole span = first to last token
    const span: [number, number] = [
        Math.min(...dedup.map(t => t.span[0])),
        Math.max(...dedup.map(t => t.span[1])),
    ];

    return [{
        span,
        proposedDate,
        proposedStart,
        proposedEnd,
        allTokens: dedup,
        titleHint,
    }];
}

const STOP_WORDS = new Set([
    'am', 'um', 'bis', 'von', 'in', 'zum', 'zur', 'der', 'die', 'das', 'den', 'dem', 'wir',
    'ich', 'du', 'er', 'sie', 'es', 'uns', 'euch', 'sich', 'haben', 'hat', 'habe', 'mit',
    'für', 'auf', 'an', 'ab', 'und', 'oder', 'aber', 'gehen', 'gehe', 'geht', 'treffen',
    'treffe', 'trifft', 'noch', 'auch', 'einen', 'eine', 'einem', 'einer', 'eines',
    'uhr', 'morgen', 'heute', 'übermorgen',
]);

function extractTitleHeuristic(text: string, tokens: DetectedToken[]): string {
    // Find words that:
    //  - start with a capital letter (German nouns)
    //  - are not inside any detected token's span
    //  - are not weekday/month/stop words
    //  - are at least 3 characters
    const wordRe = /\b([A-ZÄÖÜ][a-zäöüß]{2,})\b/g;
    const candidates: { word: string; pos: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = wordRe.exec(text)) !== null) {
        const word = m[1];
        const pos = m.index;
        // Inside a token?
        if (tokens.some(t => t.span[0] <= pos && pos < t.span[1])) continue;
        // Stop word, weekday, or month name?
        const lower = word.toLowerCase();
        if (STOP_WORDS.has(lower)) continue;
        if (WEEKDAY_MAP[lower] !== undefined) continue;
        if (MONTH_MAP[lower] !== undefined) continue;
        candidates.push({ word, pos });
    }
    if (candidates.length === 0) return '';

    // Prefer the candidate(s) closest to the FIRST detected token.
    if (tokens.length > 0) {
        const tokenStart = tokens[0].span[0];
        candidates.sort((a, b) => Math.abs(a.pos - tokenStart) - Math.abs(b.pos - tokenStart));
    }

    // Take the closest 1-2 candidates.
    return candidates.slice(0, 2).map(c => c.word).join(' ');
}
