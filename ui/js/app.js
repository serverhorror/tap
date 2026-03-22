/*
take_a_pick - app.js
Chips input module: dynamic chips UI, localStorage persistence, deduplication,
accessibility announcements, and integration API for the reel.

Behavior:
- Renders inputs into #chips-container
- Trailing input commits only on Enter or blur
- Existing entry commits on Enter or blur; Escape reverts
- Deduplicate case-insensitively (first occurrence preserved)
- Persists under localStorage key 'takeapick:v1'
- Dispatches `takeapick:spin` when Spin pressed with final names
- Exposes `window.takeAPick` API for integration and testing

The single authoritative list lives in state.entries (array of {id, name}).
All other modules receive plain string arrays and call back into this
module's API (e.g. removeName) to mutate the list.
*/

(function () {
  "use strict";

  // ---- Config ----
  const STORAGE_KEY = "takeapick:v1";
  const MIN_NAMES_TO_SPIN = 2;
  const WARN_THRESHOLD = 25;

  // ---- Utilities ----
  const uid = () => "id-" + Math.random().toString(36).slice(2, 9);
  const trim = (v) => String(v == null ? "" : v).trim();
  const dedupeKey = (v) => trim(v).toLowerCase();

  // ---- Mutable DOM refs (populated at runtime) ----
  let chipsEl = null;
  let spinBtn = null;
  let clearBtn = null;
  let audioToggle = null;
  let announcer = null;
  let namesCountEl = null;
  let warningEl = null;
  let winnerEl = null;

  // ---- App state (single authoritative list) ----
  const state = {
    meta: { version: 1 },
    entries: [], // array of { id, name }
    settings: { audioEnabled: true },
  };

  // ---- Storage helpers ----
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
      if (count > WARN_THRESHOLD) {
        warningEl.style.display = "";
        warningEl.textContent = `Large list (${count}). For best UX try fewer than ${WARN_THRESHOLD} names.`;
      } else {
        warningEl.style.display = "none";
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
    hint.className = "chip-hint";
    hint.style.display = "none";
    hint.style.marginLeft = "8px";
    hint.style.color = "var(--muted, #94a3b8)";
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
          } catch (e) {
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
    hint.className = "chip-hint";
    hint.style.display = "none";
    hint.style.marginLeft = "8px";
    hint.style.color = "var(--muted, #94a3b8)";
    hint.setAttribute("aria-hidden", "true");

    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        commitTrailing(input.value, hint);
      } else if (ev.key === "Escape") {
        input.value = "";
        input.blur();
      }
    });

    input.addEventListener("blur", () => {
      commitTrailing(input.value, hint);
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
      if (hintEl) {
        hintEl.textContent = `"${value}" is already in the list.`;
        hintEl.style.display = "";
        setTimeout(() => {
          hintEl.style.display = "none";
        }, 2000);
      }
      announce(`Duplicate: ${value} not saved.`);
      render();
      return;
    }

    state.entries[idx].name = value;
    saveState();
    updateControls();
    announce(`${value} saved.`);
    render();
  }

  function commitTrailing(rawValue, hintEl) {
    const value = trim(rawValue);
    if (!value) return;
    if (existsName(value)) {
      if (hintEl) {
        hintEl.textContent = `"${value}" is already in the list.`;
        hintEl.style.display = "";
        setTimeout(() => {
          hintEl.style.display = "none";
        }, 2000);
      }
      announce(`Duplicate: ${value} not added.`);
      return;
    }
    state.entries.push({ id: uid(), name: value });
    saveState();
    render();
    setTimeout(() => {
      const inputs = chipsEl.querySelectorAll(".chip-input");
      if (inputs.length) inputs[inputs.length - 1].focus();
    }, 0);
    announce(`${value} added.`);
  }

  function removeEntry(id, opts = {}) {
    const idx = state.entries.findIndex((e) => e.id === id);
    if (idx === -1) {
      render();
      return null;
    }
    const removed = state.entries.splice(idx, 1)[0];
    saveState();
    render();
    if (opts.focusPrev) {
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
  // This is the method the reel module calls when the user clicks "Remove".
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
  // This is called when the user clicks Spin. It cleans up the list and returns
  // an array of plain name strings like ["Alice", "Bob", "Charlie"].
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
    // Return plain strings — the reel module must never receive objects.
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
    const { row: trailingRow } = createTrailingRow();
    chipsEl.appendChild(trailingRow);
    updateControls();
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
        // Send plain strings to the reel module via custom event
        const ev = new CustomEvent("takeapick:spin", { detail: { names } });
        window.dispatchEvent(ev);
        announce("Spin started.");
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (!confirm("Clear all names?")) return;
        state.entries = [];
        saveState();
        render();
        announce("All names cleared.");
        if (winnerEl) winnerEl.textContent = "—";
      });
    }

    document.addEventListener("keydown", (ev) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "k") {
        if (clearBtn && !clearBtn.disabled) {
          ev.preventDefault();
          clearBtn.click();
        }
      } else if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") {
        if (spinBtn && !spinBtn.disabled) {
          ev.preventDefault();
          spinBtn.click();
        }
      }
    });

    if (audioToggle) {
      const stored = localStorage.getItem(STORAGE_KEY + ":audio");
      if (stored !== null) {
        state.settings.audioEnabled = stored === "1";
        audioToggle.checked = state.settings.audioEnabled;
      } else audioToggle.checked = !!state.settings.audioEnabled;

      audioToggle.addEventListener("change", () => {
        state.settings.audioEnabled = !!audioToggle.checked;
        localStorage.setItem(
          STORAGE_KEY + ":audio",
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
    warningEl =
      document.getElementById("chips-warning") ||
      document.getElementById("warning");
    winnerEl = document.getElementById("winnerDisplay");
  }

  function init() {
    initDomRefs();
    if (!chipsEl) {
      console.warn(
        "take_a_pick: #chips-container not found; initialization aborted.",
      );
      return;
    }

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

    const storedAudio = localStorage.getItem(STORAGE_KEY + ":audio");
    if (storedAudio !== null) state.settings.audioEnabled = storedAudio === "1";
    if (audioToggle) audioToggle.checked = !!state.settings.audioEnabled;

    render();
    announce(`${getEffectiveNames().length} names loaded.`);
  }

  // ---- Public API ----
  // The reel module and tests use this API. All name values are plain strings.
  window.takeAPick = window.takeAPick || {};
  Object.assign(window.takeAPick, {
    getNames: () => getEffectiveNames(),
    removeName,
    clearAll: () => {
      state.entries = [];
      saveState();
      render();
      announce("All names cleared.");
      if (winnerEl) winnerEl.textContent = "—";
    },
    _internal: { state, saveState, loadState },
  });

  // ---- Bootstrap ----
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      init();
      wireControls();
    });
  } else {
    init();
    wireControls();
  }
})();
