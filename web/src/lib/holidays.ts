import { format, addDays } from 'date-fns';

export interface Holiday {
    date: string; // 'YYYY-MM-DD'
    name: string;
    localName?: string;
    country: string;
}

/**
 * Computes Easter Sunday for a given year using the Anonymous Meeus/Jones/Butcher algorithm.
 */
function getEasterSunday(year: number): Date {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month, day);
}

export function getHolidaysForYear(year: number, countryCode: string = 'DE'): Holiday[] {
    const easter = getEasterSunday(year);
    const formatIso = (d: Date) => format(d, 'yyyy-MM-dd');

    const karfreitag = addDays(easter, -2);
    const ostermontag = addDays(easter, 1);
    const christiHimmelfahrt = addDays(easter, 39);
    const pfingstmontag = addDays(easter, 50);
    const fronleichnam = addDays(easter, 60);

    const list: Holiday[] = [];

    if (countryCode === 'DE' || countryCode === 'AT' || countryCode === 'CH') {
        list.push({ date: `${year}-01-01`, name: countryCode === 'CH' ? 'Neujahrstag' : 'Neujahr', country: countryCode });
        list.push({ date: formatIso(karfreitag), name: countryCode === 'CH' ? 'Karfreitag' : 'Karfreitag', country: countryCode });
        list.push({ date: formatIso(ostermontag), name: 'Ostermontag', country: countryCode });
        list.push({ date: `${year}-05-01`, name: countryCode === 'AT' ? 'Staatsfeiertag' : 'Tag der Arbeit', country: countryCode });
        list.push({ date: formatIso(christiHimmelfahrt), name: countryCode === 'CH' ? 'Auffahrt' : 'Christi Himmelfahrt', country: countryCode });
        list.push({ date: formatIso(pfingstmontag), name: 'Pfingstmontag', country: countryCode });
        list.push({ date: `${year}-12-25`, name: 'Erster Weihnachtsfeiertag', country: countryCode });
        list.push({ date: `${year}-12-26`, name: 'Zweiter Weihnachtsfeiertag', country: countryCode });
    }

    if (countryCode === 'DE') {
        list.push({ date: `${year}-10-03`, name: 'Tag der Deutschen Einheit', country: 'DE' });
        list.push({ date: `${year}-10-31`, name: 'Reformationstag', country: 'DE' });
        list.push({ date: `${year}-11-01`, name: 'Allerheiligen', country: 'DE' });
        list.push({ date: formatIso(fronleichnam), name: 'Fronleichnam', country: 'DE' });
    } else if (countryCode === 'AT') {
        list.push({ date: `${year}-01-06`, name: 'Heilige Drei Könige', country: 'AT' });
        list.push({ date: formatIso(fronleichnam), name: 'Fronleichnam', country: 'AT' });
        list.push({ date: `${year}-08-15`, name: 'Mariä Himmelfahrt', country: 'AT' });
        list.push({ date: `${year}-10-26`, name: 'Nationalfeiertag', country: 'AT' });
        list.push({ date: `${year}-11-01`, name: 'Allerheiligen', country: 'AT' });
        list.push({ date: `${year}-12-08`, name: 'Mariä Empfängnis', country: 'AT' });
    } else if (countryCode === 'CH') {
        list.push({ date: `${year}-01-02`, name: 'Berchtoldstag', country: 'CH' });
        list.push({ date: `${year}-08-01`, name: 'Bundesfeier', country: 'CH' });
    } else if (countryCode === 'US') {
        list.push({ date: `${year}-01-01`, name: "New Year's Day", country: 'US' });
        list.push({ date: `${year}-07-04`, name: 'Independence Day', country: 'US' });
        list.push({ date: `${year}-11-11`, name: "Veterans Day", country: 'US' });
        list.push({ date: `${year}-12-25`, name: 'Christmas Day', country: 'US' });
    }

    return list.sort((a, b) => a.date.localeCompare(b.date));
}

export function searchHolidays(query: string, year: number = new Date().getFullYear(), countryCode: string = 'DE'): Holiday[] {
    if (!query || query.trim().length < 2) return [];
    const q = query.toLowerCase().trim();
    const holidays = [
        ...getHolidaysForYear(year, countryCode),
        ...getHolidaysForYear(year + 1, countryCode),
    ];

    return holidays.filter(h => h.name.toLowerCase().includes(q) || h.date.includes(q));
}

export function getHolidayForDate(dateStr: string, countryCode: string = 'DE'): Holiday | null {
    if (!dateStr) return null;
    const year = parseInt(dateStr.slice(0, 4), 10);
    if (isNaN(year)) return null;
    const list = getHolidaysForYear(year, countryCode);
    return list.find(h => h.date === dateStr) || null;
}
