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

let counts = loadCounts();
let activePlayers = loadActivePlayers();
let playerNames = loadPlayerNames();
let nameHistory = loadNameHistory();
let collapsedTypes = loadCollapsedTypes();
let wakeLock = null;
let wakeLockWanted = false;

// ---------- Aufbau der Kopfleiste (Typ-Übersichtspanel) ----------

const typePanel = document.getElementById('typePanel');
const totalAllEl = document.getElementById('totalAll');
const playerTotalsEl = document.getElementById('playerTotals');

for (const type of TYPES) {
  const col = document.createElement('div');
  col.className = 'type-panel__col';
  col.innerHTML = `
    <img src="${type.icon}" alt="" />
    <span data-total-for="${type.key}">0</span>
  `;
  typePanel.appendChild(col);
}

// ---------- Aufbau des Boards ----------

const board = document.getElementById('board');

for (const type of TYPES) {
  const section = document.createElement('section');
  section.className = 'type-section';
  section.dataset.type = type.key;
  if (collapsedTypes.includes(type.key)) section.classList.add('type-section--collapsed');
  section.innerHTML = `
    <h2 class="type-section__heading">
      <img src="${type.icon}" alt="" />
      <span>${type.label}</span>
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
  board.appendChild(section);
}

// ---------- Rendering ----------

function render() {
  let grandTotal = 0;
  const playerTotals = Array(MAX_PLAYERS).fill(0);
  for (const type of TYPES) {
    const typeCounts = counts[type.key];
    const typeTotal = typeCounts.reduce((sum, value, playerIndex) => {
      playerTotals[playerIndex] += value;
      return sum + value;
    }, 0);
    grandTotal += typeTotal;

    document.querySelector(`[data-total-for="${type.key}"]`).textContent = typeTotal;

    for (let playerIndex = 0; playerIndex < MAX_PLAYERS; playerIndex += 1) {
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
      card.hidden = !activePlayers[playerIndex];
    }
  }
  totalAllEl.textContent = grandTotal;

  const activeCount = activePlayers.filter(Boolean).length;
  document.documentElement.style.setProperty('--player-count', String(activeCount));
  playerTotalsEl.innerHTML = playerTotals
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
const tapPopups = new Map(); // "typeKey-playerIndex" -> { el, total, settleTimer, removeTimer }

function getCardEl(typeKey, playerIndex) {
  return board.querySelector(
    `.type-section[data-type="${typeKey}"] .counter-card[data-player="${playerIndex}"]`,
  );
}

function showChangePopup(typeKey, playerIndex, delta) {
  const card = getCardEl(typeKey, playerIndex);
  if (!card) return;
  const key = `${typeKey}-${playerIndex}`;
  let popup = tapPopups.get(key);

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
    tapPopups.set(key, popup);
  }

  popup.el.textContent = popup.total > 0 ? `+${popup.total}` : `${popup.total}`;

  popup.settleTimer = setTimeout(() => {
    popup.el.classList.add('counter-card__pop--leaving');
    popup.removeTimer = setTimeout(() => {
      popup.el.remove();
      tapPopups.delete(key);
    }, 500);
  }, POPUP_SETTLE_MS);
}

// Wendet eine Änderung an und meldet zurück, ob sich der Wert wirklich geändert hat
// (z. B. kein Effekt, wenn bereits am oberen/unteren Limit).
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

// Die Plus-/Minus-Zonen bedecken die komplette Karte (obere/untere Hälfte),
// es gibt also keine eigene "Kartenfläche" dahinter, die Klicks abbekäme.
// Wisch-Gesten funktionieren auf dem Handy nicht zuverlässig, weil dieselbe
// Bewegung zum Scrollen der Seite gedacht ist – Langdruck (Fünferschritte)
// bleibt deshalb die einzige Geste direkt an den Zonen.
const activeHolds = new Map(); // pointerId -> { btn, typeKey, playerIndex, sign, triggeredBig, moved, startX, startY, timeoutId, intervalId }

// Ab dieser Bewegung (in Pixeln) gilt ein Tipp als Scroll-Versuch statt als
// Antippen – verhindert, dass ein Finger, der beim Scrollen über eine
// Plus-/Minus-Zone streift, versehentlich einen Zähler verändert.
const TAP_MOVE_CANCEL_PX = 10;

board.addEventListener('pointerdown', (event) => {
  const btn = event.target.closest('button[data-action]');
  if (!btn || btn.disabled) return;
  btn.setPointerCapture(event.pointerId);

  const { action, type: typeKey, player: playerIndex } = btn.dataset;
  const sign = action === 'inc' ? 1 : -1;
  const hold = {
    btn,
    typeKey,
    playerIndex: Number(playerIndex),
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
    if (applyChange(typeKey, Number(playerIndex), sign * HOLD_STEP)) vibrate([20, 30, 20]);
    hold.intervalId = setInterval(() => {
      if (applyChange(typeKey, Number(playerIndex), sign * HOLD_STEP)) vibrate([20, 30, 20]);
    }, HOLD_REPEAT_MS);
  }, HOLD_DELAY_MS);

  activeHolds.set(event.pointerId, hold);
});

board.addEventListener('pointermove', (event) => {
  const hold = activeHolds.get(event.pointerId);
  if (!hold || hold.moved || hold.triggeredBig) return;
  const dx = event.clientX - hold.startX;
  const dy = event.clientY - hold.startY;
  if (Math.hypot(dx, dy) > TAP_MOVE_CANCEL_PX) {
    hold.moved = true;
    clearTimeout(hold.timeoutId);
  }
});

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
    applyChange(hold.typeKey, hold.playerIndex, hold.sign);
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

board.addEventListener('pointerup', endHold);
board.addEventListener('pointercancel', cancelHold);

// Tastatur-Bedienung (Enter/Leertaste): einfacher Einzelschritt, unabhängig
// von der Pointer-Logik oben (Tastatur löst keine Pointer-Events aus).
board.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const btn = event.target.closest('button[data-action]');
  if (!btn || btn.disabled) return;
  event.preventDefault();
  const { action, type: typeKey, player: playerIndex } = btn.dataset;
  applyChange(typeKey, Number(playerIndex), action === 'inc' ? 1 : -1);
});

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
      `${section.querySelector('.type-section__heading span').textContent} reset`,
      () => {
        counts[typeKey] = previous;
        saveCounts(counts);
        render();
      },
    );
  });
});

board.addEventListener('click', (event) => {
  const heading = event.target.closest('.type-section__heading');
  if (!heading) return;
  if (headingLongPressFired) {
    headingLongPressFired = false;
    return;
  }
  const section = heading.closest('.type-section');
  const typeKey = section.dataset.type;
  const isCollapsed = collapsedTypes.includes(typeKey);
  collapsedTypes = isCollapsed
    ? collapsedTypes.filter((key) => key !== typeKey)
    : [...collapsedTypes, typeKey];
  saveCollapsedTypes(collapsedTypes);
  section.classList.toggle('type-section--collapsed', !isCollapsed);
});

// Einmal-Klick auf eine Spieler-Summe zeigt nur ein Zurücksetzen-Icon;
// nochmal antippen fragt extra nach (✓/×), bevor wirklich etwas gelöscht
// wird. Umbenennen läuft separat über die Namensfelder im Hamburger-Menü.
let badgeState = null; // null | { playerIndex, mode: 'reset' | 'confirm' }

function renderPlayerBadge(playerIndex, total) {
  const isTarget = badgeState && badgeState.playerIndex === playerIndex;

  if (isTarget && badgeState.mode === 'reset') {
    return `
      <span class="player-badge player-badge--reset" data-player="${playerIndex}">
        <button
          type="button"
          class="player-badge__action"
          data-badge-action="ask-reset"
          aria-label="Reset ${escapeHtml(getPlayerName(playerIndex))}"
        >
          ↺
        </button>
      </span>
    `;
  }

  if (isTarget && badgeState.mode === 'confirm') {
    return `
      <span class="player-badge player-badge--confirm" data-player="${playerIndex}">
        <button
          type="button"
          class="player-badge__action player-badge__action--confirm"
          data-badge-action="confirm-reset"
          aria-label="Confirm reset"
        >
          ✓
        </button>
        <button type="button" class="player-badge__action player-badge__action--cancel" data-badge-action="cancel" aria-label="Cancel">×</button>
      </span>
    `;
  }

  return `<span data-player="${playerIndex}"><b>${escapeHtml(getPlayerName(playerIndex))}</b><strong>${total}</strong></span>`;
}

function exitBadge() {
  badgeState = null;
  render();
}

function performBadgeReset(playerIndex) {
  const previous = TYPES.map((type) => counts[type.key][playerIndex]);
  const name = getPlayerName(playerIndex);
  exitBadge();
  if (!previous.some((value) => value > 0)) return;
  TYPES.forEach((type) => {
    counts[type.key][playerIndex] = 0;
  });
  saveCounts(counts);
  render();
  vibrate([20, 30, 20]);
  showToast(`${name} reset`, () => {
    TYPES.forEach((type, i) => {
      counts[type.key][playerIndex] = previous[i];
    });
    saveCounts(counts);
    render();
  });
}

playerTotalsEl.addEventListener('click', (event) => {
  const actionBtn = event.target.closest('[data-badge-action]');
  if (actionBtn) {
    const action = actionBtn.dataset.badgeAction;
    const playerIndex = badgeState.playerIndex;
    if (action === 'cancel') exitBadge();
    else if (action === 'ask-reset') {
      badgeState = { playerIndex, mode: 'confirm' };
      render();
    } else if (action === 'confirm-reset') performBadgeReset(playerIndex);
    return;
  }

  const badge = event.target.closest('[data-player]');
  if (badge) {
    const playerIndex = Number(badge.dataset.player);
    if (!badgeState || badgeState.playerIndex !== playerIndex) {
      badgeState = { playerIndex, mode: 'reset' };
      render();
    }
  }
});

// Klick/Tap außerhalb der Spieler-Summen-Zeile klappt ein offenes Badge
// wieder zu, ohne etwas zu ändern.
document.addEventListener('pointerdown', (event) => {
  if (!badgeState) return;
  if (playerTotalsEl.contains(event.target)) return;
  exitBadge();
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
}

function closeMenu() {
  sidePanel.classList.remove('is-open');
  sidePanel.setAttribute('aria-hidden', 'true');
  scrim.hidden = true;
  menuOpenBtn.setAttribute('aria-expanded', 'false');
  setTimeout(() => {
    if (!sidePanel.classList.contains('is-open')) sidePanel.hidden = true;
  }, 220);
  // Ohne das würde ein einmal angetippter "Alles zurücksetzen"-Button beim
  // erneuten Öffnen des Menüs weiterhin im Bestätigen-Zustand hängen und ein
  // einzelner Tipp könnte dann unerwartet sofort alles löschen.
  if (resetConfirmTimer) {
    clearTimeout(resetConfirmTimer);
    resetConfirmTimer = null;
    resetBtnLabel.textContent = resetBtnLabelDefault;
  }
}

menuOpenBtn.addEventListener('click', openMenu);
menuCloseBtn.addEventListener('click', closeMenu);
scrim.addEventListener('click', closeMenu);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && sidePanel.classList.contains('is-open')) closeMenu();
});

// ---------- Menü: Anzahl der Spieler, zurücksetzen, Wake Lock ----------

const wakeLockBtn = document.getElementById('wakeLockBtn');
const watermarkBtn = document.getElementById('watermarkBtn');
const resetBtn = document.getElementById('resetBtn');

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
const playerCountButtons = document.querySelectorAll('[data-player-count]');

// Kurzwahl im Menü: setzt die ersten `count` Spieler aktiv, alle anderen
// inaktiv. Über das Spieler-Menü einzeln entfernte Spieler kommen darüber
// zurück.
function setActivePlayers(count) {
  const clamped = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Number(count)));
  activePlayers = Array.from({ length: MAX_PLAYERS }, (_, playerIndex) => playerIndex < clamped);
  saveActivePlayers(activePlayers);
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

// window.confirm() liefert in installierten PWAs (v. a. iOS "Zum Home-
// Bildschirm") oft sofort `undefined` statt einen Dialog zu zeigen – der
// Reset würde dann nie ausgeführt. Deshalb ein eigener Zweifach-Tipp statt
// eines nativen Dialogs.
let resetConfirmTimer = null;
const resetBtnLabel = resetBtn.querySelector('span');
const resetBtnLabelDefault = resetBtnLabel.textContent;

resetBtn.addEventListener('click', () => {
  if (resetConfirmTimer) {
    clearTimeout(resetConfirmTimer);
    resetConfirmTimer = null;
    resetBtnLabel.textContent = resetBtnLabelDefault;
    counts = createEmptyCounts();
    saveCounts(counts);
    render();
    showToast('All counters reset');
    closeMenu();
    return;
  }
  resetBtnLabel.textContent = 'Sure? Tap again';
  resetConfirmTimer = setTimeout(() => {
    resetConfirmTimer = null;
    resetBtnLabel.textContent = resetBtnLabelDefault;
  }, 3000);
});

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
const overviewGrid = document.getElementById('overviewGrid');

for (const type of TYPES) {
  const tile = document.createElement('div');
  tile.className = 'fullscreen-overview__tile';
  tile.innerHTML = `
    <img src="${type.icon}" alt="" />
    <span data-overview-total-for="${type.key}">0</span>
    <small>${type.label}</small>
  `;
  overviewGrid.appendChild(tile);
}

function openCategoryOverview() {
  let grandTotal = 0;
  for (const type of TYPES) {
    const typeTotal = counts[type.key].reduce((sum, value) => sum + value, 0);
    grandTotal += typeTotal;
    overviewGrid.querySelector(`[data-overview-total-for="${type.key}"]`).textContent = typeTotal;
  }
  overviewTotalAll.textContent = grandTotal;
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
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Offline-Fähigkeit ist ein Extra, kein Blocker für die App selbst.
    });
  });
}

// ---------- Start ----------

syncPlayerCountButtons();
render();
