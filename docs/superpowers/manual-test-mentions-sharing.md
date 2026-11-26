# Manueller Test: Erwähnungen, Teilen, Sichtbarkeit

Voraussetzung: Dev-Server, zwei Testkonten (A, B), gegenseitig bestätigte Kontakte.

1. **@-Menü:** In einer Notiz `@an` tippen. Menü ist nach Typ gegliedert (Filter-Chips, Gruppen), Personen erscheinen nur bei nicht leerer Eingabe. Leeres `@` verhält sich wie bisher.
2. **Erwähnung teilt:** Kontakt B wählen. Chip erscheint, Hinweis "Mit B geteilt · Ansehen ▾ · Rückgängig". Konto B sieht die Notiz.
3. **Rückgängig:** Auf "Rückgängig" klicken. Zugriff von B ist weg, Chip bleibt ohne "geteilt"-Zustand. Chip löschen fragt, ob der Zugriff entzogen werden soll.
4. **Chip + Profilkarte (Desktop):** Chip anklicken, Karte erscheint, "Profil öffnen" öffnet den Profil-Tab.
5. **Chip + Profil (Mobil):** Gleiches im Mobil-Layout. Profil öffnet als Vollbild-Overlay mit Zurück-Button und Safe-Area-Abstand.
6. **Termin/Todo-@:** In der Beschreibung eines Kalender-Termins (Desktop und Mobil-Sheet) `@B` wählen. Termin wird geteilt. Bei Mobil "Abbrechen" macht den Share rückgängig. Privater Termin teilt nicht.
7. **Teilen-Dialog:** Notiz teilen. Personenliste zeigt Herkunft ("Über @-Erwähnung", "Aus Kalender"), "Darf weiterteilen" nur lesend.
8. **Kalender teilen (Desktop):** Teilen-Button an einem Kalender. Personen mit Ansehen/Bearbeiten wählen, bestätigen. Termine erscheinen bei B, ein neuer Termin erscheint dort ebenfalls.
9. **Kalender entziehen:** Person entfernen. Zugriff bei B endet, bei Fehler gibt es "Erneut versuchen".
10. **Privat halten:** Schloss am Termin (Desktop-Popover und Mobil-Sheet) aktivieren. Termin wird nicht automatisch geteilt. Der Schalter zeigt den Zustand, in Listen erscheint bewusst kein Symbol für Privates.
11. **Sichtbarkeits-Icons:** Seitenleiste, Termine, Todos, Editor-Kopf zeigen Schloss/Personen/Globus korrekt.
12. **Monatsansicht:** Termine früh nach spät sortiert, Todos zuerst ohne farbigen Balken, kein Rahmen/Hintergrund um die Ansicht.
13. **Smart Island:** Tippen sucht zuerst in Notizen/Terminen/Todos. Enter öffnet nur bei Pfeiltasten-/Klick-Auswahl oder exaktem Titel, sonst wird erstellt. Strg+Enter erstellt immer.
14. **Sitzung wiederherstellen:** Tabs und Kalenderansicht öffnen, Seite neu laden: Tabs und aktiver Tab bleiben. Browser komplett neu starten: Tabs bleiben, Kalender ist aktiv.
15. **Abmelden/Anmelden als anderes Konto:** Es erscheinen keine Tabs und keine Erwähnungs-Zähler von Konto A.
