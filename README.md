# TRAINING · Performance Cockpit 🚴

Kostenloses, mobiloptimiertes und lokal datenverarbeitendes Trainingscockpit für Radfahren, Laufen und Erholung.

## Stand

Version 0.3 – Coaching mit Intervals.icu-Kalenderübertragung. Die frühere V0.1 bleibt als Grundansicht erhalten. Im Repository liegen ausschließlich Programmdateien und keine privaten Trainingsdaten.

## GitHub Pages aktivieren

1. Repository Maxi23-12/training öffnen.
2. Settings → Pages → Build and deployment → Deploy from a branch auswählen.
3. Branch: main, Folder: /(root) wählen und Save klicken.
4. Nach erfolgreicher Bereitstellung ist die App unter https://maxi23-12.github.io/training/ erreichbar.

Die Webadresse funktioniert erst, wenn GitHub Pages eingeschaltet und erfolgreich bereitgestellt wurde.
Auf dem iPhone: Safari öffnen → Teilen → Zum Home-Bildschirm.

## Erste Inbetriebnahme

Über Daten & Einstellungen auf jedem Gerät diese CSV-Dateien importieren:

- Intervals.icu – Aktivitäten: i114427_activities.csv
- Strava – Aktivitäten: activities.csv
- RENPHO – Gewicht: RENPHO Health-….csv
- Intervals.icu – Wellness: athlete_…wellness.csv

CSV-Dateien werden ausschließlich in deinem Browser verarbeitet. Kein Upload an GitHub oder fremde Server.
Browserdaten liegen gerätegebunden im lokalen Speicher und können beim Löschen von Websitedaten verschwinden.
Regelmäßig ein privates JSON-Backup exportieren; für den Gerätewechsel auf dem anderen Gerät importieren.

## Funktionen

- Coaching: Tagesform, Zeitbudget, drinnen/draußen, Schwerpunkt, regelbasierter Trainingsvorschlag, FTP-Wattvorgaben und ein flexibler lokaler Wochenplan
- Coaching: Kurzvergleich 7/28 Tage mit Hinweis auf veraltete Daten; geplante Einheiten können manuell als erledigt/ausgefallen markiert werden
- Coaching: Ein strukturiertes Workout nach Vorschau und ausdrücklicher Bestätigung direkt per offizieller Intervals.icu-API in den Kalender übertragen (experimentell)
- Übersicht: Radkilometer, Radstunden, jüngste Aktivitäten und Trainingsbelastung
- Historie: Monatsansichten und Jahresvergleiche für Radfahren und Laufen
- Aktivitäten: Filter nach Jahr, Sportart und Name
- Erholung: RENPHO-Gewicht, Schlafdauer, HRV und Ruhepuls
- Duplikatabgleich zwischen Strava und Intervals.icu anhand von IDs, Zeit und Strecke
- Heuristische Korrektur auffälliger Pendelfahrzeiten über icu_recording_time
- Lokales JSON-Backup und jederzeit änderbare FTP/HFmax-Werte

## Grenzen der Version 0.1

- Keine automatische Datenquellensynchronisierung
- Keine automatische Synchronisierung zwischen Handy und PC
- Keine FIT-Detailauswertung; CSV-Zusammenfassungen als Grundlage
- Regelbasierte Coaching-Vorschläge sind noch keine automatische KI-Trainingssteuerung; subjektives Feedback und Trainingsergebnisse werden nicht selbstständig ausgewertet
- Für aktuelle Empfehlungen regelmäßig neue CSV-Daten importieren, da kein Live-Sync existiert
- Trainingsbelastung nur für tatsächlich von Intervals.icu gelieferte Einheiten
- Doppelte Einheiten werden heuristisch erkannt, einzelne Sonderfälle sind manuell zu prüfen
- Noch nicht in allen Browsern mit sämtlichen Originaldaten getestet

## Datenschutz

GitHub Pages ist öffentlich. Niemals echte Trainings-, Wellness-, Gewichts- oder Backup-Dateien in dieses öffentliche Repository hochladen. Die .gitignore ist ein zusätzlicher Hinweis, keine Zugriffssperre.

Die App ist statisch (HTML, CSS und JavaScript), ohne Backend, Bezahlabos oder Tracking. Datenhaltung über browsergebundenes localStorage.

## Entwicklung

Layout: styles.css · Oberfläche: index.html · Logik: app.js.

GAM ON! 🚴
## Intervals.icu Kalenderübertragung (experimentell)

1. Coaching → **Direkt an Intervals.icu senden** öffnen.
2. In Intervals.icu unter **Settings → Developer Settings** einen persönlichen API-Key erstellen.
3. Athleten-ID (Format `i123456`) und API-Key in das Formular im TRAINING-Cockpit eingeben – **niemals** im Chat oder GitHub.
4. Datum und Workout auswählen → Vorschau anzeigen → Senden ausdrücklich bestätigen.
5. Im Intervals.icu-Kalender prüfen, ob das geplante Workout korrekt angekommen ist.

Die Athleten-ID wird automatisch aus dem Namen der importierten Intervals.icu-Aktivitätsdatei erkannt und lokal im Browser gemerkt. Der API-Key wird standardmäßig nur für diesen Browser-Tab in `sessionStorage` behalten. Optional kann der Nutzer ausdrücklich „API-Schlüssel auf diesem Gerät dauerhaft merken“ aktivieren; dann liegt er **unverschlüsselt in `localStorage`**. Diese Option nur auf persönlichen, geschützten Geräten verwenden. Unter „Gespeicherten Zugang entfernen“ lassen sich Athleten-ID und gespeicherte Schlüssel löschen. Kein Schlüssel wird ins GitHub-Repository oder in JSON-Backups übernommen. Die Anfrage geht direkt an `https://intervals.icu/api/v1/athlete/<ID>/events`; kein Proxy oder Zwischenserver. Bei unklaren Verbindungsfehlern erst im Kalender nachsehen, bevor erneut gesendet wird, um Dubletten zu vermeiden.

Die Übertragung setzt einen eigenen Intervals.icu-API-Zugang voraus. Die Funktion wurde bislang technisch integriert, aber noch nicht mit einem echten Konto getestet. Sie verwendet die öffentliche API mit Kalender-Events vom Typ `WORKOUT` und nativer Workout-Beschreibung; die tatsächliche Server-Interpretation sollte beim ersten Versuch kontrolliert werden.
