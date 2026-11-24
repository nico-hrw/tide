# Design: @-Erwähnungen von Kontakten, einfacheres Teilen, Kalender teilen, Sichtbarkeits-Icons

Stand: 2026-11-24 · Mockups: https://claude.ai/artifact/4J1LgYb5RZF4ZLHhqDGHJU

## Ziel und Grund

Teilen soll sich anfühlen wie Schreiben: Wer in einer Notiz, einem Termin oder einem Todo `@Anna` tippt, erwähnt und teilt in einem Schritt. Heute läuft Teilen nur über `ShareModal` und `SaveStatusMenu`. Wer etwas teilt, sieht danach kaum, was mit wem geteilt ist.

## Ziele

1. **Kontakte per `@`** in Notizen, Terminen und Todos. Die Erwähnung zeigt Profilbild und Name. Ein Klick öffnet eine Profil-Karte mit "Profil öffnen" (`ProfilePage`).
2. **Erwähnung teilt sofort** (entschieden), mit Standardrecht "Ansehen". Ein Hinweis "Mit Anna geteilt · Ansehen ▾ · Rückgängig" erscheint am Chip.
3. **`@`-Menü klar gegliedert** nach Typ: Filter-Chips (Alle, Personen, Notizen, Termine, Todos, Tags) und Abschnitte mit Icon und Überschrift. Nur Personen teilen. Alles andere verlinkt nur. Das Menü sagt das im Fußhinweis.
4. **Teilen-Fenster vereinfacht**: eine Personenliste mit Rechte-Auswahl, Herkunft des Zugriffs ("Über @-Erwähnung", "Aus Kalender Arbeit"), Linkfreigabe darunter.
5. **Kalender teilen**: alle Termine einer Kalendergruppe jetzt und neue später (Schalter "Neue Termine automatisch teilen"). Einzelne Termine lassen sich privat halten.
6. **Sichtbarkeit als Icon überall**: privat (Schloss), geteilt mit Zahl (Personen), mit mir geteilt (Auge), öffentlicher Link (Globus). Bei Erwähnten das Profilbild. Orte: Seitenleiste, Termin-Karten, Todo-Zeilen, Editor-Kopf.

## Nicht-Ziele

- Keine Änderung an Verschlüsselung (`crypto.ts`, `cryptoV2.ts`), Server-DDL (`sqlite.go`) oder dem Schlüsselaustausch.
- Kein eigenes Objekt "geteilter Kalender" mit eigenem Schlüssel (Ansatz B, später möglich).
- Keine Erwähnung nicht bestätigter Kontakte mit Teilen (siehe Randfälle).
- Keine neuen Rechtestufen.

## Anti-Ziele

- Etwas versehentlich teilen und es nicht merken: Der Hinweis mit Rückgängig ist Pflicht.
- Ein Chip sagt "geteilt", obwohl der Server-Aufruf scheiterte.

## Ansätze (gewählt: A)

- **A, gewählt:** Teilen bleibt pro Datei. Die Erwähnung ruft das bestehende Teilen auf (Schlüssel verpacken, `POST /api/v1/files/{id}/share`). Ein Kalender bündelt: Termine der Gruppe werden einzeln geteilt, eine Regel an der Gruppe teilt neue Termine mit. Kein Server- und Krypto-Umbau.
- B, verworfen: eigenes Kalender-Objekt mit eigenem Schlüssel. Sauber, aber Migrationsrisiko und neue Endpunkte.
- C, verworfen: nur Erwähnungen und Icons. Lässt Kalender-Teilen als Attrappe.

## Wie es funktioniert

**Menü.** `mentionSuggestion.tsx` bekommt Kontakte aus `useDataStore.contacts` (nur Status "accepted"). Die Ergebnisse werden in Gruppen sortiert und mit Filter-Chips umschaltbar. Tags und Todos nutzen die vorhandenen Helfer (`tagSuggestion`, Task-Suche).

**Chip.** Neuer Knotentyp `type: "contact"` in `Mention` (`useTipTapConfig.ts`) mit `MentionNodeView`-Zweig: Avatar (aus `avatar_seed/salt/style`), Name. Klick öffnet Profil-Karte (Popover), Button öffnet `ProfilePage` über ein `CustomEvent` nach dem Muster `editor:mention-click`.

**Teilen beim Einfügen.** Beim Einfügen der Kontakt-Erwähnung läuft `onShare(contact.id, email, public_key, 'view', …)` aus dem bestehenden `ShareModal`-Pfad (ausgelagert in einen Hook, z. B. `useShareWithContact`). Termine und Todos teilen ihre eigene Datei. Beim Rückgängig oder beim Löschen des Chips wird der Share widerrufen, wenn er durch diese Erwähnung entstand.

**Kalender.** Regel an `CalendarGroup` (`shared_with: [{userId, permission}]`, `auto_share_new`). Beim Aktivieren werden alle Termine der Gruppe geteilt, beim Anlegen neuer Termine automatisch. Termin-Schloss = von der Regel ausgenommen.

**Icons.** Eine gemeinsame Komponente `VisibilityBadge` (Icon + optional Zahl/Avatare), benutzt in Sidebar, Terminen, Todos, Editor-Kopf. Farben nur über `t2-*`-Tokens, Icons aus `lucide-react`.

## Randfälle (Entscheidungen)

- **Kontakt ohne öffentlichen Schlüssel oder nicht bestätigt:** Chip erscheint grau mit "nicht geteilt, Anfrage offen". Kein Share.
- **Teilen schlägt fehl:** Chip bleibt, Hinweis "Teilen fehlgeschlagen · Erneut versuchen".
- **Objekt ist schon mit der Person geteilt:** kein neuer Share, kein Hinweis.
- **Nutzer hat nur Ansehen-Recht und erwähnt jemanden:** Chip ohne Share, Hinweis "Du darfst das nicht teilen" (`can_reshare`, Rechtegrenzen wie heute serverseitig).
- **Chip gelöscht:** Rückfrage "Zugriff von Anna auch entziehen?" nur, wenn der Share von dieser Erwähnung stammt.
- **Mehrere Erwähnungen derselben Person:** ein Share, Widerruf erst, wenn die letzte Erwähnung weg ist.

## Umsetzungsreihenfolge

1. `VisibilityBadge` + Icons (klein, sichtbar, ohne Risiko).
2. Kontakt-Erwähnung: Menü gegliedert, Chip, Profil-Karte.
3. Teilen beim Einfügen + Hinweis mit Rückgängig, Teilen-Fenster neu.
4. Kalender teilen.

## Dem Bauenden überlassen

Exakte Komponentenaufteilung, Tastatur-Navigation im Menü, i18n-Texte (DE/EN), Tests (`tsc`, Lint ohne neue Fehler, `docs/COMPONENTS.md` aktualisieren).
