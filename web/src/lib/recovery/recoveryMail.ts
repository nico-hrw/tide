/**
 * Texts for handing the recovery secret to the user. Everything stays on the device: the mail is a
 * `mailto:` draft the user's own mail program opens and sends; Tide's server never sees it.
 */

export const RECOVERY_MAIL_SUBJECT = 'Tide: dein Wiederherstellungsschlüssel – gut aufbewahren';

export function buildRecoveryText(formattedSecret: string, email?: string): string {
    return [
        'Dein Tide-Wiederherstellungsschlüssel',
        '',
        formattedSecret,
        '',
        email ? `Konto: ${email}` : '',
        'Bewahre diesen Schlüssel gut auf (z. B. in dieser Mail, einem Passwortmanager oder ausgedruckt).',
        'Wenn du deinen Tresor-PIN vergisst, meldest du dich mit dem Mail-Code an, wählst „PIN vergessen?“',
        'und gibst diesen Schlüssel ein. Danach setzt du einen neuen PIN, deine Daten bleiben erhalten.',
        '',
        'Wer diesen Schlüssel und Zugriff auf dein Postfach hat, kann deinen Tresor öffnen. Gib ihn nicht weiter.',
        'Tide kennt diesen Schlüssel nicht und kann ihn nicht wiederherstellen.',
    ]
        .filter((line, i, all) => !(line === '' && all[i - 1] === ''))
        .join('\n');
}

/** mailto: link addressed to the user's own address with subject and body prefilled. */
export function buildRecoveryMailto(email: string, formattedSecret: string): string {
    const params = `subject=${encodeURIComponent(RECOVERY_MAIL_SUBJECT)}&body=${encodeURIComponent(buildRecoveryText(formattedSecret, email))}`;
    return `mailto:${encodeURIComponent(email.trim())}?${params}`;
}

export const RECOVERY_FILE_NAME = 'tide-wiederherstellungsschluessel.txt';
