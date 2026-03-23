import { removeName, getNames } from "./app.js";
import { playTick, stopTicking } from "./sounds.js";

/*
take_a_pick - reel.js (ES module)

Slot-machine reel overlay.

Contract with app.js
--------------------
- Listens for the custom event "takeapick:spin".
  • event.detail.names MUST be an array of plain strings, e.g. ["Alice","Bob","Charlie"].
- When the user clicks OK   → closes the modal.  List unchanged.
- When the user clicks Remove → calls removeName(winnerName)
  which removes the winner from the app's single authoritative list,
  then closes the modal.
- Emits "takeapick:spin:start" and "takeapick:spin:end" custom events.
*/

const REPEATS = 10; // how many times the name list is repeated in the DOM
const ITEM_HEIGHT = 56; // px per reel row (matches CSS)
const BASE_DURATION = 3000;
const EXTRA_RANDOM = 900;

const SPIN_EVENT = "takeapick:spin";
const SPIN_BEGIN = "takeapick:spin:start";
const SPIN_END = "takeapick:spin:end";

// --------------- helpers ---------------

function sanitize(s) {
  return String(s == null ? "" : s);
}

function easeOutCubic(t) {
  const u = 1 - t;
  return 1 - u * u * u;
}

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (_) {
    return false;
  }
}

function announce(text) {
  try {
    const el = document.getElementById("announcements");
    if (el) {
      el.textContent = "";
      setTimeout(function () {
        el.textContent = text;
      }, 60);
    }
  } catch (_) {
    /* ignore */
  }
}

function setSpinButton(disabled) {
  try {
    const btn = document.getElementById("spin-button");
    if (btn) btn.disabled = !!disabled;
  } catch (_) {
    /* ignore */
  }
}

function getItemHeight() {
  try {
    const root = document.documentElement;
    const raw = root
      ? getComputedStyle(root).getPropertyValue("--tap-reel-item-height")
      : "";
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : ITEM_HEIGHT;
  } catch (_) {
    return ITEM_HEIGHT;
  }
}

// --------------- overlay DOM ---------------

function createOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "tap-reel-overlay";

  const panel = document.createElement("div");
  panel.className = "tap-reel-panel";

  const viewport = document.createElement("div");
  viewport.className = "tap-reel-viewport";

  const list = document.createElement("div");
  list.className = "tap-reel-list";
  list.dataset.revealed = "false";

  const pointer = document.createElement("div");
  pointer.className = "tap-reel-pointer";

  const footer = document.createElement("div");
  footer.className = "tap-reel-footer";

  const okBtn = document.createElement("button");
  okBtn.textContent = "OK";

  const removeBtn = document.createElement("button");
  removeBtn.textContent = "Remove";

  footer.appendChild(okBtn);
  footer.appendChild(removeBtn);

  viewport.appendChild(list);
  viewport.appendChild(pointer);
  panel.appendChild(viewport);
  panel.appendChild(footer);
  overlay.appendChild(panel);

  return { overlay, list, okBtn, removeBtn };
}

// --------------- reel item rendering ---------------

function buildReelItems(listEl, names, repeats) {
  listEl.innerHTML = "";
  const N = names.length;
  const frag = document.createDocumentFragment();

  for (let r = 0; r < repeats; r++) {
    for (let i = 0; i < N; i++) {
      const div = document.createElement("div");
      div.className = "tap-reel-item";
      div.textContent = sanitize(names[i]);
      frag.appendChild(div);
    }
  }

  listEl.appendChild(frag);
}

// --------------- highlight the winner row ---------------

function highlightItem(listEl, itemIndex) {
  const items = listEl.querySelectorAll(".tap-reel-item");
  const target = items[itemIndex];
  if (!target) return;

  target.classList.add("winner");
  target.scrollIntoView({ block: "center" });
  listEl.dataset.revealed = "true";
}

// --------------- close / finalize ---------------

function closeOverlay(overlayEl) {
  try {
    if (overlayEl) overlayEl.remove();
  } catch (_) {
    /* ignore */
  }
  stopTicking();
  setSpinButton(false);
}

function showWinnerInUI(winnerName) {
  try {
    const el = document.getElementById("winnerDisplay");
    if (el) el.textContent = sanitize(winnerName);
  } catch (_) {
    /* ignore */
  }
}

// --------------- wire OK / Remove buttons ---------------

function wireButtons(overlayEl, winnerName) {
  const buttons = overlayEl.querySelectorAll("button");
  const okBtn = buttons[0];
  const removeBtn = buttons[1];

  if (!okBtn || !removeBtn) return;

  okBtn.onclick = function () {
    showWinnerInUI(winnerName);
    announce("Winner: " + winnerName);
    window.dispatchEvent(
      new CustomEvent(SPIN_END, {
        detail: { winner: winnerName, removed: false },
      }),
    );
    closeOverlay(overlayEl);
  };

  removeBtn.onclick = function () {
    removeName(winnerName);
    showWinnerInUI(winnerName);
    announce("Winner: " + winnerName + " (removed from list)");
    window.dispatchEvent(
      new CustomEvent(SPIN_END, {
        detail: { winner: winnerName, removed: true },
      }),
    );
    closeOverlay(overlayEl);
  };
}

// --------------- main spin routine ---------------

function runSpin(names) {
  if (!Array.isArray(names) || names.length === 0) {
    announce("No names provided.");
    return;
  }

  const N = names.length;
  const winnerIndex = Math.floor(Math.random() * N);
  const winnerName = names[winnerIndex];
  const itemHeight = getItemHeight();

  const parts = createOverlay();
  const overlay = parts.overlay;
  const list = parts.list;
  document.body.appendChild(overlay);

  buildReelItems(list, names, REPEATS);

  const midRepeat = Math.floor(REPEATS / 2);
  const baseIndex = midRepeat * N + winnerIndex;
  const finalIndex = baseIndex;
  const finalY = finalIndex * itemHeight;

  const centerOffset = itemHeight;
  const landY = finalY - centerOffset;

  window.dispatchEvent(
    new CustomEvent(SPIN_BEGIN, {
      detail: { names, winnerIndex },
    }),
  );
  announce("Spin started.");
  setSpinButton(true);
  stopTicking();

  if (prefersReducedMotion()) {
    list.style.transform = "translateY(-" + landY + "px)";
    stopTicking();
    playTick();
    wireButtons(overlay, winnerName);
    return;
  }

  const duration = BASE_DURATION + Math.floor(Math.random() * EXTRA_RANDOM);
  const startTime = performance.now();
  let prevRow = -1;

  function step(now) {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / duration);
    const eased = easeOutCubic(t);
    const currentY = eased * landY;
    const currentRow = Math.floor(currentY / itemHeight);
    if (currentRow !== prevRow) {
      prevRow = currentRow;
      playTick();
    }
    list.style.transform = "translateY(-" + currentY + "px)";

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      list.style.transform = "translateY(-" + landY + "px)";
      stopTicking();

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          highlightItem(list, baseIndex);
          wireButtons(overlay, winnerName);
        });
      });
    }
  }

  requestAnimationFrame(step);
}

// --------------- event listener ---------------

function onSpinEvent(e) {
  let names =
    e && e.detail && Array.isArray(e.detail.names) ? e.detail.names : null;

  if (!names || names.length === 0) {
    try {
      names = getNames();
    } catch (_) {
      /* ignore */
    }
  }

  if (!names || names.length === 0) {
    announce("No names to spin.");
    return;
  }

  runSpin(names);
}

window.addEventListener(SPIN_EVENT, onSpinEvent);

// --------------- exports ---------------

export function spinWith(names) {
  if (!Array.isArray(names)) names = [];
  window.dispatchEvent(new CustomEvent(SPIN_EVENT, { detail: { names } }));
}
