/*
take_a_pick - app.js (ES module)
Chips input module: dynamic chips UI, localStorage persistence, deduplication,
accessibility announcements, and integration API for the reel.

Behavior:
- Renders inputs into #chips-container
- Trailing input commits only on Enter or blur
- Existing entry commits on Enter or blur; Escape reverts
- Deduplicate case-insensitively (first occurrence preserved)
- Persists under localStorage key 'takeapick:v1'
- Dispatches `takeapick:spin` when Spin pressed with final names
*/

import "./sounds.js";

// ---- Config ----
const STORAGE_KEY = "takeapick:v1";
const THEME_STORAGE_KEY = STORAGE_KEY + ":theme";
const STORAGE_KEYS = {
  state: STORAGE_KEY,
  theme: THEME_STORAGE_KEY,
  audio: STORAGE_KEY + ":audio",
};
const THEME_ORDER = ["system", "light", "dark"];
const THEME_ICON_MAP = {
  system: "static/system.svg",
  light: "static/light.svg",
  dark: "static/dark.svg",
};
const MIN_NAMES_TO_SPIN = 2;
const WARN_THRESHOLD = 15;

// ---- Utilities ----
const uid = () => "id-" + Math.random().toString(36).slice(2, 9);
const trim = (v) => String(v == null ? "" : v).trim();
const dedupeKey = (v) => trim(v).toLowerCase();

function captureActiveInput() {
  const active = document.activeElement;
  if (!active || !active.classList.contains("chip-input")) return null;
  const row = active.closest(".chip-row");
  if (!row) return null;
  return {
    id: row.dataset.id || null,
    start: active.selectionStart ?? null,
    end: active.selectionEnd ?? null,
  };
}

function restoreActiveInput(ctx, removedId) {
  if (!ctx || !ctx.id || ctx.id === removedId) return;
  const target = chipsEl?.querySelector(
    `.chip-row[data-id="${ctx.id}"] .chip-input`,
  );
  if (!target) return;
  target.focus();
  if (ctx.start != null && ctx.end != null) {
    try {
      target.setSelectionRange(ctx.start, ctx.end);
    } catch (_) {
      /* ignore */
    }
  }
}

// ---- Mutable DOM refs (populated at runtime) ----
let chipsEl = null;
let spinBtn = null;
let clearBtn = null;
let audioToggle = null;
let announcer = null;
let namesCountEl = null;
let chipInputSlot = null;
let warningEl = null;
let winnerEl = null;
let themeButton = null;
let themeIconEl = null;
let themeOptions = [];

// Theme state
let currentTheme = "system";

// ---- App state (single authoritative list) ----
const state = {
  meta: { version: 1 },
  entries: [], // array of { id, name }
  settings: { audioEnabled: true },
};

// ---- Storage helpers ----
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.state);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.entries)) return;
    state.meta = parsed.meta || state.meta;
    state.entries = parsed.entries.map((e) => ({
      id: e.id || uid(),
      name: String(e.name || ""),
    }));
    state.settings = Object.assign({}, state.settings, parsed.settings || {});
  } catch (err) {
    console.error("take_a_pick: failed to load state", err);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEYS.state, JSON.stringify(state));
  } catch (err) {
    console.error("take_a_pick: failed to save state", err);
    announce("Failed to save to localStorage.");
  }
}

// ---- Accessibility announcer ----
function announce(msg) {
  if (!announcer) return;
  announcer.textContent = "";
  setTimeout(() => {
    announcer.textContent = msg;
  }, 60);
}

function showHint(hintEl, msg) {
  if (!hintEl) return;
  hintEl.textContent = msg;
  hintEl.hidden = false;
  hintEl.classList.add("is-visible");
  setTimeout(() => {
    hintEl.hidden = true;
    hintEl.classList.remove("is-visible");
  }, 2000);
}

// ---- Helpers for names ----
// Returns a deduped array of plain name strings from the authoritative list.
function getEffectiveNames() {
  const out = [];
  const seen = new Set();
  for (const e of state.entries) {
    const n = trim(e.name);
    if (!n) continue;
    const k = dedupeKey(n);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

function existsName(name) {
  const k = dedupeKey(name);
  return state.entries.some((e) => dedupeKey(e.name) === k);
}

function updateControls() {
  const names = getEffectiveNames();
  const count = names.length;
  if (namesCountEl)
    namesCountEl.textContent = `${count} ${count === 1 ? "name" : "names"}`;
  if (spinBtn) spinBtn.disabled = count < MIN_NAMES_TO_SPIN;
  if (clearBtn) clearBtn.disabled = count === 0;

  if (warningEl) {
    if (count >= WARN_THRESHOLD) {
      warningEl.hidden = false;
      warningEl.classList.add("warning-visible");
      warningEl.textContent = `Large list (${count}). For best UX try fewer than ${WARN_THRESHOLD} names.`;
    } else {
      warningEl.hidden = true;
      warningEl.classList.remove("warning-visible");
      warningEl.textContent = "";
    }
  }
}

// ---- Rendering helpers ----
function createExistingRow(entry, index) {
  const row = document.createElement("div");
  row.className = "chip-row";
  row.setAttribute("data-id", entry.id);
  row.setAttribute("role", "group");

  const input = document.createElement("input");
  input.type = "text";
  input.className = "chip-input";
  input.value = entry.name || "";
  input.setAttribute("aria-label", `Name ${index + 1}`);
  input.autocomplete = "off";
  input.dataset.savedValue = entry.name || "";

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "chip-remove";
  remove.setAttribute("aria-label", "Remove name");
  remove.textContent = "✕";

  const hint = document.createElement("div");
  hint.className = "chip-hint hint";
  hint.hidden = true;
  hint.setAttribute("aria-hidden", "true");

  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      commitExisting(entry.id, input.value, hint);
      setTimeout(() => {
        try {
          input.focus();
          const L = input.value.length;
          input.setSelectionRange(L, L);
        } catch (_e) {
          // ignore
        }
      }, 0);
    } else if (ev.key === "Escape") {
      input.value = input.dataset.savedValue || "";
      input.blur();
    } else if (ev.key === "Backspace") {
      if (input.value === "") {
        ev.preventDefault();
        removeEntry(entry.id, { focusPrev: true });
      }
    }
  });

  input.addEventListener("blur", () => {
    commitExisting(entry.id, input.value, hint);
  });

  remove.addEventListener("mousedown", (ev) => {
    ev.preventDefault(); // keep current input focused while clicking remove
  });
  remove.addEventListener("click", () => {
    removeEntry(entry.id, { focusPrev: true });
  });

  row.appendChild(input);
  row.appendChild(remove);
  row.appendChild(hint);

  return row;
}

function createTrailingRow() {
  const row = document.createElement("div");
  row.className = "chip-row trailing";
  row.setAttribute("role", "group");

  const input = document.createElement("input");
  input.type = "text";
  input.className = "chip-input";
  input.value = "";
  input.placeholder = "Add name...";
  input.setAttribute("aria-label", "Add name");
  input.autocomplete = "off";

  const hint = document.createElement("div");
  hint.className = "chip-hint hint";
  hint.hidden = true;
  hint.setAttribute("aria-hidden", "true");

  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      commitTrailing(input.value, hint, input);
    } else if (ev.key === "Escape") {
      input.value = "";
      input.blur();
    }
  });

  input.addEventListener("blur", () => {
    commitTrailing(input.value, hint, input);
  });

  row.appendChild(input);
  row.appendChild(hint);
  return { row, input };
}

// ---- Commit / Remove logic ----
function commitExisting(id, rawValue, hintEl) {
  const value = trim(rawValue);
  const idx = state.entries.findIndex((e) => e.id === id);
  if (idx === -1) {
    render();
    return;
  }

  if (!value) {
    const removed = state.entries.splice(idx, 1)[0];
    saveState();
    render();
    announce(`${removed.name || "Entry"} removed.`);
    return;
  }

  const k = dedupeKey(value);
  const conflict = state.entries.some(
    (e, i) => i !== idx && dedupeKey(e.name) === k,
  );
  if (conflict) {
    showHint(hintEl, `"${value}" is already in the list.`);
    announce(`Duplicate: ${value} not saved.`);
    return;
  }

  state.entries[idx].name = value;
  saveState();
  updateControls();
  announce(`${value} saved.`);
  render();
}

function commitTrailing(rawValue, hintEl, inputEl) {
  const value = trim(rawValue);
  if (!value) return;
  if (existsName(value)) {
    showHint(hintEl, `"${value}" is already in the list.`);
    announce(`Duplicate: ${value} not added.`);
    return;
  }
  state.entries.push({ id: uid(), name: value });
  saveState();
  render();
  setTimeout(() => {
    const slotInput =
      (chipInputSlot && chipInputSlot.querySelector(".chip-input")) ||
      (inputEl && inputEl.closest(".chip-panel")?.querySelector(".chip-input"));
    if (slotInput) {
      slotInput.value = "";
      slotInput.focus();
    }
  }, 0);
  announce(`${value} added.`);
}

function removeEntry(id, opts = {}) {
  const idx = state.entries.findIndex((e) => e.id === id);
  if (idx === -1) {
    render();
    return null;
  }
  const focusCtx = captureActiveInput();
  const removed = state.entries.splice(idx, 1)[0];
  saveState();
  render();
  restoreActiveInput(focusCtx, id);
  if (opts.focusPrev && (!focusCtx || focusCtx.id === id)) {
    setTimeout(() => {
      const inputs = Array.from(chipsEl.querySelectorAll(".chip-input"));
      const focusIndex = Math.max(0, Math.min(inputs.length - 1, idx - 1));
      if (inputs[focusIndex]) inputs[focusIndex].focus();
    }, 0);
  }
  announce(`${removed.name || "Entry"} removed.`);
  return removed ? removed.name : null;
}

// Remove a name from the authoritative list by its display name (case-insensitive match).
function removeName(name) {
  const targetName = trim(name);
  if (!targetName) return null;

  const idx = state.entries.findIndex(
    (e) => dedupeKey(e.name) === dedupeKey(targetName),
  );
  if (idx === -1) return null;

  const removed = state.entries.splice(idx, 1)[0];
  saveState();
  render();
  announce(`${removed.name || "Entry"} removed.`);
  return removed ? removed.name : null;
}

// Prune empties and dedupe the authoritative list, then return plain strings.
function prepareFinalNames() {
  const seen = new Set();
  const kept = [];
  for (const e of state.entries) {
    const n = trim(e.name);
    if (!n) continue;
    const k = dedupeKey(n);
    if (seen.has(k)) continue;
    seen.add(k);
    kept.push(e); // preserve the original entry object (with its stable id)
  }
  state.entries = kept;
  saveState();
  render();
  return kept.map((e) => e.name);
}

// ---- Render ----
function render() {
  if (!chipsEl) return;
  chipsEl.innerHTML = "";
  state.entries.forEach((entry, i) => {
    const row = createExistingRow(entry, i);
    chipsEl.appendChild(row);
  });
  if (chipInputSlot) {
    chipInputSlot.innerHTML = "";
    const { row: trailingRow } = createTrailingRow();
    chipInputSlot.appendChild(trailingRow);
  }
  updateControls();
}

// ---- Theme handling ----
function renderThemeButton() {
  if (!themeButton) return;
  const label = currentTheme.charAt(0).toUpperCase() + currentTheme.slice(1);
  themeButton.setAttribute("aria-label", `Theme: ${label}`);
  themeButton.setAttribute("title", `Theme: ${label}`);

  if (themeIconEl) {
    const iconSrc = THEME_ICON_MAP[currentTheme] || THEME_ICON_MAP.system;
    themeIconEl.setAttribute("src", iconSrc);
    themeIconEl.setAttribute("aria-hidden", "true");
  }

  let labelEl =
    themeButton.querySelector(".theme-label") ||
    themeButton.querySelector(".theme-active");
  if (!labelEl) {
    labelEl = document.createElement("span");
    labelEl.className = "theme-label";
    themeButton.appendChild(labelEl);
  }
  labelEl.textContent = label;
}

function updateThemeMenuActive() {
  if (!themeOptions) return;
  themeOptions.forEach((btn) => {
    const t = btn.dataset.theme;
    btn.classList.toggle("active", t === currentTheme);
  });
}

function applyTheme(theme) {
  currentTheme = THEME_ORDER.includes(theme) ? theme : "system";
  if (currentTheme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", currentTheme);
  }
  try {
    localStorage.setItem(STORAGE_KEYS.theme, currentTheme);
  } catch (_) {
    /* ignore */
  }
  renderThemeButton();
  updateThemeMenuActive();
}

function loadTheme() {
  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEYS.theme);
  } catch (_) {
    /* ignore */
  }
  currentTheme = THEME_ORDER.includes(stored) ? stored : "system";
  if (currentTheme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", currentTheme);
  }
  renderThemeButton();
  updateThemeMenuActive();
}

function cycleTheme() {
  const idx = THEME_ORDER.indexOf(currentTheme);
  const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length];
  applyTheme(next);
}

function wireThemeButton() {
  if (themeButton) {
    themeButton.addEventListener("click", cycleTheme);
  }
  if (themeOptions && themeOptions.length) {
    themeOptions.forEach((btn) => {
      btn.addEventListener("click", () => {
        applyTheme(btn.dataset.theme || "system");
      });
    });
  }
  renderThemeButton();
  updateThemeMenuActive();
}

// ---- Wire controls ----
function wireControls() {
  if (spinBtn) {
    spinBtn.addEventListener("click", () => {
      const names = prepareFinalNames();
      if (names.length < MIN_NAMES_TO_SPIN) {
        announce("Please provide at least two unique names to spin.");
        return;
      }
      const ev = new CustomEvent("takeapick:spin", { detail: { names } });
      window.dispatchEvent(ev);
      announce("Spin started.");
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      state.entries = [];
      saveState();
      render();
      announce("All names cleared.");
      if (winnerEl) winnerEl.textContent = "—";
    });
  }

  document.addEventListener("keydown", (ev) => {
    const key = (ev.key || "").toLowerCase();
    if ((ev.ctrlKey || ev.metaKey) && key === "k") {
      if (clearBtn && !clearBtn.disabled) {
        ev.preventDefault();
        clearBtn.click();
      }
    } else if ((ev.ctrlKey || ev.metaKey) && key === "enter") {
      if (spinBtn && !spinBtn.disabled) {
        ev.preventDefault();
        spinBtn.click();
      }
    }
  });

  if (audioToggle) {
    const stored = localStorage.getItem(STORAGE_KEYS.audio);
    if (stored !== null) {
      state.settings.audioEnabled = stored === "1";
      audioToggle.checked = state.settings.audioEnabled;
    } else audioToggle.checked = !!state.settings.audioEnabled;

    audioToggle.addEventListener("change", () => {
      state.settings.audioEnabled = !!audioToggle.checked;
      localStorage.setItem(
        STORAGE_KEYS.audio,
        state.settings.audioEnabled ? "1" : "0",
      );
      saveState();
      announce(
        `Audio ${state.settings.audioEnabled ? "enabled" : "disabled"}.`,
      );
    });
  }
}

// ---- Init ----
function initDomRefs() {
  chipsEl = document.getElementById("chips-container");
  spinBtn = document.getElementById("spin-button");
  clearBtn = document.getElementById("clear-button");
  audioToggle = document.getElementById("audio-toggle");
  announcer = document.getElementById("announcements");
  namesCountEl =
    document.getElementById("namesCount") ||
    document.getElementById("count-badge");
  chipInputSlot = document.getElementById("chip-input-slot");
  warningEl =
    document.getElementById("chips-warning") ||
    document.getElementById("warning");
  winnerEl = document.getElementById("winnerDisplay");
  themeButton = document.querySelector(".theme-button");
  themeIconEl = themeButton ? themeButton.querySelector(".theme-icon") : null;
  themeOptions = Array.from(document.querySelectorAll(".theme-option"));
}

function bootstrap() {
  initDomRefs();
  if (!chipsEl) {
    console.warn(
      "take_a_pick: #chips-container not found; initialization aborted.",
    );
    return;
  }
  if (!chipInputSlot) {
    console.warn(
      "take_a_pick: #chip-input-slot not found; initialization aborted.",
    );
    return;
  }

  loadTheme();
  wireThemeButton();
  loadState();

  // normalize on load: trim & dedupe preserving first occurrences
  const seen = new Set();
  const normalized = [];
  for (const e of state.entries) {
    const n = trim(e.name);
    if (!n) continue;
    const k = dedupeKey(n);
    if (seen.has(k)) continue;
    seen.add(k);
    normalized.push({ id: e.id || uid(), name: n });
  }
  state.entries = normalized;

  const storedAudio = localStorage.getItem(STORAGE_KEYS.audio);
  if (storedAudio !== null) state.settings.audioEnabled = storedAudio === "1";
  if (audioToggle) audioToggle.checked = !!state.settings.audioEnabled;

  render();
  announce(`${getEffectiveNames().length} names loaded.`);
  wireControls();
}

// ---- Public exports ----
export function getNames() {
  return getEffectiveNames();
}

export { removeName, clearAll, prepareFinalNames };

function clearAll() {
  state.entries = [];
  saveState();
  render();
  announce("All names cleared.");
  if (winnerEl) winnerEl.textContent = "—";
}

// ---- Bootstrap ----
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
