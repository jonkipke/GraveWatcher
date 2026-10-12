'use strict';

/**
 * GraveWatcher – Graveyard-Tracker für Magic: The Gathering.
 * Reines HTML/CSS/JS ohne Frameworks und ohne Build-Schritt.
 */

// Kartentypen in Anzeigereihenfolge. Kopfleiste und Board werden daraus generiert,
// Umsortieren oder Erweitern ist damit nur eine Änderung an diesem Array.
const TYPES = [
  { key: 'creatures', label: 'Creatures', icon: 'icons/types/creatures.png' },
  { key: 'artifacts', label: 'Artifacts', icon: 'icons/types/artifacts.png' },
  { key: 'instants', label: 'Instants', icon: 'icons/types/instants.png' },
  { key: 'sorcery', label: 'Sorcery', icon: 'icons/types/sorcery.png' },
  { key: 'enchantment', label: 'Enchantment', icon: 'icons/types/enchantment.png' },
  { key: 'land', label: 'Land', icon: 'icons/types/land.png' },
  // `optional`: seltener genutzte Typen. Sie bekommen einen eigenen echten
  // Zählerstand wie jeder andere Typ und werden ganz normal unter den
  // übrigen Kategorien einsortiert (keine eigene Gruppe/kein Akkordeon mehr),
  // sind aber standardmäßig komplett ausgeblendet (Board-Sektion, Kopfleiste,
  // Vollbildübersicht) – sichtbar erst, wenn im Menü die jeweils eigene
  // Checkbox aktiviert wird (siehe optionalTypeVisibility).
  { key: 'planeswalker', label: 'Planeswalker', icon: 'icons/types/planeswalker.png', optional: true },
  { key: 'battles', label: 'Battles', icon: 'icons/types/battles.png', optional: true },
];

// Kombinationen aus bereits oben bestehenden Typen (z. B. eine Artifact
// Creature ist gleichzeitig ein Artifact UND eine Creature). Jede Kombo hat
// einen eigenen, unabhängigen Zählerstand (siehe comboCounts) – ein Tipp auf
// "Artifact Creature" zählt NICHT die Basis-Typen Artifacts/Creatures direkt
// hoch. Die angezeigte Gesamtzahl für einen Basis-Typ (Kopfleiste,
// Typ-Sektion, Vollbildübersicht) ist aber die Summe aus seinem eigenen
// Zählerstand plus allen Kombos, die ihn über `types` referenzieren (siehe
// typeTotalForPlayer) – eine Artifact Creature zählt also weiterhin zu
// "wie viele Artifacts insgesamt" dazu, nur eben nicht als Mutation des
// Basis-Zählerstands. Kombos leben im einklappbaren "Combo Types"-Akkordeon.
const COMBOS = [
  { key: 'artifact-creature', label: 'Artifact Creature', types: ['artifacts', 'creatures'] },
  { key: 'enchantment-creature', label: 'Enchantment Creature', types: ['enchantment', 'creatures'] },
  { key: 'artifact-land', label: 'Artifact Land', types: ['artifacts', 'land'] },
  { key: 'enchantment-land', label: 'Enchantment Land', types: ['enchantment', 'land'] },
];

const MIN_PLAYERS = 1;
const MAX_PLAYERS = 4;
const STORAGE_KEY = 'gy.counts.v1';
const MAX_COUNT = 999;

// Verhindert, dass lange Namen die schmalen Spieler-Boxen sprengen (siehe
// auch die Ellipsis-Kürzung in style.css als zusätzliche Absicherung).
const PLAYER_NAME_MAX_LENGTH = 14;

// Gedrückt-Halten wie bei Lotus: nach HOLD_DELAY_MS springt der Zähler in
// Fünferschritten weiter, statt weiter einzeln zu zählen.
const HOLD_DELAY_MS = 500;
const HOLD_REPEAT_MS = 450;
const HOLD_STEP = 5;

// Höchstens so viele zuletzt genutzte Spielernamen werden im Verlauf behalten.
const NAME_HISTORY_LIMIT = 20;

// ---------- Zustand ----------

function createEmptyCounts() {
  const counts = {};
  for (const type of TYPES) {
    counts[type.key] = Array(MAX_PLAYERS).fill(0);
  }
  return counts;
}

function loadCounts() {
  // Defensiv einlesen: kaputte/fremde Daten dürfen die App nie blockieren.
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyCounts();
    const parsed = JSON.parse(raw);
    const counts = createEmptyCounts();
    for (const type of TYPES) {
      const entry = parsed && parsed[type.key];
      if (!entry) continue;
      for (let playerIndex = 0; playerIndex < MAX_PLAYERS; playerIndex += 1) {
        const legacyValue =
          playerIndex === 0 ? entry.you : playerIndex === 1 ? entry.opp : undefined;
        const value = Number(Array.isArray(entry) ? entry[playerIndex] : legacyValue);
        if (Number.isFinite(value) && value >= 0) {
          counts[type.key][playerIndex] = Math.min(MAX_COUNT, Math.floor(value));
        }
      }
    }
    return counts;
  } catch {
    return createEmptyCounts();
  }
}

function saveCounts(counts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
  } catch {
    // Speicher voll oder gesperrt (z. B. privater Modus) – Anzeige läuft trotzdem weiter.
  }
}

// Gesamtzahl physischer Karten pro Spieler – getrennt von `counts`/
// `comboCounts` geführt, statt bei jeder Anzeige neu aus beiden
// zusammengerechnet zu werden. Jeder Tipp (Typ ODER Kombo) verändert genau
// einen Zählerstand um `delta`, darum reicht ein einfaches Mitführen in
// applyFromButton – keine Entkopplung nötig wie frühers, als ein Kombo-Tipp
// noch zwei Basis-Typen gleichzeitig veränderte.
function loadCardCounts() {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}.cardCounts`);
    const parsed = raw && JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === MAX_PLAYERS) {
      return parsed.map((value) => {
        const num = Number(value);
        return Number.isFinite(num) && num >= 0 ? Math.min(MAX_COUNT, Math.floor(num)) : 0;
      });
    }
  } catch {
    // ignoriert, Migration unten greift.
  }
  // Migration für Bestandsdaten von vor dieser Zählweise: damals entsprach
  // die Summe aller Kategorien (Kombos gab es noch nicht als eigenen
  // Zählerstand) exakt der Kartenzahl, das ist also weiterhin ein korrekter
  // Startwert.
  return Array.from({ length: MAX_PLAYERS }, (_, playerIndex) =>
    TYPES.reduce((sum, type) => sum + counts[type.key][playerIndex], 0),
  );
}

function saveCardCounts(cardCounts) {
  try {
    localStorage.setItem(`${STORAGE_KEY}.cardCounts`, JSON.stringify(cardCounts));
  } catch {
    // Speicher voll oder gesperrt (z. B. privater Modus) – Anzeige läuft trotzdem weiter.
  }
}

// Eigene, von den Basis-Typen unabhängige Zählerstände pro Kombo (siehe
// COMBOS oben). Analog zu loadCounts/createEmptyCounts, nur für COMBOS statt
// TYPES.
function createEmptyComboCounts() {
  const comboCounts = {};
  for (const combo of COMBOS) {
    comboCounts[combo.key] = Array(MAX_PLAYERS).fill(0);
  }
  return comboCounts;
}

function loadComboCounts() {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}.comboCounts`);
    if (!raw) return createEmptyComboCounts();
    const parsed = JSON.parse(raw);
    const comboCounts = createEmptyComboCounts();
    for (const combo of COMBOS) {
      const entry = parsed && parsed[combo.key];
      if (!Array.isArray(entry)) continue;
      for (let playerIndex = 0; playerIndex < MAX_PLAYERS; playerIndex += 1) {
        const value = Number(entry[playerIndex]);
        if (Number.isFinite(value) && value >= 0) {
          comboCounts[combo.key][playerIndex] = Math.min(MAX_COUNT, Math.floor(value));
        }
      }
    }
    return comboCounts;
  } catch {
    return createEmptyComboCounts();
  }
}

function saveComboCounts(comboCounts) {
  try {
    localStorage.setItem(`${STORAGE_KEY}.comboCounts`, JSON.stringify(comboCounts));
  } catch {
    // Speicher voll oder gesperrt (z. B. privater Modus) – Anzeige läuft trotzdem weiter.
  }
}

// Welche Spieler aktuell mitgezählt werden. Einzelne Spieler können über die
// Icons an ihrer Spieler-Summe entfernt werden (siehe unten), nicht nur über
// die "Anzahl der Spieler"-Kurzwahl im Menü – deshalb ein Flag pro Spieler
// statt nur einer Gesamtzahl.
function loadActivePlayers() {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}.activePlayers`);
    const parsed = raw && JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === MAX_PLAYERS) {
      const active = parsed.map(Boolean);
      if (active.filter(Boolean).length >= MIN_PLAYERS) return active;
    }
  } catch {
    // ignoriert, Fallback unten greift.
  }
  // Migration von der alten reinen Spielerzahl bzw. Standardwert.
  const legacyCount = Math.max(
    MIN_PLAYERS,
    Math.min(MAX_PLAYERS, Number(localStorage.getItem(`${STORAGE_KEY}.players`)) || MIN_PLAYERS),
  );
  return Array.from({ length: MAX_PLAYERS }, (_, playerIndex) => playerIndex < legacyCount);
}

function saveActivePlayers(activePlayers) {
  try {
    localStorage.setItem(`${STORAGE_KEY}.activePlayers`, JSON.stringify(activePlayers));
  } catch {
    // Speicher voll oder gesperrt (z. B. privater Modus) – Anzeige läuft trotzdem weiter.
  }
}

// Individuelle Spielernamen (optional). `null` bedeutet "Standardname
// verwenden" (siehe getPlayerName).
function loadPlayerNames() {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}.playerNames`);
    const parsed = raw && JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === MAX_PLAYERS) {
      return parsed.map((name) =>
        typeof name === 'string' && name.trim()
          ? name.trim().slice(0, PLAYER_NAME_MAX_LENGTH)
          : null,
      );
    }
  } catch {
    // ignoriert, Standardnamen greifen.
  }
  return Array(MAX_PLAYERS).fill(null);
}

function savePlayerNames(playerNames) {
  try {
    localStorage.setItem(`${STORAGE_KEY}.playerNames`, JSON.stringify(playerNames));
  } catch {
    // Speicher voll oder gesperrt (z. B. privater Modus) – Anzeige läuft trotzdem weiter.
  }
}

function getPlayerName(playerIndex) {
  return playerNames[playerIndex] || `Player ${playerIndex + 1}`;
}

// Verlauf zuletzt genutzter Spielernamen (geräteweit, nicht pro Spieler-Slot
// – dieselbe Runde sitzt meist nicht immer auf denselben Plätzen). Neuester
// Eintrag zuerst, doppelte werden nach vorne verschoben statt verdoppelt.
function loadNameHistory() {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}.nameHistory`);
    const parsed = raw && JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((name) => typeof name === 'string' && name.trim())
        .slice(0, NAME_HISTORY_LIMIT);
    }
  } catch {
    // ignoriert, leerer Verlauf.
  }
  return [];
}

function saveNameHistory(nameHistory) {
  try {
    localStorage.setItem(`${STORAGE_KEY}.nameHistory`, JSON.stringify(nameHistory));
  } catch {
    // Speicher voll oder gesperrt – Verlauf bleibt nur für diese Sitzung erhalten.
  }
}

function pushNameHistory(name) {
  nameHistory = [name, ...nameHistory.filter((existing) => existing !== name)].slice(
    0,
    NAME_HISTORY_LIMIT,
  );
  saveNameHistory(nameHistory);
}

// Namen landen über innerHTML in der Spieler-Summen-Zeile und im
// Namensverlauf-Dropdown – deshalb escapen, bevor sie dort eingesetzt werden.
function escapeHtml(value) {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
}

// Welche Kategorien eingeklappt sind (Liste von Typ-Schlüsseln).
function loadCollapsedTypes() {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}.collapsedTypes`);
    const parsed = raw && JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((key) => TYPES.some((type) => type.key === key));
    }
  } catch {
    // ignoriert, nichts eingeklappt als Standard.
  }
  return [];
}

function saveCollapsedTypes(collapsedTypes) {
  try {
    localStorage.setItem(`${STORAGE_KEY}.collapsedTypes`, JSON.stringify(collapsedTypes));
  } catch {
    // Speicher voll oder gesperrt (z. B. privater Modus) – Anzeige läuft trotzdem weiter.
  }
}

// Ob ein seltener genutzter Typ (Planeswalker, Battles) überhaupt angezeigt
// wird – eigene Checkbox pro Typ im Menü (siehe #typeVisibilitySetting),
// nicht mehr ein gemeinsamer Schalter für beide. Startet aus, da die meisten
// Runden sie nicht brauchen.
function loadOptionalTypeVisibility() {
  let parsed = null;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}.optionalTypeVisibility`);
    parsed = raw && JSON.parse(raw);
  } catch {
    // ignoriert, alle optionalen Typen starten unten als "aus".
  }
  const visibility = {};
  for (const type of TYPES) {
    if (type.optional) visibility[type.key] = !!(parsed && parsed[type.key]);
  }
  return visibility;
}

function saveOptionalTypeVisibility(visibility) {
  try {
    localStorage.setItem(`${STORAGE_KEY}.optionalTypeVisibility`, JSON.stringify(visibility));
  } catch {
    // Speicher voll oder gesperrt (z. B. privater Modus) – Anzeige läuft trotzdem weiter.
  }
}

// Ob der "Combo Types"-Abschnitt eingeklappt ist. Startet eingeklappt, da es
// sich um Zusatzkategorien handelt, die die meisten Runden nicht brauchen.
function loadComboTypesCollapsed() {
  try {
    return localStorage.getItem(`${STORAGE_KEY}.comboTypesCollapsed`) !== 'false';
  } catch {
    return true;
  }
}

function saveComboTypesCollapsed(collapsed) {
  try {
    localStorage.setItem(`${STORAGE_KEY}.comboTypesCollapsed`, String(collapsed));
  } catch {
    // Speicher voll oder gesperrt (z. B. privater Modus) – Anzeige läuft trotzdem weiter.
  }
}

// Welche einzelnen Kombo-Karten innerhalb von "Combo Types" eingeklappt sind
// (Liste von Kombo-Schlüsseln) – analog zu loadCollapsedTypes für die
// normalen Kategorien.
function loadCollapsedCombos() {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}.collapsedCombos`);
    const parsed = raw && JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((key) => COMBOS.some((combo) => combo.key === key));
    }
  } catch {
    // ignoriert, nichts eingeklappt als Standard.
  }
  return [];
}

function saveCollapsedCombos(collapsedCombos) {
  try {
    localStorage.setItem(`${STORAGE_KEY}.collapsedCombos`, JSON.stringify(collapsedCombos));
  } catch {
    // Speicher voll oder gesperrt (z. B. privater Modus) – Anzeige läuft trotzdem weiter.
  }
}

function typeIcon(typeKey) {
  return TYPES.find((type) => type.key === typeKey).icon;
}

let counts = loadCounts();
let comboCounts = loadComboCounts();
let cardCounts = loadCardCounts();
let activePlayers = loadActivePlayers();
let playerNames = loadPlayerNames();
let nameHistory = loadNameHistory();
let collapsedTypes = loadCollapsedTypes();
let collapsedCombos = loadCollapsedCombos();
let comboTypesCollapsed = loadComboTypesCollapsed();
let optionalTypeVisibility = loadOptionalTypeVisibility();
let wakeLock = null;
let wakeLockWanted = false;

// ---------- Aufbau der Kopfleiste (Typ-Übersichtspanel) ----------

const typePanel = document.getElementById('typePanel');
const totalAllEl = document.getElementById('totalAll');
const totalHexTypeCount = document.getElementById('totalHexTypeCount');
const playerTotalsEl = document.getElementById('playerTotals');

for (const type of TYPES) {
  const col = document.createElement('div');
  col.className = 'type-panel__col';
  col.dataset.type = type.key;
  if (type.optional) col.hidden = !optionalTypeVisibility[type.key]; // render() hält das mit der Checkbox synchron.
  col.innerHTML = `
    <img src="${type.icon}" alt="" />
    <span data-total-for="${type.key}">0</span>
  `;
  typePanel.appendChild(col);
}

// ---------- Aufbau des Boards ----------

const board = document.getElementById('board');

// Baut eine normale Kategorie-Sektion (Überschrift mit Klapp-/Langdruck-Logik
// + eine Karte pro Spieler). Wird für alle TYPES verwendet – auch für die
// selteneren `optional`-Typen (Planeswalker, Battles), die sich optisch und
// funktional nicht von den übrigen unterscheiden, nur standardmäßig
// ausgeblendet sind (siehe optionalTypeVisibility).
function buildTypeSection(type) {
  const section = document.createElement('section');
  section.className = 'type-section';
  section.dataset.type = type.key;
  if (collapsedTypes.includes(type.key)) section.classList.add('type-section--collapsed');
  section.innerHTML = `
    <h2 class="type-section__heading">
      <img src="${type.icon}" alt="" />
      <span class="type-section__label">${type.label}</span>
      <svg class="type-section__chevron" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </h2>
    <div class="type-section__row">
      ${Array.from(
        { length: MAX_PLAYERS },
        (_, playerIndex) => `
        <div class="counter-card counter-card--player-${playerIndex + 1}" data-player="${playerIndex}">
          <img class="counter-card__type-icon" src="${type.icon}" alt="" />
          <button
            class="counter-card__zone counter-card__zone--inc"
            type="button"
            data-action="inc"
            data-type="${type.key}"
            data-player="${playerIndex}"
            aria-label="Increase ${type.label} for Player ${playerIndex + 1}. Hold for steps of 5."
          >
            <img class="counter-card__hint" src="icons/ui/plus.png" alt="" />
          </button>
          <div class="counter-card__value" data-value-for="${type.key}-${playerIndex}">0</div>
          <button
            class="counter-card__zone counter-card__zone--dec"
            type="button"
            data-action="dec"
            data-type="${type.key}"
            data-player="${playerIndex}"
            aria-label="Decrease ${type.label} for Player ${playerIndex + 1}. Hold for steps of 5."
          >
            <img class="counter-card__hint" src="icons/ui/minus.png" alt="" />
          </button>
        </div>
      `,
      ).join('')}
    </div>
  `;
  return section;
}

// Baut eine Kombo-Sektion innerhalb von "Combo Types": Überschrift mit
// eigenem Klapp-Chevron (aber ohne Langdruck-Reset, da ein Reset für eine
// einzelne Kombo bisher nicht vorgesehen ist) + eine Karte pro Spieler mit
// eigenem Zahlen-Overlay wie bei normalen Kategorien (siehe comboCounts).
function buildComboSection(combo) {
  const section = document.createElement('div');
  section.className = 'combo-section';
  section.dataset.combo = combo.key;
  if (collapsedCombos.includes(combo.key)) section.classList.add('combo-section--collapsed');
  section.innerHTML = `
    <h3 class="combo-section__heading">
      <span class="combo-section__icons">
        ${combo.types.map((typeKey) => `<img src="${typeIcon(typeKey)}" alt="" />`).join('')}
      </span>
      <span class="combo-section__label">${combo.label}</span>
      <svg class="type-section__chevron" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </h3>
    <div class="type-section__row">
      ${Array.from(
        { length: MAX_PLAYERS },
        (_, playerIndex) => `
        <div class="counter-card counter-card--player-${playerIndex + 1}" data-player="${playerIndex}">
          <span class="counter-card__combo-icons">
            ${combo.types.map((typeKey) => `<img src="${typeIcon(typeKey)}" alt="" />`).join('')}
          </span>
          <button
            class="counter-card__zone counter-card__zone--inc"
            type="button"
            data-action="inc"
            data-combo="${combo.key}"
            data-player="${playerIndex}"
            aria-label="Increase ${combo.label} for Player ${playerIndex + 1}. Hold for steps of 5."
          >
            <img class="counter-card__hint" src="icons/ui/plus.png" alt="" />
          </button>
          <div class="counter-card__value" data-value-for="${combo.key}-${playerIndex}">0</div>
          <button
            class="counter-card__zone counter-card__zone--dec"
            type="button"
            data-action="dec"
            data-combo="${combo.key}"
            data-player="${playerIndex}"
            aria-label="Decrease ${combo.label} for Player ${playerIndex + 1}. Hold for steps of 5."
          >
            <img class="counter-card__hint" src="icons/ui/minus.png" alt="" />
          </button>
        </div>
      `,
      ).join('')}
    </div>
  `;
  return section;
}

// Baut einen einklappbaren Oberkategorie-Block (Divider + Überschrift mit
// Akkordeon-Chevron + Inhalt) – aktuell nur für "Combo Types" unterhalb der
// normalen Kategorien verwendet.
function buildTypeGroup(label, collapsed, onToggle, children) {
  const section = document.createElement('section');
  section.className = 'type-group';
  if (collapsed) section.classList.add('type-group--collapsed');
  section.innerHTML = `
    <div class="type-group__divider"></div>
    <h2 class="type-group__heading">
      <span>${label}</span>
      <svg class="type-section__chevron" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </h2>
    <div class="type-group__body"></div>
  `;
  const body = section.querySelector('.type-group__body');
  children.forEach((child) => body.appendChild(child));

  // Die Oberkategorie bleibt auch im gefilterten Zustand ganz normal
  // ein-/ausklappbar (anders als die einzelnen Kategorien/Kombos darin,
  // siehe die Klick-Handler weiter unten) – beim Fokussieren eines Spielers
  // wird sie nur einmalig automatisch aufgeklappt (siehe toggleSelectedPlayer).
  const heading = section.querySelector('.type-group__heading');
  heading.addEventListener('click', () => {
    const nowCollapsed = !section.classList.contains('type-group--collapsed');
    onToggle(nowCollapsed);
    section.classList.toggle('type-group--collapsed', nowCollapsed);
  });

  return section;
}

// Alle Typen landen als gleichwertige, normale Kategorie-Sektionen direkt im
// Board (auch die selteneren `optional`-Typen, siehe optionalTypeVisibility
// weiter unten) – kein eigenes Akkordeon mehr dafür.
for (const type of TYPES) {
  const section = buildTypeSection(type);
  if (type.optional) section.hidden = !optionalTypeVisibility[type.key];
  board.appendChild(section);
}

board.appendChild(
  buildTypeGroup(
    'Combo Types',
    comboTypesCollapsed,
    (nowCollapsed) => {
      comboTypesCollapsed = nowCollapsed;
      saveComboTypesCollapsed(comboTypesCollapsed);
    },
    COMBOS.map(buildComboSection),
  ),
);

// Einzelnes Ein-/Ausklappen einer Kombo-Karte innerhalb von "Combo Types"
// (unabhängig vom äußeren Akkordeon) – analog zum Klick auf eine normale
// Kategorie-Überschrift weiter unten, nur ohne Langdruck-Reset. Im
// gefilterten Zustand (ein Spieler ausgewählt) bewusst deaktiviert: dort soll
// nur noch die Oberkategorie selbst einklappbar sein, damit beim Fokussieren
// nichts versehentlich aus dem dichten Raster verschwindet.
board.addEventListener('click', (event) => {
  if (selectedPlayer !== null) return;
  const heading = event.target.closest('.combo-section__heading');
  if (!heading) return;
  const section = heading.closest('.combo-section');
  const comboKey = section.dataset.combo;
  const isCollapsed = collapsedCombos.includes(comboKey);
  collapsedCombos = isCollapsed
    ? collapsedCombos.filter((key) => key !== comboKey)
    : [...collapsedCombos, comboKey];
  saveCollapsedCombos(collapsedCombos);
  section.classList.toggle('combo-section--collapsed', !isCollapsed);
});

// ---------- Rendering ----------

// `selectedPlayer` filtert das komplette Board (und die zusammengefassten
// Zahlen oben) auf genau einen Spieler – praktisch zum zügigen Massenzählen
// für eine Person, ohne die Zählerkarten der anderen im Weg zu haben. `null`
// bedeutet "alle Spieler" (Normalzustand). Siehe Klick-Handler auf
// playerTotalsEl weiter unten zum Auswählen/Abwählen.
let selectedPlayer = null;

// Die COMBOS, die einen bestimmten Basis-Typ referenzieren – z. B. zählen
// "Artifact Creature" und "Artifact Land" beide zu "Artifacts" dazu.
// Vorberechnet statt bei jedem Aufruf neu gefiltert, da das in render() pro
// Spieler und Typ läuft.
const COMBOS_BY_TYPE = new Map(
  TYPES.map((type) => [type.key, COMBOS.filter((combo) => combo.types.includes(type.key))]),
);

// Gesamtzahl eines Basis-Typs für einen Spieler: eigener Zählerstand plus
// alle Kombos, die ihn referenzieren – eine Artifact Creature ist ja
// weiterhin auch ein Artifact, auch wenn sie einen eigenen Zählerstand hat
// (siehe COMBOS oben) statt den Artifacts-Zählerstand direkt zu verändern.
function typeTotalForPlayer(typeKey, playerIndex) {
  const comboTotal = COMBOS_BY_TYPE.get(typeKey).reduce(
    (sum, combo) => sum + comboCounts[combo.key][playerIndex],
    0,
  );
  return counts[typeKey][playerIndex] + comboTotal;
}

function typeTotalAllPlayers(typeKey) {
  let sum = 0;
  for (let playerIndex = 0; playerIndex < MAX_PLAYERS; playerIndex += 1) {
    sum += typeTotalForPlayer(typeKey, playerIndex);
  }
  return sum;
}

// Wie viele unterschiedliche Kartentypen gerade überhaupt vorkommen (> 0,
// inklusive Beitrag aus Kombos) – bei gefiltertem Board nur für den
// ausgewählten Spieler, sonst über alle. Gemeinsam genutzt vom dezenten
// Badge am Sechseck (render()) und der Vollbildübersicht
// (openCategoryOverview()).
function countDistinctTypes() {
  return TYPES.filter((type) =>
    selectedPlayer === null
      ? typeTotalAllPlayers(type.key) > 0
      : typeTotalForPlayer(type.key, selectedPlayer) > 0,
  ).length;
}

function render() {
  let visibleColumnCount = 0;
  for (const type of TYPES) {
    const typeCounts = counts[type.key];
    // Bei gefiltertem Board zeigt die Kopfleiste nur den Wert des
    // ausgewählten Spielers statt der Summe aller Spieler. Enthält den
    // Beitrag aus Kombos (siehe typeTotalForPlayer) – "Artifacts" zählt also
    // auch Artifact Creatures/Artifact Land mit.
    const typeTotal =
      selectedPlayer === null ? typeTotalAllPlayers(type.key) : typeTotalForPlayer(type.key, selectedPlayer);

    document.querySelector(`[data-total-for="${type.key}"]`).textContent = typeTotal;
    // Seltene Typen (Planeswalker, Battles) bleiben in der Kopfleisten-
    // Übersicht verborgen, bis ihre jeweils eigene Checkbox im Menü sie
    // einblendet (siehe optionalTypeVisibility).
    const col = typePanel.querySelector(`.type-panel__col[data-type="${type.key}"]`);
    if (type.optional) col.hidden = !optionalTypeVisibility[type.key];
    if (!col.hidden) visibleColumnCount += 1;

    for (let playerIndex = 0; playerIndex < MAX_PLAYERS; playerIndex += 1) {
      // Die eigene Karte dieser Kategorie zeigt bewusst nur ihren eigenen
      // Basis-Zählerstand, nicht den Kombo-Beitrag – nur die Summen oben
      // (Kopfleiste/Vollbildübersicht, siehe typeTotal) zählen Kombos mit.
      const value = typeCounts[playerIndex];
      const name = getPlayerName(playerIndex);
      document.querySelector(`[data-value-for="${type.key}-${playerIndex}"]`).textContent = value;

      const incBtn = document.querySelector(
        `[data-action="inc"][data-type="${type.key}"][data-player="${playerIndex}"]`,
      );
      const decBtn = document.querySelector(
        `[data-action="dec"][data-type="${type.key}"][data-player="${playerIndex}"]`,
      );
      incBtn.setAttribute(
        'aria-label',
        `Increase ${type.label} for ${name}. Hold for steps of 5.`,
      );
      decBtn.setAttribute(
        'aria-label',
        `Decrease ${type.label} for ${name}. Hold for steps of 5.`,
      );
      decBtn.disabled = value <= 0;

      const card = decBtn.closest('.counter-card');
      card.hidden = selectedPlayer === null ? !activePlayers[playerIndex] : playerIndex !== selectedPlayer;
    }
  }

  // Gefiltertes Board: dichteres mehrspaltiges Raster statt der sonst
  // vollbreiten Kategorie-Stapel (siehe style.css). Das einmalige Aufklappen
  // von "Combo Types" passiert nur beim Fokussieren selbst (siehe
  // toggleSelectedPlayer) – die Gruppe bleibt ansonsten ganz normal
  // einklappbar, auch während gefiltert wird.
  board.classList.toggle('board--filtered', selectedPlayer !== null);

  document.documentElement.style.setProperty('--type-panel-columns', String(visibleColumnCount));

  // Gesamtzahl kommt aus `cardCounts` (physische Karten), nicht aus der
  // Summe der Kategorien – eine Kombo-Karte darf hier nur einmal zählen.
  const grandTotal = selectedPlayer === null ? cardCounts.reduce((sum, value) => sum + value, 0) : cardCounts[selectedPlayer];
  totalAllEl.textContent = grandTotal;

  // Dezentes Badge am Sechseck: wie viele unterschiedliche Kartentypen gerade
  // im Spiel sind, ohne dafür erst die Vollbildübersicht öffnen zu müssen.
  const distinctTypeCount = countDistinctTypes();
  totalHexTypeCount.textContent = distinctTypeCount;
  totalHexTypeCount.hidden = distinctTypeCount === 0;

  const activeCount = activePlayers.filter(Boolean).length;
  // --player-count steuert nur die Spieler-Summen-Zeile (zeigt immer alle
  // aktiven Spieler); --counter-columns steuert die Zählerkarten-Reihen und
  // kollabiert auf 1 Spalte, solange das Board gefiltert ist.
  document.documentElement.style.setProperty('--player-count', String(activeCount));
  document.documentElement.style.setProperty(
    '--counter-columns',
    String(selectedPlayer === null ? activeCount : 1),
  );
  playerTotalsEl.innerHTML = cardCounts
    .map((total, playerIndex) => ({ total, playerIndex }))
    .filter(({ playerIndex }) => activePlayers[playerIndex])
    .map(({ total, playerIndex }) => renderPlayerBadge(playerIndex, total))
    .join('');

  // Namensfelder im Menü nachziehen – außer man tippt gerade selbst darin.
  nameInputs.forEach((input, playerIndex) => {
    if (document.activeElement === input) return;
    input.value = playerNames[playerIndex] || '';
    const clearBtn = input.parentElement.querySelector('.name-field__clear');
    if (clearBtn) clearBtn.hidden = !input.value;
  });

  renderCombos();
  updateBoardPlayerReset();
}

// Kombo-Karten haben einen eigenen Zählerstand (siehe comboCounts) – genau
// wie render() für TYPES, nur ohne Kopfleisten-Spalte und ohne Beitrag von
// anderswo (eine Kombo wird von nichts anderem referenziert).
function renderCombos() {
  for (const combo of COMBOS) {
    for (let playerIndex = 0; playerIndex < MAX_PLAYERS; playerIndex += 1) {
      const value = comboCounts[combo.key][playerIndex];
      const name = getPlayerName(playerIndex);
      document.querySelector(`[data-value-for="${combo.key}-${playerIndex}"]`).textContent = value;

      const incBtn = document.querySelector(
        `[data-action="inc"][data-combo="${combo.key}"][data-player="${playerIndex}"]`,
      );
      const decBtn = document.querySelector(
        `[data-action="dec"][data-combo="${combo.key}"][data-player="${playerIndex}"]`,
      );
      incBtn.setAttribute('aria-label', `Increase ${combo.label} for ${name}. Hold for steps of 5.`);
      decBtn.setAttribute('aria-label', `Decrease ${combo.label} for ${name}. Hold for steps of 5.`);
      decBtn.disabled = value <= 0;

      const card = decBtn.closest('.counter-card');
      card.hidden = selectedPlayer === null ? !activePlayers[playerIndex] : playerIndex !== selectedPlayer;
    }
  }
}

// ---------- Interaktion ----------
// Die Plus-/Minus-Zonen sind wie bei der App "Lotus" keine sichtbaren Knöpfe,
// sondern nehmen die obere bzw. untere Hälfte der Karte ein. Kurzes Antippen
// zählt um 1, gedrückt halten springt in Fünferschritten (siehe HOLD_*-Konstanten).

function vibrate(pattern = 15) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// Schwebende "+1"/"+5"-Anzeige über der Karte als kurzes Tipp-Feedback.
// Mehrere schnelle Tipps auf dieselbe Karte sammeln sich in einer einzigen
// Anzeige (statt mehrerer überlappender), die erst nach einer kurzen Pause
// nach oben wegfadet.
const POPUP_SETTLE_MS = 550;
const tapPopups = new Map(); // "typKey-oder-komboKey-playerIndex" -> { el, total, settleTimer, removeTimer }

// `key` ist entweder ein Typ- oder ein Kombo-Schlüssel – beide Namensräume
// überschneiden sich nie (siehe TYPES/COMBOS oben), daher reicht ein simples
// Nacheinander-Probieren statt eines zusätzlichen Parameters.
function getCardEl(key, playerIndex) {
  return (
    board.querySelector(`.type-section[data-type="${key}"] .counter-card[data-player="${playerIndex}"]`) ||
    board.querySelector(`.combo-section[data-combo="${key}"] .counter-card[data-player="${playerIndex}"]`)
  );
}

function showChangePopup(key, playerIndex, delta) {
  const card = getCardEl(key, playerIndex);
  if (!card) return;
  const popupKey = `${key}-${playerIndex}`;
  let popup = tapPopups.get(popupKey);

  if (popup) {
    clearTimeout(popup.settleTimer);
    clearTimeout(popup.removeTimer);
    popup.total += delta;
    popup.el.classList.remove('counter-card__pop--leaving');
  } else {
    const el = document.createElement('div');
    el.className = 'counter-card__pop';
    card.appendChild(el);
    popup = { el, total: delta };
    tapPopups.set(popupKey, popup);
  }

  popup.el.textContent = popup.total > 0 ? `+${popup.total}` : `${popup.total}`;

  popup.settleTimer = setTimeout(() => {
    popup.el.classList.add('counter-card__pop--leaving');
    popup.removeTimer = setTimeout(() => {
      popup.el.remove();
      tapPopups.delete(popupKey);
    }, 500);
  }, POPUP_SETTLE_MS);
}

// Wendet eine Änderung an einem Basis-Typ an und meldet zurück, ob sich der
// Wert wirklich geändert hat (z. B. kein Effekt, wenn bereits am oberen/
// unteren Limit). Rührt nie an comboCounts – ein Tipp hier betrifft
// ausschließlich den eigenen Zählerstand dieses Typs.
function applyChange(typeKey, playerIndex, delta) {
  const current = counts[typeKey][playerIndex];
  const next = Math.max(0, Math.min(MAX_COUNT, current + delta));
  if (next === current) return false;
  counts[typeKey][playerIndex] = next;
  saveCounts(counts);
  render();
  showChangePopup(typeKey, playerIndex, delta);
  return true;
}

// Gleiches Prinzip wie applyChange, nur für den eigenen Zählerstand einer
// Kombo (siehe comboCounts) – rührt umgekehrt nie an den Basis-Typen.
function applyComboChange(comboKey, playerIndex, delta) {
  const current = comboCounts[comboKey][playerIndex];
  const next = Math.max(0, Math.min(MAX_COUNT, current + delta));
  if (next === current) return false;
  comboCounts[comboKey][playerIndex] = next;
  saveComboCounts(comboCounts);
  render();
  showChangePopup(comboKey, playerIndex, delta);
  return true;
}

// Liest Typ bzw. Kombo aus einer +/- -Zone und wendet die Änderung auf genau
// einen Zählerstand an (Basis-Typ oder Kombo, nie beide).
function applyFromButton(btn, delta) {
  const { type: typeKey, combo: comboKey, player } = btn.dataset;
  const playerIndex = Number(player);
  const changed = comboKey
    ? applyComboChange(comboKey, playerIndex, delta)
    : applyChange(typeKey, playerIndex, delta);

  // Jeder Tipp (Typ oder Kombo) entspricht genau einer physischen Karte, die
  // dazukommt/verschwindet – die Gesamtzahl bewegt sich deshalb immer exakt
  // um `delta`, unabhängig davon, ob ein Basis-Typ oder eine Kombo getroffen
  // wurde.
  if (changed) {
    const current = cardCounts[playerIndex];
    cardCounts[playerIndex] = Math.max(0, Math.min(MAX_COUNT, current + delta));
    saveCardCounts(cardCounts);
    render();
  }
  return changed;
}

// Die Plus-/Minus-Zonen bedecken die komplette Karte (obere/untere Hälfte),
// es gibt also keine eigene "Kartenfläche" dahinter, die Klicks abbekäme.
// Wisch-Gesten funktionieren auf dem Handy nicht zuverlässig, weil dieselbe
// Bewegung zum Scrollen der Seite gedacht ist – Langdruck (Fünferschritte)
// bleibt deshalb die einzige Geste direkt an den Zonen.
const activeHolds = new Map(); // pointerId -> { btn, sign, triggeredBig, moved, startX, startY, timeoutId, intervalId }

// Ab dieser Bewegung (in Pixeln) gilt ein Tipp als Scroll-Versuch statt als
// Antippen – verhindert, dass ein Finger, der beim Scrollen über eine
// Plus-/Minus-Zone streift, versehentlich einen Zähler verändert.
const TAP_MOVE_CANCEL_PX = 10;

function handleZonePointerDown(event) {
  const btn = event.target.closest('button[data-action]');
  if (!btn || btn.disabled) return;
  btn.setPointerCapture(event.pointerId);

  const sign = btn.dataset.action === 'inc' ? 1 : -1;
  const hold = {
    btn,
    sign,
    triggeredBig: false,
    moved: false,
    startX: event.clientX,
    startY: event.clientY,
    timeoutId: null,
    intervalId: null,
  };

  hold.timeoutId = setTimeout(() => {
    hold.triggeredBig = true;
    if (applyFromButton(btn, sign * HOLD_STEP)) vibrate([20, 30, 20]);
    hold.intervalId = setInterval(() => {
      if (applyFromButton(btn, sign * HOLD_STEP)) vibrate([20, 30, 20]);
    }, HOLD_REPEAT_MS);
  }, HOLD_DELAY_MS);

  activeHolds.set(event.pointerId, hold);
}

function handleZonePointerMove(event) {
  const hold = activeHolds.get(event.pointerId);
  if (!hold || hold.moved || hold.triggeredBig) return;
  const dx = event.clientX - hold.startX;
  const dy = event.clientY - hold.startY;
  if (Math.hypot(dx, dy) > TAP_MOVE_CANCEL_PX) {
    hold.moved = true;
    clearTimeout(hold.timeoutId);
  }
}

function endHold(event) {
  const hold = activeHolds.get(event.pointerId);
  if (!hold) return;
  clearTimeout(hold.timeoutId);
  clearInterval(hold.intervalId);
  activeHolds.delete(event.pointerId);

  // Nur bei echtem, kurzem Antippen ohne nennenswerte Bewegung (kein Scroll,
  // kein Fünferschritt ausgelöst) den Einzelschritt anwenden. Bewusst ohne
  // Vibration – bei normalem Zählen (viele kurze Tipps hintereinander) wurde
  // das leichte Dauer-Vibrieren als störend empfunden; das schwebende
  // +1/+5-Feedback (showChangePopup) reicht hier.
  if (!hold.triggeredBig && !hold.moved) {
    applyFromButton(hold.btn, hold.sign);
  }
}

// pointercancel bedeutet, der Browser hat die Geste übernommen (i. d. R. weil
// daraus ein Scroll wurde) – hier darf NIE ein Zähler verändert werden, auch
// nicht wenn bis dahin keine Bewegung über der Schwelle gemessen wurde.
function cancelHold(event) {
  const hold = activeHolds.get(event.pointerId);
  if (!hold) return;
  clearTimeout(hold.timeoutId);
  clearInterval(hold.intervalId);
  activeHolds.delete(event.pointerId);
}

// Tastatur-Bedienung (Enter/Leertaste): einfacher Einzelschritt, unabhängig
// von der Pointer-Logik oben (Tastatur löst keine Pointer-Events aus).
function handleZoneKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const btn = event.target.closest('button[data-action]');
  if (!btn || btn.disabled) return;
  event.preventDefault();
  applyFromButton(btn, btn.dataset.action === 'inc' ? 1 : -1);
}

board.addEventListener('pointerdown', handleZonePointerDown);
board.addEventListener('pointermove', handleZonePointerMove);
board.addEventListener('pointerup', endHold);
board.addEventListener('pointercancel', cancelHold);
board.addEventListener('keydown', handleZoneKeydown);

// Gedrückt-Halten-Basis: ruft `callback` nach `delay` ms auf, sofern der
// Pointer bis dahin nicht angehoben/abgebrochen wurde.
function onLongPress(target, callback, delay = 650) {
  let timer = setTimeout(() => {
    timer = null;
    cleanup();
    callback();
  }, delay);
  function cleanup() {
    clearTimeout(timer);
    timer = null;
    target.removeEventListener('pointerup', cleanup);
    target.removeEventListener('pointercancel', cleanup);
    target.removeEventListener('pointerleave', cleanup);
  }
  target.addEventListener('pointerup', cleanup, { once: true });
  target.addEventListener('pointercancel', cleanup, { once: true });
  target.addEventListener('pointerleave', cleanup, { once: true });
}

// Langdruck auf die Kategorie-Überschrift setzt die ganze Kategorie über
// alle Spieler zurück (mit Rückgängig-Option im Toast). Ein kurzer Tipp
// klappt die Kategorie stattdessen ein/aus (siehe headingLongPressFired
// weiter unten, damit ein Langdruck nicht zusätzlich noch einklappt).
let headingLongPressFired = false;

board.addEventListener('pointerdown', (event) => {
  const heading = event.target.closest('.type-section__heading');
  if (!heading) return;
  const section = heading.closest('.type-section');
  const typeKey = section.dataset.type;
  onLongPress(heading, () => {
    headingLongPressFired = true;
    const previous = counts[typeKey].slice();
    if (!previous.some((value) => value > 0)) return;
    counts[typeKey] = Array(MAX_PLAYERS).fill(0);
    saveCounts(counts);
    render();
    vibrate([20, 30, 20]);
    showToast(
      `${section.querySelector('.type-section__label').textContent} reset`,
      () => {
        counts[typeKey] = previous;
        saveCounts(counts);
        render();
      },
    );
  });
});

// Im gefilterten Zustand bewusst deaktiviert (siehe Kommentar beim Kombo-
// Pendant weiter oben) – nur die Oberkategorie bleibt dort einklappbar. Der
// headingLongPressFired-Check muss aber in jedem Fall zuerst laufen, sonst
// bliebe das Flag nach einem Langdruck im gefilterten Zustand hängen und
// würde den nächsten normalen Klick nach dem Verlassen des Filters
// fälschlich verschlucken.
board.addEventListener('click', (event) => {
  const heading = event.target.closest('.type-section__heading');
  if (!heading) return;
  if (headingLongPressFired) {
    headingLongPressFired = false;
    return;
  }
  if (selectedPlayer !== null) return;
  const section = heading.closest('.type-section');
  const typeKey = section.dataset.type;
  const isCollapsed = collapsedTypes.includes(typeKey);
  collapsedTypes = isCollapsed
    ? collapsedTypes.filter((key) => key !== typeKey)
    : [...collapsedTypes, typeKey];
  saveCollapsedTypes(collapsedTypes);
  section.classList.toggle('type-section--collapsed', !isCollapsed);
});

// Klick auf eine Spieler-Summe filtert das Board auf genau diesen Spieler
// (siehe `selectedPlayer`); nochmal antippen zeigt wieder alle. Langdruck
// setzt stattdessen diesen Spieler zurück (mit Rückgängig-Option im Toast) –
// dieselbe Geste wie der Langdruck auf eine Kategorie-Überschrift weiter
// oben. Umbenennen läuft separat über die Namensfelder im Hamburger-Menü.
function renderPlayerBadge(playerIndex, total) {
  const isSelected = selectedPlayer === playerIndex;
  const name = escapeHtml(getPlayerName(playerIndex));
  // Die Zahl neben dem Namen ist für den gerade fokussierten Spieler
  // redundant – dessen Gesamtzahl steht ja schon groß im Sechseck oben
  // (siehe render()). Für alle anderen Spieler bleibt sie stehen.
  return `
    <span
      class="player-badge${isSelected ? ' player-badge--selected' : ''}"
      data-player="${playerIndex}"
      role="button"
      tabindex="0"
      aria-pressed="${isSelected}"
      aria-label="${isSelected ? `Showing only ${name} – tap to show all players. Hold to reset.` : `Show only ${name}. Hold to reset.`}"
    >
      <b>${name}</b><strong${isSelected ? ' hidden' : ''}>${total}</strong>
    </span>
  `;
}

// Setzt alle Zählerstände (inkl. Gesamtkarten-Zahl) eines Spielers zurück,
// mit Rückgängig-Option im Toast. Aufrufbar per Langdruck auf dessen Summe
// oder über den "Reset player"-Button im gefilterten Board (siehe unten).
function resetPlayer(playerIndex) {
  const previousTypes = TYPES.map((type) => counts[type.key][playerIndex]);
  const previousCombos = COMBOS.map((combo) => comboCounts[combo.key][playerIndex]);
  const previousCardCount = cardCounts[playerIndex];
  const name = getPlayerName(playerIndex);
  const hasAnything =
    previousTypes.some((value) => value > 0) ||
    previousCombos.some((value) => value > 0) ||
    previousCardCount > 0;
  if (!hasAnything) return;
  TYPES.forEach((type) => {
    counts[type.key][playerIndex] = 0;
  });
  COMBOS.forEach((combo) => {
    comboCounts[combo.key][playerIndex] = 0;
  });
  cardCounts[playerIndex] = 0;
  saveCounts(counts);
  saveComboCounts(comboCounts);
  saveCardCounts(cardCounts);
  render();
  vibrate([20, 30, 20]);
  showToast(`${name} reset`, () => {
    TYPES.forEach((type, i) => {
      counts[type.key][playerIndex] = previousTypes[i];
    });
    COMBOS.forEach((combo, i) => {
      comboCounts[combo.key][playerIndex] = previousCombos[i];
    });
    cardCounts[playerIndex] = previousCardCount;
    saveCounts(counts);
    saveComboCounts(comboCounts);
    saveCardCounts(cardCounts);
    render();
  });
}

// Klappt beim Fokussieren eines Spielers einmalig wirklich alles auf ("Combo
// Types" + jede einzelne Kategorie/Kombo darin), damit im dichten gefilterten
// Raster von Anfang an nichts fehlt – einzelne Kategorien lassen sich
// währenddessen ohnehin nicht mehr einklappen (siehe Klick-Handler oben),
// nur "Combo Types" selbst bleibt danach normal bedienbar.
function expandAllForFocus() {
  if (comboTypesCollapsed) {
    comboTypesCollapsed = false;
    saveComboTypesCollapsed(false);
  }
  if (collapsedTypes.length) {
    collapsedTypes = [];
    saveCollapsedTypes(collapsedTypes);
  }
  if (collapsedCombos.length) {
    collapsedCombos = [];
    saveCollapsedCombos(collapsedCombos);
  }
  board
    .querySelectorAll('.type-group--collapsed, .type-section--collapsed, .combo-section--collapsed')
    .forEach((el) => {
      el.classList.remove('type-group--collapsed', 'type-section--collapsed', 'combo-section--collapsed');
    });
}

function toggleSelectedPlayer(playerIndex) {
  const wasShowingAll = selectedPlayer === null;
  selectedPlayer = selectedPlayer === playerIndex ? null : playerIndex;
  if (wasShowingAll && selectedPlayer !== null) expandAllForFocus();
  // Eine noch offene "Sure? Tap again"-Bestätigung darf nicht den neuen
  // (oder gar keinen) Spieler treffen, wenn sie noch vom vorherigen stammt.
  resetBoardPlayerResetConfirm();
  render();
}

// Langdruck auf eine Spieler-Summe löst resetPlayer aus; ein anschließender
// kurzer Klick (vom Loslassen des Fingers/der Maus) darf dann nicht
// zusätzlich noch die Auswahl umschalten – dieselbe Absicherung wie
// headingLongPressFired bei den Kategorie-Überschriften oben.
let playerBadgeLongPressFired = false;

playerTotalsEl.addEventListener('pointerdown', (event) => {
  const badge = event.target.closest('[data-player]');
  if (!badge) return;
  const playerIndex = Number(badge.dataset.player);
  onLongPress(badge, () => {
    playerBadgeLongPressFired = true;
    resetPlayer(playerIndex);
  });
});

playerTotalsEl.addEventListener('click', (event) => {
  if (playerBadgeLongPressFired) {
    playerBadgeLongPressFired = false;
    return;
  }
  const badge = event.target.closest('[data-player]');
  if (!badge) return;
  toggleSelectedPlayer(Number(badge.dataset.player));
});

playerTotalsEl.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const badge = event.target.closest('[data-player]');
  if (!badge) return;
  event.preventDefault();
  toggleSelectedPlayer(Number(badge.dataset.player));
});

// Einziger Reset-Zugang der App – schwebt per position: fixed über dem
// Inhalt (siehe style.css), frisst also keine Kachel, die sonst ein Zähler
// wäre. Immer sichtbar, mit kontextabhängigem Ziel: ist ein Spieler
// fokussiert, setzt er nur diesen zurück (zusätzlich zum Langdruck auf den
// Spielernamen oben, siehe playerBadgeLongPressFired – als Geste aber leicht
// zu übersehen); ohne Fokus setzt er alles zurück (es gibt dafür keinen
// Menü-Button mehr). Ein Tipp bestätigt nicht per erneutem Tipp auf denselben
// Button (fehleranfällig), sondern blendet einen expliziten grünen
// Bestätigen-Button links daneben ein, während der Reset-Button selbst zum
// roten Abbrechen-Button an derselben Stelle wird.
const boardResetControls = document.getElementById('boardResetControls');
const boardPlayerResetBtn = document.getElementById('boardPlayerResetBtn');
const boardPlayerResetConfirmBtn = document.getElementById('boardPlayerResetConfirmBtn');
const boardPlayerResetIcon = boardPlayerResetBtn.querySelector('.board-reset-btn__icon');
const boardPlayerResetCancelIcon = boardPlayerResetBtn.querySelector('.board-reset-btn__cancel-icon');
let boardPlayerResetConfirmTimer = null;

function boardResetTargetName() {
  return selectedPlayer === null ? 'everything' : getPlayerName(selectedPlayer);
}

function setBoardResetArmed(armed) {
  boardPlayerResetBtn.classList.toggle('board-player-reset--armed', armed);
  boardPlayerResetIcon.hidden = armed;
  boardPlayerResetCancelIcon.hidden = !armed;
  boardPlayerResetConfirmBtn.hidden = !armed;
  boardPlayerResetBtn.setAttribute(
    'aria-label',
    armed ? 'Cancel reset' : `Reset ${boardResetTargetName()}`,
  );
}

// Zieht das Aria-Label nach – läuft am Ende von render(), lässt aber eine
// gerade laufende Bestätigung in Ruhe, statt sie durch einen unabhängigen
// Tipp anderswo vorzeitig zurückzusetzen.
function updateBoardPlayerReset() {
  if (boardPlayerResetConfirmTimer) return;
  boardPlayerResetBtn.setAttribute('aria-label', `Reset ${boardResetTargetName()}`);
}

function resetBoardPlayerResetConfirm() {
  if (!boardPlayerResetConfirmTimer) return;
  clearTimeout(boardPlayerResetConfirmTimer);
  boardPlayerResetConfirmTimer = null;
  setBoardResetArmed(false);
}

// Tipp auf den Reset-Button: im Normalzustand löst er die Bestätigung aus,
// während der Bestätigung (jetzt der Abbrechen-Button) bricht er sie ab.
boardPlayerResetBtn.addEventListener('click', () => {
  if (boardPlayerResetConfirmTimer) {
    resetBoardPlayerResetConfirm();
    return;
  }
  const target = boardResetTargetName();
  setBoardResetArmed(true);
  showToast(`Reset ${target}?`);
  boardPlayerResetConfirmTimer = setTimeout(() => {
    boardPlayerResetConfirmTimer = null;
    setBoardResetArmed(false);
  }, 4000);
});

boardPlayerResetConfirmBtn.addEventListener('click', () => {
  if (!boardPlayerResetConfirmTimer) return;
  clearTimeout(boardPlayerResetConfirmTimer);
  boardPlayerResetConfirmTimer = null;
  setBoardResetArmed(false);
  if (selectedPlayer === null) resetEverything();
  else resetPlayer(selectedPlayer);
});

// ---------- Toast ----------

const toastEl = document.getElementById('toast');
const toastMessageEl = document.getElementById('toastMessage');
const toastUndoBtn = document.getElementById('toastUndoBtn');
let toastTimer = null;

// `undo` ist optional: wenn gesetzt, zeigt der Toast einen "Rückgängig"-
// Button und bleibt länger sichtbar, damit Zeit zum Antippen bleibt.
function showToast(message, undo) {
  clearTimeout(toastTimer);
  toastMessageEl.textContent = message;
  toastUndoBtn.hidden = !undo;
  toastUndoBtn.onclick = undo
    ? () => {
        clearTimeout(toastTimer);
        toastEl.hidden = true;
        undo();
      }
    : null;

  const duration = undo ? 4000 : 2200;
  toastEl.style.setProperty('--toast-duration', `${duration}ms`);
  toastEl.hidden = false;
  // Animation neu starten, falls der Toast noch sichtbar ist.
  toastEl.style.animation = 'none';
  // eslint-disable-next-line no-unused-expressions
  toastEl.offsetHeight;
  toastEl.style.animation = '';
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, duration);
}

// ---------- Hamburger-Menü ----------

const scrim = document.getElementById('scrim');
const sidePanel = document.getElementById('sidePanel');
const menuOpenBtn = document.getElementById('menuOpenBtn');
const menuCloseBtn = document.getElementById('menuCloseBtn');

function openMenu() {
  scrim.hidden = false;
  sidePanel.hidden = false;
  // Reflow erzwingen, damit die Öffnen-Transition greift.
  void sidePanel.offsetHeight;
  sidePanel.classList.add('is-open');
  sidePanel.setAttribute('aria-hidden', 'false');
  menuOpenBtn.setAttribute('aria-expanded', 'true');
  // Die schwebende Reset-Steuerung liegt (bewusst, damit sie beim Scrollen
  // immer erreichbar bleibt) über dem Scrim/Seitenmenü – ohne das hier würde
  // sie während des Menüs sichtbar und antippbar darüber schweben. Eine
  // gerade offene Bestätigung wird dabei verworfen, damit nicht zwei
  // unerwartete Buttons auftauchen, sobald das Menü wieder zugeht.
  resetBoardPlayerResetConfirm();
  boardResetControls.hidden = true;
}

function closeMenu() {
  sidePanel.classList.remove('is-open');
  sidePanel.setAttribute('aria-hidden', 'true');
  scrim.hidden = true;
  menuOpenBtn.setAttribute('aria-expanded', 'false');
  boardResetControls.hidden = false;
  setTimeout(() => {
    if (!sidePanel.classList.contains('is-open')) sidePanel.hidden = true;
  }, 220);
}

menuOpenBtn.addEventListener('click', openMenu);
menuCloseBtn.addEventListener('click', closeMenu);
scrim.addEventListener('click', closeMenu);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && sidePanel.classList.contains('is-open')) closeMenu();
});

// ---------- Menü: Anzahl der Spieler, Wake Lock ----------

const wakeLockBtn = document.getElementById('wakeLockBtn');
const watermarkBtn = document.getElementById('watermarkBtn');

// ---------- Icon-Wasserzeichen an/aus ----------

let watermarksEnabled = localStorage.getItem(`${STORAGE_KEY}.watermarks`) !== 'off';

function applyWatermarkSetting() {
  document.body.classList.toggle('watermarks-off', !watermarksEnabled);
  watermarkBtn.setAttribute('aria-pressed', String(watermarksEnabled));
}

applyWatermarkSetting();

watermarkBtn.addEventListener('click', () => {
  watermarksEnabled = !watermarksEnabled;
  localStorage.setItem(`${STORAGE_KEY}.watermarks`, watermarksEnabled ? 'on' : 'off');
  applyWatermarkSetting();
});

// ---------- Checkboxen "Planeswalker"/"Battles" ----------
// Zwei unabhängige Checkboxen (siehe #typeVisibilitySetting) statt eines
// gemeinsamen Schalters – blendet die jeweils eigene Kategorie überall
// ein/aus (Board-Sektion, Kopfleiste, Vollbildübersicht). Aus statt
// "verborgen bis benutzt", damit das Board standardmäßig kompakt bleibt,
// aber jederzeit bewusst erweiterbar ist.
const optionalTypeCheckboxes = document.querySelectorAll('[data-optional-type]');

// Setzt nur Checkbox-Zustand + Board-Sektion selbst – sicher auch beim
// allerersten Aufruf ganz oben beim Skriptstart (siehe weiter unten), wo
// render() noch auf später deklarierte Variablen (z. B. nameInputs)
// zugreifen würde, die zu dem Zeitpunkt noch nicht existieren.
function applyOptionalTypeVisibility() {
  optionalTypeCheckboxes.forEach((checkbox) => {
    const typeKey = checkbox.dataset.optionalType;
    checkbox.checked = !!optionalTypeVisibility[typeKey];
    board.querySelector(`.type-section[data-type="${typeKey}"]`).hidden = !checkbox.checked;
  });
}

applyOptionalTypeVisibility();

optionalTypeCheckboxes.forEach((checkbox) => {
  checkbox.addEventListener('change', () => {
    const typeKey = checkbox.dataset.optionalType;
    optionalTypeVisibility[typeKey] = checkbox.checked;
    saveOptionalTypeVisibility(optionalTypeVisibility);
    applyOptionalTypeVisibility();
    // Aktualisiert Kopfleisten-Spalte, Spaltenzahl etc. – beim Ändern immer
    // sicher, da zu dem Zeitpunkt längst alles initialisiert ist.
    render();
  });
});

const playerCountButtons = document.querySelectorAll('[data-player-count]');

// Kurzwahl im Menü: setzt die ersten `count` Spieler aktiv, alle anderen
// inaktiv. Über das Spieler-Menü einzeln entfernte Spieler kommen darüber
// zurück.
function setActivePlayers(count) {
  const clamped = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Number(count)));
  activePlayers = Array.from({ length: MAX_PLAYERS }, (_, playerIndex) => playerIndex < clamped);
  saveActivePlayers(activePlayers);
  // Der gefilterte Spieler könnte dadurch inaktiv geworden sein (sein Badge
  // verschwindet dann aus der Summen-Zeile) – ohne das bliebe das Board auf
  // einem nicht mehr erreichbaren Spieler gefiltert hängen.
  if (selectedPlayer !== null && !activePlayers[selectedPlayer]) {
    selectedPlayer = null;
    resetBoardPlayerResetConfirm();
  }
  syncPlayerCountButtons();
  render();
}

function syncPlayerCountButtons() {
  const activeCount = activePlayers.filter(Boolean).length;
  playerCountButtons.forEach((button) => {
    const isSelected = Number(button.dataset.playerCount) === activeCount;
    button.classList.toggle('is-selected', isSelected);
    button.setAttribute('aria-pressed', String(isSelected));
  });
}

playerCountButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setActivePlayers(button.dataset.playerCount);
    showToast(`${activePlayers.filter(Boolean).length} players active`);
  });
});

// ---------- Spielernamen (im Menü) ----------

// Wendet eine Umbenennung an, merkt sich den Namen im Verlauf und zeigt eine
// Rückgängig-Option im Toast.
function renamePlayer(playerIndex, rawName) {
  const previousName = playerNames[playerIndex];
  const nextName = rawName.trim().slice(0, PLAYER_NAME_MAX_LENGTH) || null;
  if (nextName === previousName) return;
  playerNames[playerIndex] = nextName;
  savePlayerNames(playerNames);
  if (nextName) pushNameHistory(nextName);
  render();
  showToast(nextName ? `Renamed to "${nextName}"` : 'Name reset', () => {
    playerNames[playerIndex] = previousName;
    savePlayerNames(playerNames);
    render();
  });
}

// Hängt ein Verlauf-Dropdown an ein Namensfeld: Öffnet/schließt sich nur über
// den Pfeil-Knopf (nicht automatisch beim Fokussieren), ein Eintrag antippen
// übernimmt den Namen (`onPick`), das kleine "×" löscht nur diesen einen
// Verlaufseintrag. Ein einziger document-Listener (unten) schließt alle vier
// Dropdowns bei Klick/Tap außerhalb.
const nameHistoryDropdowns = [];

function attachNameHistory(input, dropdown, toggleBtn, onPick) {
  nameHistoryDropdowns.push({ dropdown, toggleBtn });

  function renderHistory() {
    dropdown.innerHTML = nameHistory
      .map(
        (name, index) => `
        <div class="name-history__item" data-index="${index}">
          <button type="button" class="name-history__pick">${escapeHtml(name)}</button>
          <button type="button" class="name-history__delete" aria-label="Remove “${escapeHtml(name)}” from history">×</button>
        </div>
      `,
      )
      .join('');
    dropdown.hidden = nameHistory.length === 0;
  }

  toggleBtn.addEventListener('click', () => {
    if (!dropdown.hidden) {
      dropdown.hidden = true;
      return;
    }
    renderHistory();
    input.focus();
  });

  // mousedown statt click: feuert vor dem blur-Event des Inputs, sonst
  // schließt sich das Dropdown, bevor der Klick es erreicht.
  dropdown.addEventListener('mousedown', (event) => {
    const item = event.target.closest('.name-history__item');
    if (!item) return;
    event.preventDefault();
    const index = Number(item.dataset.index);
    if (event.target.closest('.name-history__delete')) {
      nameHistory.splice(index, 1);
      saveNameHistory(nameHistory);
      renderHistory();
      return;
    }
    if (event.target.closest('.name-history__pick')) {
      dropdown.hidden = true;
      onPick(nameHistory[index]);
    }
  });
}

document.addEventListener('pointerdown', (event) => {
  for (const { dropdown, toggleBtn } of nameHistoryDropdowns) {
    if (dropdown.hidden) continue;
    if (event.target === toggleBtn || dropdown.contains(event.target)) continue;
    dropdown.hidden = true;
  }
});

const playerNamesRows = document.getElementById('playerNamesRows');
const nameInputs = [];

for (let playerIndex = 0; playerIndex < MAX_PLAYERS; playerIndex += 1) {
  const row = document.createElement('div');
  row.className = 'name-field';
  row.innerHTML = `
    <div class="name-field__input-wrap">
      <input type="text" class="name-field__input" maxlength="${PLAYER_NAME_MAX_LENGTH}" autocomplete="off" />
      <button type="button" class="name-field__clear" aria-label="Clear name" hidden>×</button>
    </div>
    <button type="button" class="name-field__toggle" aria-label="Show name suggestions">▾</button>
    <div class="name-field__history" hidden></div>
  `;
  const input = row.querySelector('.name-field__input');
  const clearBtn = row.querySelector('.name-field__clear');
  const toggleBtn = row.querySelector('.name-field__toggle');
  const dropdown = row.querySelector('.name-field__history');
  input.value = playerNames[playerIndex] || '';
  input.placeholder = `Player ${playerIndex + 1}`;
  clearBtn.hidden = !input.value;

  attachNameHistory(input, dropdown, toggleBtn, (name) => {
    input.value = name;
    clearBtn.hidden = !input.value;
    renamePlayer(playerIndex, name);
  });
  input.addEventListener('input', () => {
    clearBtn.hidden = !input.value;
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') input.blur();
  });
  input.addEventListener('blur', () => renamePlayer(playerIndex, input.value));
  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.hidden = true;
    renamePlayer(playerIndex, '');
    input.focus();
  });

  nameInputs.push(input);
  playerNamesRows.appendChild(row);
}

// Setzt wirklich alles zurück (alle Spieler, alle Kategorien). Aufrufbar
// über den schwebenden Reset-Button im Board, wenn kein Spieler fokussiert
// ist (siehe boardPlayerResetBtn weiter oben) – es gibt dafür keinen
// eigenen Menü-Button mehr.
function resetEverything() {
  const previousCounts = {};
  TYPES.forEach((type) => {
    previousCounts[type.key] = counts[type.key].slice();
  });
  const previousComboCounts = {};
  COMBOS.forEach((combo) => {
    previousComboCounts[combo.key] = comboCounts[combo.key].slice();
  });
  const previousCardCounts = cardCounts.slice();
  counts = createEmptyCounts();
  comboCounts = createEmptyComboCounts();
  cardCounts = Array(MAX_PLAYERS).fill(0);
  saveCounts(counts);
  saveComboCounts(comboCounts);
  saveCardCounts(cardCounts);
  render();
  showToast('All counters reset', () => {
    TYPES.forEach((type) => {
      counts[type.key] = previousCounts[type.key];
    });
    COMBOS.forEach((combo) => {
      comboCounts[combo.key] = previousComboCounts[combo.key];
    });
    cardCounts = previousCardCounts;
    saveCounts(counts);
    saveComboCounts(comboCounts);
    saveCardCounts(cardCounts);
    render();
  });
}

// ---------- Wake Lock (Bildschirm anlassen) ----------

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return false;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    });
    return true;
  } catch {
    // z. B. Tab im Hintergrund – beim nächsten visibilitychange erneut versuchen.
    return false;
  }
}

wakeLockBtn.addEventListener('click', async () => {
  if (wakeLockWanted) {
    wakeLockWanted = false;
    if (wakeLock) await wakeLock.release();
    wakeLockBtn.setAttribute('aria-pressed', 'false');
    showToast('Screen can sleep again');
    return;
  }
  const acquired = await requestWakeLock();
  wakeLockWanted = acquired;
  wakeLockBtn.setAttribute('aria-pressed', String(acquired));
  if (acquired) {
    showToast('Screen stays on');
  } else if ('wakeLock' in navigator) {
    showToast('Wake mode unavailable');
  } else {
    showToast('Wake mode is not supported by this browser');
  }
});

document.addEventListener('visibilitychange', () => {
  if (wakeLockWanted && document.visibilityState === 'visible' && !wakeLock) {
    requestWakeLock();
  }
});

// ---------- Vollbildübersicht (Klick auf die Typ-Übersicht in der Kopfleiste) ----------

const categoryOverview = document.getElementById('categoryOverview');
const overviewTotalAll = document.getElementById('overviewTotalAll');
const overviewTypeCount = document.getElementById('overviewTypeCount');
const overviewScope = document.getElementById('overviewScope');
const overviewGrid = document.getElementById('overviewGrid');

for (const type of TYPES) {
  const tile = document.createElement('div');
  tile.className = 'fullscreen-overview__tile';
  tile.dataset.type = type.key;
  if (type.optional) tile.hidden = !optionalTypeVisibility[type.key]; // openCategoryOverview() hält das mit der Checkbox synchron.
  tile.innerHTML = `
    <img src="${type.icon}" alt="" />
    <span data-overview-total-for="${type.key}">0</span>
    <small>${type.label}</small>
  `;
  overviewGrid.appendChild(tile);
}

function openCategoryOverview() {
  // Ist das Board auf einen Spieler gefiltert (siehe `selectedPlayer`), zeigt
  // auch diese Übersicht nur dessen Zahlen statt der Summe aller Spieler –
  // sonst würde sie der Kopfleiste widersprechen, die genau das schon tut.
  for (const type of TYPES) {
    const typeTotal =
      selectedPlayer === null ? typeTotalAllPlayers(type.key) : typeTotalForPlayer(type.key, selectedPlayer);
    overviewGrid.querySelector(`[data-overview-total-for="${type.key}"]`).textContent = typeTotal;
    if (type.optional) {
      overviewGrid.querySelector(`.fullscreen-overview__tile[data-type="${type.key}"]`).hidden =
        !optionalTypeVisibility[type.key];
    }
  }
  // Gesamtzahl kommt aus `cardCounts` (physische Karten), siehe render().
  overviewTotalAll.textContent =
    selectedPlayer === null ? cardCounts.reduce((sum, value) => sum + value, 0) : cardCounts[selectedPlayer];
  const distinctTypeCount = countDistinctTypes();
  overviewTypeCount.textContent = `${distinctTypeCount} type${distinctTypeCount === 1 ? '' : 's'}`;
  // Zeigt nur den Namen – reicht zusammen mit der Position direkt unterm
  // Sechseck, um klarzumachen, dass gerade nur diese Person gefiltert ist.
  overviewScope.hidden = selectedPlayer === null;
  if (selectedPlayer !== null) {
    overviewScope.textContent = getPlayerName(selectedPlayer);
  }
  categoryOverview.hidden = false;
  // Reflow erzwingen, damit die Öffnen-Transition greift.
  void categoryOverview.offsetHeight;
  categoryOverview.classList.add('is-open');
}

function closeCategoryOverview() {
  categoryOverview.classList.remove('is-open');
  setTimeout(() => {
    if (!categoryOverview.classList.contains('is-open')) categoryOverview.hidden = true;
  }, 200);
}

const totalHex = document.getElementById('totalHex');

function openCategoryOverviewOnKey(event) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openCategoryOverview();
  }
}

typePanel.addEventListener('click', openCategoryOverview);
typePanel.addEventListener('keydown', openCategoryOverviewOnKey);
totalHex.addEventListener('click', openCategoryOverview);
totalHex.addEventListener('keydown', openCategoryOverviewOnKey);
// Tippen, egal wo auf der Vollbildübersicht, schließt sie wieder.
categoryOverview.addEventListener('click', closeCategoryOverview);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && categoryOverview.classList.contains('is-open')) {
    closeCategoryOverview();
  }
});

// ---------- Service Worker ----------

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js?v=18').catch(() => {
      // Offline-Fähigkeit ist ein Extra, kein Blocker für die App selbst.
    });
  });
}

// ---------- Start ----------

syncPlayerCountButtons();
render();
