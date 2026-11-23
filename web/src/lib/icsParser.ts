/**
 * RFC 5545 iCalendar (ICS) parser.
 * Compatible with Google Calendar, Apple Calendar, and Outlook exports.
 */

export interface ParsedIcsEvent {
    uid?: string;
    title: string;
    description?: string;
    location?: string;
    start: string; // ISO-8601 string
    end: string;   // ISO-8601 string
    allDay: boolean;
    recurrenceRule?: string;
    /** End of the series (RRULE `UNTIL`) as ISO string. */
    recurrenceEnd?: string;
    /** Excluded occurrence dates (EXDATE) as local `yyyy-MM-dd` keys. */
    exdates?: string[];
    status?: string;
    isCancelled?: boolean;
}

interface ParsedDateTime {
    date: Date;
    iso: string;
    isAllDay: boolean;
}

interface IcsProperty {
    name: string;
    params: Record<string, string>;
    value: string;
}

const WINDOWS_TZ_MAP: Record<string, string> = {
    'W. Europe Standard Time': 'Europe/Berlin', 'Central Europe Standard Time': 'Europe/Prague',
    'Romance Standard Time': 'Europe/Paris', 'GMT Standard Time': 'Europe/London',
    'Greenwich Standard Time': 'Atlantic/Reykjavik', 'Eastern Standard Time': 'America/New_York',
    'Central Standard Time': 'America/Chicago', 'Mountain Standard Time': 'America/Denver',
    'Pacific Standard Time': 'America/Los_Angeles', 'Tokyo Standard Time': 'Asia/Tokyo',
    'China Standard Time': 'Asia/Shanghai', 'India Standard Time': 'Asia/Kolkata', 'UTC': 'UTC',
};

/** Computes millisecond offset between UTC and the specified timezone at the given date. */
function getTimezoneOffset(date: Date, timeZone: string): number | null {
    try {
        const cleanTz = timeZone.replace(/^\//, '').trim();
        const resolvedTz = WINDOWS_TZ_MAP[cleanTz] || cleanTz;
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: resolvedTz,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false,
        });
        const p: Record<string, number> = {};
        for (const { type, value } of formatter.formatToParts(date)) {
            if (type !== 'literal') p[type] = parseInt(value, 10);
        }
        const localInUtc = Date.UTC(p.year, (p.month || 1) - 1, p.day, (p.hour || 0) % 24, p.minute || 0, p.second || 0);
        return localInUtc - date.getTime();
    } catch {
        return null;
    }
}

/** Unescapes RFC 5545 text sequences (\n, \N, \,, \;, \\). */
function unescapeIcsText(str: string): string {
    return str.replace(/\\([nN,;\\:"])/g, (_, match: string) => {
        if (match === 'n' || match === 'N') return '\n';
        return match;
    });
}

/** Parses an RFC 5545 duration string (e.g. PT1H, P1D, PT30M) into milliseconds. */
function parseIcsDuration(durationStr: string): number | null {
    const m = durationStr.trim().match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
    if (!m) return null;
    const sign = m[1] === '-' ? -1 : 1;
    const totalSec = (parseInt(m[2] || '0', 10) * 7 + parseInt(m[3] || '0', 10)) * 86400 +
        parseInt(m[4] || '0', 10) * 3600 + parseInt(m[5] || '0', 10) * 60 + parseInt(m[6] || '0', 10);
    return sign * totalSec * 1000;
}

/** Parses an iCalendar date or date-time value into an ISO string and Date object. */
function parseIcsDate(val: string, tzId?: string, valueParam?: string): ParsedDateTime | null {
    const cleanVal = val.trim();
    if (!cleanVal) return null;
    const isExplicitDate = valueParam?.toUpperCase() === 'DATE';

    // 1. All-day date format: YYYYMMDD (8 digits)
    const dateMatch = cleanVal.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (dateMatch) {
        const [, y, m, d] = dateMatch.map(Number);
        const date = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
        return { date, iso: date.toISOString(), isAllDay: true };
    }

    // 2. Date-time: YYYYMMDDTHHMMSS with optional Z or offset
    const dtMatch = cleanVal.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(?:(Z)|([+-])(\d{2}):?(\d{2})?)?$/i);
    if (dtMatch) {
        const [y, m, d, hh, mm, ss] = dtMatch.slice(1, 7).map(Number);
        const isUtc = Boolean(dtMatch[7]);
        const tzSign = dtMatch[8];
        const tzHour = dtMatch[9];
        const tzMin = dtMatch[10];

        if (isUtc) {
            const date = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
            return { date, iso: date.toISOString(), isAllDay: isExplicitDate };
        }

        if (tzSign && tzHour) {
            const offsetMs = (parseInt(tzHour, 10) * 60 + parseInt(tzMin || '0', 10)) * 60000 * (tzSign === '-' ? -1 : 1);
            const date = new Date(Date.UTC(y, m - 1, d, hh, mm, ss) - offsetMs);
            return { date, iso: date.toISOString(), isAllDay: isExplicitDate };
        }

        if (tzId) {
            const guessUtc = Date.UTC(y, m - 1, d, hh, mm, ss);
            const offset = getTimezoneOffset(new Date(guessUtc), tzId);
            if (offset !== null) {
                const targetUtc = guessUtc - offset;
                const refinedOffset = getTimezoneOffset(new Date(targetUtc), tzId);
                const date = new Date(guessUtc - (refinedOffset ?? offset));
                return { date, iso: date.toISOString(), isAllDay: isExplicitDate };
            }
        }

        const localDate = new Date(y, m - 1, d, hh, mm, ss);
        const date = !isNaN(localDate.getTime()) ? localDate : new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
        return { date, iso: date.toISOString(), isAllDay: isExplicitDate };
    }

    // 3. Fallback for ISO strings or other representations
    const fallback = new Date(cleanVal);
    if (!isNaN(fallback.getTime())) {
        const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(cleanVal);
        return { date: fallback, iso: fallback.toISOString(), isAllDay: isExplicitDate || isDateOnly };
    }

    return null;
}

/** Calculates default end date: all-day -> DTSTART, timed -> DTSTART + 1 hour. */
function calculateDefaultEnd(startParsed: ParsedDateTime, allDay: boolean): string {
    if (allDay) return startParsed.iso;
    return new Date(startParsed.date.getTime() + 60 * 60 * 1000).toISOString();
}

/** Splits a physical line into property name, parameters, and value. */
function parsePropertyLine(line: string): IcsProperty | null {
    let colonIdx = -1, inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') inQuotes = !inQuotes;
        else if (line[i] === ':' && !inQuotes) { colonIdx = i; break; }
    }
    if (colonIdx === -1) return null;

    const propPart = line.substring(0, colonIdx);
    const value = line.substring(colonIdx + 1);

    const parts: string[] = [];
    let cur = '';
    inQuotes = false;
    for (let i = 0; i < propPart.length; i++) {
        const c = propPart[i];
        if (c === '"') { inQuotes = !inQuotes; cur += c; }
        else if (c === ';' && !inQuotes) { parts.push(cur); cur = ''; }
        else cur += c;
    }
    if (cur) parts.push(cur);
    if (!parts.length) return null;

    const name = parts[0].trim().toUpperCase();
    const params: Record<string, string> = {};
    for (let i = 1; i < parts.length; i++) {
        const eqIdx = parts[i].indexOf('=');
        if (eqIdx !== -1) {
            const pKey = parts[i].substring(0, eqIdx).trim().toUpperCase();
            let pVal = parts[i].substring(eqIdx + 1).trim();
            if (pVal.startsWith('"') && pVal.endsWith('"') && pVal.length >= 2) {
                pVal = pVal.slice(1, -1);
            }
            params[pKey] = pVal;
        }
    }
    return { name, params, value };
}

/** Converts EXDATE properties into local `yyyy-MM-dd` keys (comma-separated values allowed). */
function parseExdates(
    exdateProps: { value: string; params: Record<string, string> }[] | undefined,
    fallbackTzId?: string
): string[] {
    const keys = new Set<string>();
    for (const prop of exdateProps ?? []) {
        for (const part of prop.value.split(',')) {
            const val = part.trim();
            const local = val.match(/^(\d{4})(\d{2})(\d{2})(?:T\d{6})?$/);
            if (local) {
                // Floating or TZID-bound value: the written date is already the local date.
                keys.add(`${local[1]}-${local[2]}-${local[3]}`);
                continue;
            }
            const parsed = parseIcsDate(val, prop.params['TZID'] || fallbackTzId, prop.params['VALUE']);
            if (parsed) {
                const d = parsed.date;
                const pad = (n: number) => String(n).padStart(2, '0');
                keys.add(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
            }
        }
    }
    return [...keys];
}

/** Constructs a ParsedIcsEvent from gathered VEVENT properties. */
function buildEventFromProps(
    props: Record<string, { value: string; params: Record<string, string> }[]>
): ParsedIcsEvent | null {
    const dtStartProp = props['DTSTART']?.[0];
    if (!dtStartProp || !dtStartProp.value) return null;

    const startTzId = dtStartProp.params['TZID'];
    const startParsed = parseIcsDate(dtStartProp.value, startTzId, dtStartProp.params['VALUE']);
    if (!startParsed) return null;

    const allDay = startParsed.isAllDay;
    const startIso = startParsed.iso;

    let endIso: string;
    const dtEndProp = props['DTEND']?.[0];
    const durationProp = props['DURATION']?.[0];

    if (dtEndProp && dtEndProp.value) {
        const endTzId = dtEndProp.params['TZID'] || startTzId;
        const endParsed = parseIcsDate(dtEndProp.value, endTzId, dtEndProp.params['VALUE']);
        if (endParsed) {
            if (allDay) {
                // In RFC 5545, all-day DTEND is exclusive.
                // If DTEND is missing or same/before start, set end to DTSTART; if after, keep ISO string.
                endIso = endParsed.date.getTime() <= startParsed.date.getTime() ? startIso : endParsed.iso;
            } else {
                endIso = endParsed.iso;
            }
        } else {
            endIso = calculateDefaultEnd(startParsed, allDay);
        }
    } else if (durationProp && durationProp.value) {
        const durationMs = parseIcsDuration(durationProp.value);
        endIso = (durationMs !== null && durationMs > 0)
            ? new Date(startParsed.date.getTime() + durationMs).toISOString()
            : calculateDefaultEnd(startParsed, allDay);
    } else {
        endIso = calculateDefaultEnd(startParsed, allDay);
    }

    const rawSummary = props['SUMMARY']?.[0]?.value;
    const title = rawSummary ? unescapeIcsText(rawSummary).trim() || 'Kein Titel' : 'Kein Titel';
    const uidRaw = props['UID']?.[0]?.value;
    const descRaw = props['DESCRIPTION']?.[0]?.value;
    const locRaw = props['LOCATION']?.[0]?.value;
    const rruleRaw = props['RRULE']?.[0]?.value;
    const statusRaw = props['STATUS']?.[0]?.value?.trim();
    const exdates = parseExdates(props['EXDATE'], startTzId);
    const untilRaw = rruleRaw?.match(/(?:^|;)UNTIL=([^;]+)/i)?.[1];
    const until = untilRaw ? parseIcsDate(untilRaw, startTzId) : null;

    return {
        title,
        start: startIso,
        end: endIso,
        allDay,
        ...(uidRaw ? { uid: unescapeIcsText(uidRaw).trim() } : {}),
        ...(descRaw !== undefined ? { description: unescapeIcsText(descRaw) } : {}),
        ...(locRaw ? { location: unescapeIcsText(locRaw).trim() } : {}),
        ...(rruleRaw ? { recurrenceRule: rruleRaw.trim() } : {}),
        ...(until ? { recurrenceEnd: until.iso } : {}),
        ...(exdates.length > 0 ? { exdates } : {}),
        ...(statusRaw ? { status: statusRaw } : {}),
        ...(statusRaw?.toUpperCase() === 'CANCELLED' ? { isCancelled: true } : {}),
    };
}

/** Parses raw iCalendar (ICS) string content into an array of ParsedIcsEvent objects. */
export function parseIcsString(rawContent: string): ParsedIcsEvent[] {
    if (!rawContent || typeof rawContent !== 'string') return [];

    // RFC 5545 Section 3.1: Line unfolding
    const unfolded = rawContent.replace(/(?:\r\n|\r|\n)[ \t]/g, '');
    const lines = unfolded.split(/\r\n|\r|\n/);
    const events: ParsedIcsEvent[] = [];

    let insideVEvent = false;
    let subComponentDepth = 0;
    let currentProps: Record<string, { value: string; params: Record<string, string> }[]> = {};

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        const upperLine = line.toUpperCase();

        if (upperLine === 'BEGIN:VEVENT') {
            insideVEvent = true;
            subComponentDepth = 0;
            currentProps = {};
            continue;
        }

        if (insideVEvent) {
            if (upperLine.startsWith('BEGIN:')) {
                subComponentDepth++;
                continue;
            }

            if (upperLine.startsWith('END:')) {
                if (upperLine === 'END:VEVENT') {
                    const event = buildEventFromProps(currentProps);
                    if (event) events.push(event);
                    insideVEvent = false;
                    currentProps = {};
                    continue;
                }
                if (subComponentDepth > 0) subComponentDepth--;
                continue;
            }

            // Skip properties belonging to nested components (e.g. VALARM)
            if (subComponentDepth > 0) continue;

            const prop = parsePropertyLine(line);
            if (prop) {
                if (!currentProps[prop.name]) currentProps[prop.name] = [];
                currentProps[prop.name].push({ value: prop.value, params: prop.params });
            }
        }
    }

    return events;
}
