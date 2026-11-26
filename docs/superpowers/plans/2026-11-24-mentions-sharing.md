# @-Erwähnungen, Teilen und Sichtbarkeit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kontakte per `@` erwähnen (teilt sofort, mit Rückgängig), das `@`-Menü nach Typ gliedern, das Teilen-Fenster vereinfachen, Kalender teilen und Sichtbarkeit überall als Icon zeigen.

**Architecture:** Teilen bleibt pro Datei und nutzt `performMessengerShare` aus `web/src/lib/shareLogic.ts`. Neue Logik liegt in kleinen, getesteten Dateien (`lib/mentionShare.ts`, `lib/calendarShare.ts`, `components/Visibility/*`, `components/extensions/mentionGroups.ts`). Die großen Bestandsdateien (`mentionSuggestion.tsx` > 1200 Zeilen, `MentionNodeView.tsx`, `ShareModal.tsx`) werden nur minimal angefasst.

**Tech Stack:** Next.js, TipTap (`@tiptap/extension-mention`), Zustand (`useDataStore`), Vitest, `lucide-react`, Go-Backend unverändert.

**Spec:** `docs/superpowers/specs/2026-11-24-mentions-sharing-design.md` · Mockups: https://claude.ai/artifact/4J1LgYb5RZF4ZLHhqDGHJU

## Global Constraints

- Keine Änderung an `web/src/lib/crypto.ts`, `web/src/lib/cryptoV2.ts`, `cloud/internal/store/sqlite.go` (DDL), `layout.tsx`, `manifest.json`. Kein Go-Code nötig.
- Alle HTTP-Aufrufe über `apiFetch` aus `@/lib/api`, nie `fetch`.
- Farben und Radien nur über `t2-*`-Tailwind-Klassen (`bg-t2-sub`, `text-t2-ink-2`, `border-t2-line`, `bg-t2-accent text-t2-accent-ink`), keine Hex-Werte, keine `dark:`-Klassen für Neutrale.
- Kein neues `any`. Dateien unter 500 Zeilen. Neue UI-Texte in DE und EN (`web/src/lib/i18n/`).
- Standardrecht bei Erwähnung: `'view'`. Nur Kontakte mit `status === 'accepted'` und vorhandenem `public_key` werden geteilt.
- Nach jeder Aufgabe: `cd web && npx tsc --noEmit` ohne Fehler und `npx vitest run <neue Tests>` grün. Commit-Stil: `feat(web): …`.
- `web/docs/COMPONENTS.md` bei neuen Komponenten ergänzen (Aufgabe 8).

## Review Focus

1. Kontakt ohne `public_key` oder nicht `accepted`: grauer Chip, kein Share-Aufruf (Test in Aufgabe 4).
2. Share-Aufruf schlägt fehl: Chip bleibt, Hinweis "Teilen fehlgeschlagen", Zustand nicht "geteilt" (Aufgabe 4).
3. Dieselbe Person zweimal erwähnt oder schon geteilt: genau ein Share, Widerruf erst bei letzter Erwähnung (Aufgabe 4).
4. Rückgängig/Chip löschen widerruft nur Shares, die diese Erwähnung angelegt hat, nie bestehende (Aufgabe 4).
5. Leere Kalendergruppe, Termin mit privat-Markierung, Termin schon geteilt: kein doppelter Share, privater Termin bleibt privat (Aufgabe 6).

---

### Task 1: VisibilityBadge (Zustand + Komponente)

**Files:**
- Create: `web/src/components/Visibility/visibilityState.ts`
- Create: `web/src/components/Visibility/VisibilityBadge.tsx`
- Test: `web/src/components/Visibility/__tests__/visibilityState.test.ts`, `web/src/components/Visibility/__tests__/VisibilityBadge.test.tsx`

**Interfaces:**
- Produces:
  - `type VisibilityKind = 'private' | 'shared' | 'shared-with-me' | 'public'`
  - `function getVisibilityState(input: { visibility?: string | null; isOwner: boolean; sharedWith?: ReadonlyArray<{ userId: string }> }): { kind: VisibilityKind; count: number }`
  - `<VisibilityBadge kind={VisibilityKind} count?: number size?: 12 | 14 | 16 />` (Icons: `Lock`, `Users`, `Eye`, `Globe` aus `lucide-react`; Zahl neben dem Icon nur bei `shared` und `count > 0`)

- [ ] **Step 1: Failing test** `visibilityState.test.ts`: `getVisibilityState({visibility:'private', isOwner:true})` → `{kind:'private', count:0}`; mit `sharedWith:[{userId:'a'},{userId:'b'}]` → `{kind:'shared', count:2}`; `isOwner:false` → `{kind:'shared-with-me', count:0}`; `visibility:'public'` → `{kind:'public', count:0}` (Public gewinnt vor Shared).
- [ ] **Step 2:** `cd web && npx vitest run src/components/Visibility` → FAIL (Modul fehlt).
- [ ] **Step 3: Implement** beide Dateien. Komponente rendert `<span aria-label={…}>` mit Icon und Zahl, Farbe `text-t2-ink-2`, Label per i18n-Schlüssel `visibility.private|shared|sharedWithMe|public`.
- [ ] **Step 4: Failing → passing** `VisibilityBadge.test.tsx`: rendert für `shared`+`count=2` Text "2" und `aria-label` enthält "Geteilt"; für `private` keine Zahl.
- [ ] **Step 5:** `npx vitest run src/components/Visibility` → PASS. Commit `feat(web): add VisibilityBadge`.

### Task 2: Badge an Sidebar, Terminen, Todos und Editor-Kopf einbauen

**Files:**
- Modify: `web/src/components/Layout/sidebar/FileItem.tsx`, `web/src/components/Calendar/CalendarEventItem.tsx`, `web/src/components/Editor/SaveStatusMenu.tsx` (Anzeige im Kopf), die Todo-Zeile (per `Grep "is_task"` in `web/src/components/` die Listen-Komponente finden).
- Test: `web/src/components/Visibility/__tests__/integration.test.tsx`

**Interfaces:**
- Consumes: `getVisibilityState`, `VisibilityBadge` aus Task 1. Die Freigabeliste kommt aus `file.access_keys`/Share-Daten, die die Komponente schon hat; wenn nicht vorhanden, `count` aus dem vorhandenen `isShared`-Flag (`SaveStatusMenu`-Props `isShared`, `isRecipient`) ableiten.

- [ ] **Step 1: Failing test:** `FileItem` mit `visibility:'private'` zeigt `aria-label` "Privat"; mit geteilt "Geteilt"; als Empfänger "Mit mir geteilt".
- [ ] **Step 2:** Test laufen lassen → FAIL.
- [ ] **Step 3:** Badge klein (`size={13}`) rechts in `FileItem` und `CalendarEventItem` einbauen, im Editor-Kopf den vorhandenen Text-Status durch Badge + Text ersetzen. Verhalten sonst unverändert (AGENTS-Regel 1).
- [ ] **Step 4:** `npx vitest run src/components/Visibility` und `npx tsc --noEmit` → grün.
- [ ] **Step 5:** Commit `feat(web): show visibility icons in sidebar, events, todos and editor header`.

### Task 3: Kontaktdaten und gegliedertes `@`-Menü

**Files:**
- Modify: `web/src/store/slices/types.ts` (`ContactItem.public_key?: string`), `web/src/store/slices/createContactsSlice.ts` (`normalizeContact` übernimmt `partner.public_key` bzw. `public_key`)
- Create: `web/src/components/extensions/mentionGroups.ts`, `web/src/components/extensions/MentionMenuChrome.tsx`
- Modify: `web/src/components/extensions/mentionSuggestion.tsx` (nur `items` ergänzen und im Renderer `MentionMenuChrome` einhängen)
- Test: `web/src/components/extensions/__tests__/mentionGroups.test.ts`, `web/src/store/slices/__tests__/contactsNormalize.test.ts`

**Interfaces:**
- Produces:
  - `type MentionGroupKey = 'person' | 'note' | 'event' | 'todo' | 'tag'`
  - `function groupKeyOf(item: { type?: string; is_task?: boolean }): MentionGroupKey` (`type:'contact'`→person, `'tag'`→tag, `is_task`→todo, `'event'`→event, sonst note; `'file'` zählt als note)
  - `function buildContactItems(contacts: ContactItem[], query: string): Array<{ id: string; label: string; type: 'contact'; username: string; avatar: Pick<ContactItem,'avatar_seed'|'avatar_salt'|'avatar_style'>; shareable: boolean }>` — filtert nach Name/`@username` (case-insensitiv, Präfix zuerst), `shareable = status==='accepted' && !!public_key`, max. 5
  - `function groupItems<T extends { type?: string; is_task?: boolean }>(items: T[], filter: 'all' | MentionGroupKey): Array<{ key: MentionGroupKey; items: T[] }>` in fester Reihenfolge person, note, event, todo, tag; leere Gruppen entfallen; Filter ≠ `all` liefert nur diese Gruppe
  - `<MentionMenuChrome filter onFilterChange counts />` rendert die Chips (Alle, Personen, Notizen, Termine, Todos, Tags) und den Fußhinweis "Nur Personen teilen. Notizen, Termine, Todos und Tags verlinken nur." (i18n)

- [ ] **Step 1: Failing tests:** `normalizeContact` mit `{partner:{id:'u1',username:'anna',public_key:'PK'}, status:'accepted'}` → `public_key:'PK'`. `buildContactItems([{id:'1',username:'anna',status:'accepted',public_key:'k'},{id:'2',username:'andreas',status:'pending'}], 'an')` → zwei Einträge, erster `shareable:true`, zweiter `false`. `groupItems` mit gemischten Items und `'all'` → Reihenfolge person, note, todo; mit `'tag'` → nur Tags.
- [ ] **Step 2:** `npx vitest run src/components/extensions/__tests__/mentionGroups.test.ts src/store/slices/__tests__/contactsNormalize.test.ts` → FAIL.
- [ ] **Step 3: Implement** Dateien. `normalizeContact` exportieren, falls es das noch nicht ist.
- [ ] **Step 4:** In `mentionSuggestion.tsx` `items` Kontakte aus `useDataStore.getState().contacts` über `buildContactItems` an den Anfang stellen (nicht in der Quicknote-Ansicht `/notes/`) und die Renderliste über `groupItems` mit Abschnittsüberschrift (Icon + Label) ausgeben. Tastaturnavigation (Pfeile, Enter) bleibt über die flache Reihenfolge erhalten.
- [ ] **Step 5:** Tests + `npx tsc --noEmit` grün. Commit `feat(web): group @-menu by type and offer contacts`.

### Task 4: Kontakt-Erwähnung teilt sofort (Logik, Hinweis, Rückgängig)

**Files:**
- Create: `web/src/lib/mentionShare.ts`, `web/src/store/useMentionShareStore.ts`, `web/src/components/Editor/MentionShareToast.tsx`
- Modify: `web/src/components/extensions/mentionSuggestion.tsx` (Kontakt-Auswahl ruft `props.command` und danach `mentionShare`), `web/src/components/Editor.tsx` (Toast einhängen)
- Test: `web/src/lib/__tests__/mentionShare.test.ts`

**Interfaces:**
- Consumes: `performMessengerShare(file, myId, privateKey, publicKey, events, recipientId, recipientEmail, recipientPubKeySpki, permission, dependencyFileIds, canReshare)` aus `@/lib/shareLogic`; Schlüssel und Events aus `useDataStore.getState()`.
- Produces:
  - `type MentionShareResult = { status: 'shared' | 'already' | 'blocked' | 'failed'; reason?: string }`
  - `async function shareViaMention(args: { file: { id: string; title: string; type?: string }; contact: { id: string; email?: string; public_key?: string; shareable: boolean }; callerCanShare: boolean }): Promise<MentionShareResult>` — `blocked` bei `!shareable` oder `!callerCanShare` (kein Netzaufruf); `already` wenn `GET /api/v1/files/{id}/shares` den Nutzer schon enthält; sonst `performMessengerShare(..., 'view')` → `shared`, bei Exception `failed`
  - `async function revokeMentionShare(fileId: string, userId: string): Promise<void>` — `DELETE /api/v1/files/{fileId}/shares/{userId}` über `apiFetch`
  - Store `useMentionShareStore`: `record(fileId, userId)`, `release(fileId, userId): number` (liefert Rest-Referenzen), `origin(fileId, userId): 'mention' | undefined`, persistiert in `localStorage` unter `tide_mention_shares`; nur Einträge mit Status `shared` werden gezählt, `already` legt nie einen Eintrag an

- [ ] **Step 1: Failing tests** (`apiFetch` und `performMessengerShare` mit `vi.mock`): (a) `shareable:false` → `blocked`, `performMessengerShare` nicht aufgerufen; (b) Exception → `failed`, Store hat keinen Eintrag; (c) Nutzer ist schon in der Freigabeliste → `already`, kein Share, kein Store-Eintrag; (d) Erfolg → `shared`, Store-Eintrag, Rechte `'view'`; (e) zweimal `shareViaMention` für dieselbe Person: ein Share-Aufruf, `release` liefert erst nach dem zweiten Aufruf `0`; (f) `revokeMentionShare` ruft `DELETE` mit richtiger URL.
- [ ] **Step 2:** `npx vitest run src/lib/__tests__/mentionShare.test.ts` → FAIL.
- [ ] **Step 3: Implement** beide Dateien wie oben.
- [ ] **Step 4:** `MentionShareToast`: zeigt "Mit {Name} geteilt · {Recht} ▾ · Rückgängig" (Mockup 2), bei `failed` "Teilen fehlgeschlagen · Erneut versuchen", bei `blocked` den Grund ("Kontakt noch nicht bestätigt" / "Du darfst das nicht teilen"), bei `already` keinen Hinweis. Rückgängig ruft `revokeMentionShare` und löscht den Chip aus dem Editor (`editor.chain().deleteRange(...)`). Das Recht-Dropdown ändert über `PATCH /api/v1/files/{id}/shares/{userId}` (Pfad wie in `ShareManagementPanel.tsx:80`).
- [ ] **Step 5:** Chip-Löschen: im Editor-Update (`useTipTapConfig.ts`) entfernte Kontakt-Knoten erkennen, `release(...)`, und nur bei Rest `0` und Eintrag `origin==='mention'` nachfragen "Zugriff von {Name} auch entziehen?" (i18n) und bei Ja `revokeMentionShare`.
- [ ] **Step 6:** Tests + `npx tsc --noEmit` grün. Commit `feat(web): share on contact mention with undo`.

### Task 5: Kontakt-Chip mit Avatar und Profil-Karte

**Files:**
- Create: `web/src/components/Editor/ContactMentionChip.tsx`, `web/src/components/Editor/ContactProfileCard.tsx`
- Modify: `web/src/components/Editor/MentionNodeView.tsx` (früher Zweig für `type === 'contact'`), `web/src/components/Editor/useTipTapConfig.ts` (`renderHTML`/`parseHTML`: `data-type-link="contact"` bleibt erhalten), `web/src/hooks/dashboard/useDashboardListeners.ts` (Listener für `tide:open-profile`)
- Test: `web/src/components/Editor/__tests__/ContactMentionChip.test.tsx`

**Interfaces:**
- Consumes: Avatar-Rendering wie in `SocialContactCard.tsx` (vorhandene Avatar-Komponente per `Grep avatar_seed` finden und wiederverwenden, keine neue Avatar-Logik).
- Produces: Knoten-Attribute `{ id: userId, label: username, type: 'contact', shareable?: boolean }`; Chip zeigt Avatar + Name, grau mit Hinweis "nicht geteilt" wenn `shareable === false`; Klick öffnet `ContactProfileCard` (Avatar groß, Name, `@username`, Recht, Button "Profil öffnen"); der Button dispatcht `window.dispatchEvent(new CustomEvent('tide:open-profile', { detail: { userId, username } }))`, der Listener ruft `switchTab('profile:' + userId, 'profile', username)` (wie `SocialHub.onOpenProfile`).

- [ ] **Step 1: Failing test:** Chip rendert Namen und Avatar; Klick zeigt Karte; Klick auf "Profil öffnen" dispatcht `tide:open-profile` mit `{userId:'u1', username:'anna'}`; `shareable:false` zeigt "nicht geteilt".
- [ ] **Step 2:** `npx vitest run src/components/Editor/__tests__/ContactMentionChip.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Der Chip nutzt `t2-*`-Klassen (`bg-t2-sub border-t2-line rounded-full`), Karte `bg-t2-surface shadow-float`. Der Name wird live aus `useDataStore.contacts` aufgelöst (wie bei Notizen der Live-Titel) und fällt auf `label` zurück.
- [ ] **Step 4:** Kontakt-Erwähnung funktioniert auch in Termin- und Todo-Beschreibungen: prüfen, dass derselbe `Mention`-Knoten dort verwendet wird (`Grep useTipTapConfig`); wenn ein Feld eine eigene Mention-Konfiguration hat, `mentionSuggestion` und den Chip dort ebenfalls setzen.
- [ ] **Step 5:** Tests + `npx tsc --noEmit` grün. Commit `feat(web): contact mention chip with profile card`.

### Task 6: Kalender teilen

**Files:**
- Create: `web/src/lib/calendarShare.ts`, `web/src/components/Settings/calendar/CalendarShareDialog.tsx`
- Modify: `web/src/components/Settings/calendar/CalendarGroupsSection.tsx` (Teilen-Button öffnet den Dialog; Personen-Zahl neben dem Namen über `VisibilityBadge`), Speicherung der Regel dort, wo `CalendarGroup`-Einstellungen schon synchronisiert werden (`web/src/lib/settingsSync.ts`), Termin-Anlegen-Pfad (`handleEventSave` in `web/src/hooks/dashboard/`), `CalendarGroup`-Typ
- Test: `web/src/lib/__tests__/calendarShare.test.ts`

**Interfaces:**
- Produces:
  - `type CalendarShareRule = { groupId: string; recipients: Array<{ userId: string; permission: 'view' | 'edit' }>; autoShareNew: boolean }`
  - `CalendarGroup` bekommt `share?: CalendarShareRule` (rückwärtskompatibel, optional)
  - `function planGroupShares(args: { events: Array<{ id: string; groupId?: string | null; private?: boolean; sharedWith?: string[] }>; rule: CalendarShareRule }): Array<{ eventId: string; userId: string; permission: 'view' | 'edit' }>` — enthält nur Termine der Gruppe, die nicht `private` sind und die Person noch nicht in `sharedWith` haben
  - `async function applyGroupShares(plan, shareOne: (eventId: string, userId: string, permission: 'view'|'edit') => Promise<void>): Promise<{ done: number; failed: number }>` — arbeitet sequenziell, ein Fehler stoppt nicht die übrigen
  - `async function shareNewEvent(event, rule, shareOne)` — wird beim Anlegen aufgerufen, wenn `rule.autoShareNew`

- [ ] **Step 1: Failing tests** für `planGroupShares`: leere Gruppe → `[]`; Termin mit `private:true` fehlt im Plan; Termin, den die Person schon hat, fehlt; zwei Empfänger × zwei Termine → vier Einträge; Termin einer anderen Gruppe fehlt. `applyGroupShares` mit einem werfenden `shareOne` → `{done:n-1, failed:1}`.
- [ ] **Step 2:** `npx vitest run src/lib/__tests__/calendarShare.test.ts` → FAIL.
- [ ] **Step 3: Implement** `calendarShare.ts`; `shareOne` ist `performMessengerShare` mit dem Kontakt-`public_key` (gleicher Pfad wie Task 4).
- [ ] **Step 4:** `CalendarShareDialog` nach Mockup 4: Titel "Kalender „{Name}“ teilen", Personenliste mit Rechte-Auswahl, Eingabe `@ Kontakt hinzufügen`, Schalter "Neue Termine automatisch teilen", Zeile "13 von 14 Terminen geteilt · 1 Termin privat gehalten". Entfernen einer Person widerruft ihre Shares aller Termine der Gruppe über `DELETE /api/v1/files/{id}/shares/{userId}`.
- [ ] **Step 5:** Termin-Schloss: im Termin-Popover einen Schalter "Privat halten" (`metadata.private`), der die Gruppen-Regel für diesen Termin ausschließt und bestehende Shares dieses Termins widerruft.
- [ ] **Step 6:** Tests + `npx tsc --noEmit` grün. Commit `feat(web): share calendars with contacts`.

### Task 7: Teilen-Fenster vereinfachen

**Files:**
- Modify: `web/src/components/ShareModal.tsx` (Darstellung der Personenliste und Herkunft), `web/src/components/ShareManagementPanel.tsx` (Herkunft anzeigen)
- Test: `web/src/components/__tests__/ShareModalOrigin.test.tsx`

**Interfaces:**
- Consumes: `useMentionShareStore.origin(fileId, userId)` (Task 4) und `CalendarShareRule` (Task 6).
- Produces: pro Person eine Zeile "Name · Herkunft" mit `Über @-Erwähnung` (Store), `Aus Kalender „{Name}“` (Gruppen-Regel enthält Person und Termin gehört zur Gruppe) oder leer; Rechte-Auswahl `Ansehen ▾` / `Bearbeiten ▾` ohne die technische Option `share`, `can_reshare` als zweite Zeile "Darf weiterteilen" unter "Mehr"; Linkfreigabe-Zeile unten (Mockup 3).

- [ ] **Step 1: Failing test:** Person mit Store-Eintrag zeigt "Über @-Erwähnung"; Person aus Kalender-Regel zeigt "Aus Kalender"; keine Herkunft zeigt keinen Zusatz; Rechte-Menü bietet nur Ansehen und Bearbeiten.
- [ ] **Step 2:** `npx vitest run src/components/__tests__/ShareModalOrigin.test.tsx` → FAIL.
- [ ] **Step 3: Implement**; Verhalten der Share-Aufrufe (Abhängigkeits-Scan, DEK-Rotation beim Entfernen) bleibt unverändert.
- [ ] **Step 4:** Tests + `npx tsc --noEmit` grün. Commit `feat(web): simplify share modal and show access origin`.

### Task 8: Dokumentation und Gesamtprüfung

**Files:**
- Modify: `web/docs/COMPONENTS.md` (neue Komponenten), `cloud/docs/auth/03-access-control-and-sharing.md` (Absatz "Teilen über @-Erwähnung und Kalender, rein clientseitig")

- [ ] **Step 1:** Komponenten-Register ergänzen: `VisibilityBadge`, `MentionMenuChrome`, `ContactMentionChip`, `ContactProfileCard`, `MentionShareToast`, `CalendarShareDialog`.
- [ ] **Step 2:** `cd web && npx tsc --noEmit && npm run lint 2>&1 | tail -5` → Typecheck sauber, keine neuen Lint-Fehler gegenüber 557.
- [ ] **Step 3:** `cd web && npx vitest run && npm run build` → alles grün.
- [ ] **Step 4:** Manuell im Browser (Dev-Server, zwei Testkonten, Kontakte bestätigt): `@an` in Notiz → Menü gegliedert; Auswahl → Chip + Hinweis; zweites Konto sieht die Notiz; Rückgängig → Zugriff weg; Profil-Karte → Profil-Tab öffnet; Kalender teilen → Termine beim zweiten Konto sichtbar, neuer Termin erscheint dort ebenfalls.
- [ ] **Step 5:** Commit `docs: document mentions, sharing and visibility components`.
