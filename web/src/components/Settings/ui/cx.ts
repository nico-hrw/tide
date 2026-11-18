/** Kleiner Klassen-Helfer: filtert falsy-Werte und fuegt die Rest mit Leerzeichen zusammen. */
export function cx(...parts: Array<string | false | null | undefined>): string {
    return parts.filter(Boolean).join(' ');
}
