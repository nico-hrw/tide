/** Built-in constants available everywhere (lowest priority; any definition with the same name overrides them). */
export const STDLIB_CONSTANTS: Readonly<Record<string, number>> = {
    pi: Math.PI,
    e: Math.E,
};

export interface StdlibEntry {
    name: string;
    signature: string;
    description: string;
    kind: 'konstante' | 'funktion' | 'finanzen';
}

/** Listing for the "Standard (Tide)" page of the variables popup. The functions themselves live in functions.ts. */
export const STDLIB_ENTRIES: readonly StdlibEntry[] = [
    { name: 'pi', signature: 'pi', description: 'Kreiszahl 3,14159…', kind: 'konstante' },
    { name: 'e', signature: 'e', description: 'Eulersche Zahl 2,71828…', kind: 'konstante' },
    { name: 'SUMME', signature: 'SUMME(Zellen…)', description: 'Summe von Zahlen, Zellen oder Bereichen', kind: 'funktion' },
    { name: 'MITTELWERT', signature: 'MITTELWERT(Zellen…)', description: 'Durchschnitt', kind: 'funktion' },
    { name: 'MIN', signature: 'MIN(Zellen…)', description: 'Kleinster Wert', kind: 'funktion' },
    { name: 'MAX', signature: 'MAX(Zellen…)', description: 'Größter Wert', kind: 'funktion' },
    { name: 'ANZAHL', signature: 'ANZAHL(Zellen…)', description: 'Anzahl der Zahlen', kind: 'funktion' },
    { name: 'RUNDEN', signature: 'RUNDEN(x; stellen)', description: 'Auf n Stellen runden', kind: 'funktion' },
    { name: 'WENN', signature: 'WENN(bedingung; dann; sonst)', description: 'Wert je nach Bedingung', kind: 'funktion' },
    { name: 'ABS', signature: 'ABS(x)', description: 'Betrag', kind: 'funktion' },
    { name: 'WURZEL', signature: 'WURZEL(x)', description: 'Quadratwurzel', kind: 'funktion' },
    { name: 'POTENZ', signature: 'POTENZ(x; y)', description: 'x hoch y', kind: 'funktion' },
    { name: 'RMZ', signature: 'RMZ(zins; laufzeit; barwert)', description: 'Rate pro Periode (Zins je Periode)', kind: 'finanzen' },
    { name: 'ZW', signature: 'ZW(zins; laufzeit; rate; barwert)', description: 'Zukünftiger Wert', kind: 'finanzen' },
    { name: 'BW', signature: 'BW(zins; laufzeit; rate)', description: 'Barwert', kind: 'finanzen' },
];
