# TRAINING · Performance Cockpit 🚴

Kostenloses, mobiloptimiertes und lokal datenverarbeitendes Trainingscockpit für Radfahren, Laufen und Erholung.

## Stand

Version 0.1 – erste benutzbare Basis. Im Repository liegen ausschließlich Programmdateien und keine privaten Trainingsdaten.

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
- Trainingsbelastung nur für tatsächlich von Intervals.icu gelieferte Einheiten
- Doppelte Einheiten werden heuristisch erkannt, einzelne Sonderfälle sind manuell zu prüfen
- Noch nicht in allen Browsern mit sämtlichen Originaldaten getestet

## Datenschutz

GitHub Pages ist öffentlich. Niemals echte Trainings-, Wellness-, Gewichts- oder Backup-Dateien in dieses öffentliche Repository hochladen. Die .gitignore ist ein zusätzlicher Hinweis, keine Zugriffssperre.

Die App ist statisch (HTML, CSS und JavaScript), ohne Backend, Bezahlabos oder Tracking. Datenhaltung über browsergebundenes localStorage.

## Entwicklung

Layout: styles.css · Oberfläche: index.html · Logik: app.js.

GAM ON! 🚴