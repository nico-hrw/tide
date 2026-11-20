# Mobile Kalender: Schnellbearbeitung, Entwurf per Doppeltipp, korrekte Zeitlinie

Status: Entwurf zur Freigabe · Datum: 2026-11-20 · Bereich: `web` (mobile Tagesansicht)

## Absicht und Warum

Termine am Handy anzulegen und zu verschieben ist umständlich. Die Tagesansicht ist eine Liste und
zeigt die Zeit nur indirekt. Der Nutzer will die Liste so behalten, aber zum schnellen Bearbeiten
vorübergehend ein Zeitraster zur Hilfe bekommen. Die Zeitlinie in der Tagesansicht steht außerdem
immer zwischen zwei Terminen und nicht auf der echten Uhrzeit.

## Ziele

1. **Schnellbearbeitung:** Ein gehaltener Termin wird zum aktiven Objekt in einem Tagesraster. Er lässt sich
   verschieben, und über die obere oder untere Kante verlängern oder kürzen.
2. **Entwurf per Doppeltipp:** Ein Doppeltipp irgendwo in der Tagesansicht erzeugt einen Entwurf. Die
   Startzeit wird aus der Tippposition berechnet (auf 10 min gerundet), die Dauer ist 1 h. Der Entwurf
   öffnet dasselbe Raster. Danach folgen Name, Farbe, Beschreibung und Wiederholung.
3. **Korrekte Zeitlinie:** Die Linie steht auf der echten Uhrzeit.

## Nicht-Ziele und Anti-Ziele

- Die Tagesansicht wird **kein dauerhaftes Stundenraster**. Das Raster erscheint nur kurz zum Bearbeiten.
- Keine Änderung der Wochen-, Monats- oder Agenda-Ansicht (`MobileWeekGrid` bleibt unverändert).
- Keine Änderung am Datenmodell oder an der Cloud. Es werden nur vorhandene Callbacks benutzt.
- Anti-Ziel: Doppeltipp darf das bisherige Aufklappen der Karten nicht spürbar verzögern oder kaputtmachen.

## Verhalten der Liste

- **Alle Termine** werden mit maßstäblicher Höhe gezeichnet, überlappend oder nicht (heute gilt das nur für
  Überlappungen; einzelne Karten haben eine feste Höhe). Der Maßstab darf kleiner werden als der heutige
  `PX_PER_MIN = 1.1`. Termine unter einer Mindesthöhe bekommen die Mindesthöhe, damit der Titel lesbar bleibt.
- **Pausen** bleiben feste Streifen (34 px, "2h frei").
- **Aktive Pause:** Liegt "jetzt" in einer Pause, wächst sie auf ihre echte Länge im selben Maßstab. Die Linie
  liegt darin exakt. Beginnt der nächste Termin, schrumpft sie wieder (animiert).
- **Laufender Termin:** Die Linie läuft durch die Karte, passend zum Fortschritt.
- **Vergangene Pausen** bleiben feste Streifen. Die Linie wird aus den tatsächlich sichtbaren Höhen berechnet,
  nicht aus der reinen Uhrzeit.

## Zeit-Pixel-Zuordnung (Kernbaustein)

Eine reine Funktion, die in beide Richtungen arbeitet, getrennt von React testbar:

- Zeit → y (für die Zeitlinie)
- y → Zeit (für den Doppeltipp)

Sie rechnet innerhalb des Elements unter dem Finger: in einer Pause linear zwischen Ende des vorigen und
Start des nächsten Termins, auf einer Karte linear zwischen Start und Ende dieses Termins, vor dem ersten
und nach dem letzten Termin nach Abstand vom Rand. Bei überlappenden Terminen zählt die Karte oben.
Ergebnis: auf 10 min runden, Dauer 1 h. Der Entwurf landet in der richtigen Pause oder Karte, nicht
pixelgenau am Finger. Das Raster erlaubt die Feinjustierung.

## Schnellbearbeitungs-Raster (Ansatz A: Overlay)

- Auslöser: Gedrückt halten einer Karte (Vorschlag: etwa 450 ms; die 1 s der Wochenansicht gelten für das Ziehen im Raster).
- Die Liste wird abgedunkelt, ein Tagesraster fährt ein und scrollt auf den Termin. Die anderen Termine des Tages stehen
  blass als Kontext darin.
- Der aktive Termin ist ein Block: Körper ziehen = verschieben, obere und untere Kante = Beginn oder Ende ändern.
  Alles rastet auf 10 min ein. Während des Ziehens wird die Zeit angezeigt.
- ✓ übernimmt über `onEventUpdate`, ✕ verwirft. Danach verschwindet das Raster.
- Bei einem Entwurf folgt nach ✓ das vorhandene Formular (`MobileEventEditSheet`/`MobileCreateModal`) für
  Name, Farbe, Beschreibung und Wiederholung. Erst dann wird gespeichert (`onNewEvent`).
- Wiederverwenden: Zeit-Einrast-Mathematik und die Touch-Erkenntnisse aus `docs/calendar/MOBILE_TOUCH_GESTURES.md`
  (DOM-Overlay beim Ziehen, `flushSync`, `touchAction`, iOS-Scroll-Jiggle).

## Entscheidungen des Nutzers

- Die Liste bleibt, Raster nur als Hilfe beim Bearbeiten.
- Alle Termine maßstäblich, Pausen fest, aktive Pause wächst.
- Doppeltipp: relative Position → nächstbeste Zeit, auf 10 min gerundet, plus 1 h.
- Ansatz A (Overlay) gewählt.

## Ansätze, die verglichen wurden

| Ansatz | Vor- und Nachteile | Entscheidung |
|---|---|---|
| A: Overlay über der Liste | Genügend Platz für 10-min-Genauigkeit, Mathematik der Wochenansicht wiederverwendbar | **gewählt** |
| B: Bottom-Sheet mit Mini-Raster | Einfach, aber zu eng für feines Ziehen | verworfen |
| C: Liste verwandelt sich ins Raster | Optisch stark, riskant mit den bestehenden Touch-Gesten | verworfen |

## Meine Entscheidungen (bitte prüfen)

- Haltedauer 450 ms zum Öffnen des Rasters.
- Einfacher Tipp klappt die Karte weiter sofort auf. Ein zweiter Tipp innerhalb von 300 ms nimmt das Aufklappen
  zurück und erzeugt den Entwurf.
- Der Entwurf wird erst beim Bestätigen im Formular gespeichert, nicht schon beim Doppeltipp.
- Der neue Maßstab und die Mindesthöhe werden am Gerät abgestimmt.
- Neue Logik kommt in kleine neue Dateien unter `components/Layout/mobile/`, damit `MobileAgendaTimeline.tsx`
  (562 Zeilen) nicht weiter wächst. Das ist ein sinnvoller Grund für neue Dateien.
- `web/docs/COMPONENTS.md` wird aktualisiert.

## Dem Bauenden überlassen

Maßstab, Mindesthöhe, Animationsdauer, Aufbau der Dateien und genaue Griffgrößen. Randfälle wie Termine über
Mitternacht und Ganztagstermine behandelt das Raster wie die Wochenansicht.

## Außerhalb dieses Dokuments

Tabellen am PC (Zellen verbinden, Ausrichtung, Formeln, Variablen) sind ein eigenes Projekt mit eigener Planung.
