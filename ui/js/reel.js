import { removeName, getNames } from "./app.js";
import { startTicking, stopTicking } from "./sounds.js";

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
const ITEM_HEIGHT = 56; // px per reel row
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
  } catch (_) {}
}

function setSpinButton(disabled) {
  try {
    const btn = document.getElementById("spin-button");
    if (btn) btn.disabled = !!disabled;
  } catch (_) {}
}

// --------------- overlay DOM ---------------

function createOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "tap-reel-overlay";
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: "24px",
    boxSizing: "border-box",
  });

  const panel = document.createElement("div");
  panel.className = "tap-reel-panel";
  Object.assign(panel.style, {
    width: "min(520px, 96%)",
    maxWidth: "92vw",
    borderRadius: "12px",
    padding: "18px",
    boxSizing: "border-box",
    display: "flex",
    gap: "12px",
    flexDirection: "column",
    alignItems: "stretch",
  });

  const viewport = document.createElement("div");
  viewport.className = "tap-reel-viewport";
  Object.assign(viewport.style, {
    height: ITEM_HEIGHT * 3 + "px",
    overflow: "hidden",
    borderRadius: "8px",
    position: "relative",
  });

  const list = document.createElement("div");
  list.className = "tap-reel-list";
  Object.assign(list.style, {
    transform: "translateY(0px)",
    transition: "none",
    willChange: "transform",
  });

  list.dataset.revealed = "false";

  const pointer = document.createElement("div");
  pointer.className = "tap-reel-pointer";
  Object.assign(pointer.style, {
    position: "absolute",
    left: "0",
    right: "0",
    height: ITEM_HEIGHT + "px",
    top: "calc(50% - " + ITEM_HEIGHT / 2 + "px)",
    pointerEvents: "none",
    boxSizing: "border-box",
  });

  const footer = document.createElement("div");
  Object.assign(footer.style, {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
    marginTop: "6px",
  });

  const btnStyle = {
    background: "transparent",
    color: "var(--muted, #94a3b8)",
    padding: "8px 12px",
    borderRadius: "8px",
    cursor: "pointer",
  };

  const okBtn = document.createElement("button");
  okBtn.textContent = "OK";
  Object.assign(okBtn.style, btnStyle);

  const removeBtn = document.createElement("button");
  removeBtn.textContent = "Remove";
  Object.assign(removeBtn.style, btnStyle);

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
      Object.assign(div.style, {
        height: ITEM_HEIGHT + "px",
        lineHeight: ITEM_HEIGHT + "px",
        padding: "0 12px",
        boxSizing: "border-box",
        fontSize: "16px",
        display: "block",
      });
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
  } catch (_) {}
  stopTicking();
  setSpinButton(false);
}

function showWinnerInUI(winnerName) {
  try {
    const el = document.getElementById("winnerDisplay");
    if (el) el.textContent = sanitize(winnerName);
  } catch (_) {}
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

  const parts = createOverlay();
  const overlay = parts.overlay;
  const list = parts.list;
  document.body.appendChild(overlay);

  buildReelItems(list, names, REPEATS);

  const midRepeat = Math.floor(REPEATS / 2);
  const baseIndex = midRepeat * N + winnerIndex;
  const finalIndex = baseIndex;
  const finalY = finalIndex * ITEM_HEIGHT;

  const centerOffset = ITEM_HEIGHT;
  const landY = finalY - centerOffset;

  window.dispatchEvent(
    new CustomEvent(SPIN_BEGIN, {
      detail: { names, winnerIndex },
    }),
  );
  announce("Spin started.");
  setSpinButton(true);
  startTicking();

  if (prefersReducedMotion()) {
    list.style.transform = "translateY(-" + landY + "px)";
    stopTicking();
    wireButtons(overlay, winnerName);
    return;
  }

  const duration = BASE_DURATION + Math.floor(Math.random() * EXTRA_RANDOM);
  const startTime = performance.now();
  let rafId = null;

  function step(now) {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / duration);
    const eased = easeOutCubic(t);
    const currentY = eased * landY;
    list.style.transform = "translateY(-" + currentY + "px)";

    if (t < 1) {
      rafId = requestAnimationFrame(step);
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

  rafId = requestAnimationFrame(step);
}

// --------------- event listener ---------------

function onSpinEvent(e) {
  let names =
    e && e.detail && Array.isArray(e.detail.names) ? e.detail.names : null;

  if (!names || names.length === 0) {
    try {
      names = getNames();
    } catch (_) {}
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
