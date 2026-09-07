# GraveWatcher – Graveyard-Tracker für Magic: The Gathering

Offline-fähige PWA zum Mitzählen der Karten auf 1 bis 4 Friedhöfen, getrennt nach
Kartentyp (Creatures, Artifacts, Instants, Sorcery, Enchantment, Land). Reines
HTML/CSS/JS, kein Build-Schritt.

## Entwickeln

Repo in VS Code öffnen, Live-Server-Extension nutzen (Rechtsklick auf
`index.html` → **Open with Live Server**, oder **Go Live** in der
Statusleiste). Läuft unter `http://localhost:5500`. Kein `npm install`, kein
Build – alle Dateien werden unverändert ausgeliefert.

### Service Worker

`sw.js` cacht alle App-Dateien fürs Offline-Funktionieren. Nach jeder
inhaltlichen Änderung an einer gecachten Datei muss `CACHE_VERSION` in `sw.js`
hochgezählt werden, sonst bekommen Nutzer:innen weiter die alte Version
ausgeliefert.

## Aufs Handy bringen

- **Schnell testen (gleiches WLAN):** Live Server starten, lokale IP des
  Rechners herausfinden (`ipconfig`), auf dem Handy `http://<IP>:5500`
  öffnen, dann über das Browsermenü **„Zum Startbildschirm hinzufügen"**.
- **Dauerhaft, mit HTTPS:** Projekt auf GitHub pushen, unter **Settings →
  Pages** die Quelle auf Branch `main` (Ordner `/`) stellen, die
  `https://<user>.github.io/<repo>/`-URL aufs Handy holen und dort zum
  Startbildschirm hinzufügen.

## Daten

Zählerstände liegen in `localStorage` unter dem Schlüssel `gy.counts.v1` und
bleiben nach Reload/offline erhalten. "Alles zurücksetzen" im Menü braucht
bewusst zweimaliges Tippen statt eines nativen `confirm()`-Dialogs – der
liefert in als App installierten PWAs (v. a. iOS) oft sofort `undefined`,
ohne den Dialog je anzuzeigen.

## Eigene Icons einsetzen

Alle Symbole sind einzelne PNG/SVG-Dateien und lassen sich ohne Codeänderung
ersetzen – Datei mit demselben Namen an derselben Stelle ablegen
(transparenter Hintergrund, helles Motiv für den dunklen App-Hintergrund):

- `icons/ui/` – Bedienelemente (`plus.png`, `menu.png`, `hex-frame.svg`, …)
- `icons/types/` – ein Icon je Kartentyp
- `icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png` – App-Icon
  fürs Startbildschirm-Symbol (Größen aus `manifest.json`; maskable braucht
  Rand-Sicherheitsabstand, Inhalt zentriert in der inneren ~80%-Zone)

Nach dem Austauschen nicht vergessen: `CACHE_VERSION` in `sw.js` hochzählen.

> Das aktuelle App-Icon enthält ein selbst nachgebautes MTG-Kartenrücken-Symbol
> (Wizards of the Coast). Für rein privaten Gebrauch unkritisch – vor einer
> öffentlichen Veröffentlichung markenrechtlich prüfen.
