/*
take_a_pick - reel.js

Slot-machine reel overlay.

Contract with app.js
--------------------
- Listens for the custom event "takeapick:spin".
  • event.detail.names MUST be an array of plain strings, e.g. ["Alice","Bob","Charlie"].
- When the user clicks OK   → closes the modal.  List unchanged.
- When the user clicks Remove → calls window.takeAPick.removeName(winnerName)
  which removes the winner from the app's single authoritative list,
  then closes the modal.
- Emits "takeapick:spin:start" and "takeapick:spin:end" custom events.
*/

(function () {
  "use strict";

  // --------------- configuration ---------------
  const REPEATS = 10; // how many times the name list is repeated in the DOM
  const ITEM_HEIGHT = 56; // px per reel row
  const BASE_DURATION = 3000;
  const EXTRA_RANDOM = 900;
  const CYCLES = 3; // extra full-list cycles before landing

  const SPIN_EVENT = "takeapick:spin";
  const SPIN_BEGIN = "takeapick:spin:start";
  const SPIN_END = "takeapick:spin:end";

  // --------------- helpers ---------------

  function sanitize(s) {
    return String(s == null ? "" : s);
  }

  function easeOutCubic(t) {
    var u = 1 - t;
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
      var el = document.getElementById("announcements");
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
      var btn = document.getElementById("spin-button");
      if (btn) btn.disabled = !!disabled;
    } catch (_) {}
  }

  function startTickingSound() {
    try {
      var s = window.takeAPickSounds;
      if (s && typeof s.startTicking === "function") {
        s.startTicking();
      }
    } catch (_) {}
  }

  function stopTickingSound() {
    try {
      var s = window.takeAPickSounds;
      if (s && typeof s.stopTicking === "function") {
        s.stopTicking();
      }
    } catch (_) {}
  }

  // --------------- overlay DOM ---------------

  function createOverlay() {
    var overlay = document.createElement("div");
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

    var panel = document.createElement("div");
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

    var viewport = document.createElement("div");
    viewport.className = "tap-reel-viewport";
    Object.assign(viewport.style, {
      height: ITEM_HEIGHT * 3 + "px",
      overflow: "hidden",
      borderRadius: "8px",
      position: "relative",
    });

    var list = document.createElement("div");
    list.className = "tap-reel-list";
    Object.assign(list.style, {
      transform: "translateY(0px)",
      transition: "none",
      willChange: "transform",
    });

    list.dataset.revealed = "false";

    var pointer = document.createElement("div");
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

    var footer = document.createElement("div");
    Object.assign(footer.style, {
      display: "flex",
      justifyContent: "flex-end",
      gap: "8px",
      marginTop: "6px",
    });

    var btnStyle = {
      background: "transparent",
      color: "var(--muted, #94a3b8)",
      padding: "8px 12px",
      borderRadius: "8px",
      cursor: "pointer",
    };

    var okBtn = document.createElement("button");
    okBtn.textContent = "OK";
    Object.assign(okBtn.style, btnStyle);

    var removeBtn = document.createElement("button");
    removeBtn.textContent = "Remove";
    Object.assign(removeBtn.style, btnStyle);

    footer.appendChild(okBtn);
    footer.appendChild(removeBtn);

    viewport.appendChild(list);
    viewport.appendChild(pointer);
    panel.appendChild(viewport);
    panel.appendChild(footer);
    overlay.appendChild(panel);

    return { overlay: overlay, list: list, okBtn: okBtn, removeBtn: removeBtn };
  }

  // --------------- reel item rendering ---------------
  // names is a plain string array like ["Alice","Bob","Charlie"].
  // We repeat it REPEATS times so the reel has enough rows to scroll through.
  // Each "repeat" contains exactly N items, so item index = repeat * N + nameIndex.

  function buildReelItems(listEl, names, repeats) {
    listEl.innerHTML = "";
    var N = names.length;
    var frag = document.createDocumentFragment();

    for (var r = 0; r < repeats; r++) {
      for (var i = 0; i < N; i++) {
        var div = document.createElement("div");
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
    var items = listEl.querySelectorAll(".tap-reel-item");
    var target = items[itemIndex];
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
    stopTickingSound();
    setSpinButton(false);
  }

  function showWinnerInUI(winnerName) {
    try {
      var el = document.getElementById("winnerDisplay");
      if (el) el.textContent = sanitize(winnerName);
    } catch (_) {}
  }

  // --------------- wire OK / Remove buttons ---------------
  // winnerName is a plain string like "Alice".

  function wireButtons(overlayEl, winnerName) {
    var buttons = overlayEl.querySelectorAll("button");
    var okBtn = buttons[0];
    var removeBtn = buttons[1];

    if (okBtn) {
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
    }

    if (removeBtn) {
      removeBtn.onclick = function () {
        // Tell the app to remove this name from its authoritative list.
        var app = window.takeAPick;
        if (app && typeof app.removeName === "function") {
          app.removeName(winnerName);
        }
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
  }

  // --------------- main spin routine ---------------
  // names: plain string array, e.g. ["Alice", "Bob", "Charlie"]

  function runSpin(names) {
    if (!Array.isArray(names) || names.length === 0) {
      announce("No names provided.");
      return;
    }

    var N = names.length;
    var winnerIndex = Math.floor(Math.random() * N);
    var winnerName = names[winnerIndex];

    // build overlay
    var parts = createOverlay();
    var overlay = parts.overlay;
    var list = parts.list;
    document.body.appendChild(overlay);

    // populate reel rows: exactly N items per repeat, REPEATS repeats
    buildReelItems(list, names, REPEATS);

    // land with the selected winner in the center row of the reel
    const midRepeat = Math.floor(REPEATS / 2);
    const baseIndex = midRepeat * N + winnerIndex;
    const finalIndex = baseIndex;
    const finalY = finalIndex * ITEM_HEIGHT;

    const centerOffset = ITEM_HEIGHT; // keep the selected row centered in the viewport
    const landY = finalY - centerOffset;

    window.dispatchEvent(
      new CustomEvent(SPIN_BEGIN, {
        detail: { names: names, winnerIndex: winnerIndex },
      }),
    );
    announce("Spin started.");
    setSpinButton(true);
    startTickingSound();

    // ---- reduced motion: skip animation ----
    if (prefersReducedMotion()) {
      list.style.transform = "translateY(-" + landY + "px)";
      stopTickingSound();
      wireButtons(overlay, winnerName);
      return;
    }

    // ---- animated spin ----
    var duration = BASE_DURATION + Math.floor(Math.random() * EXTRA_RANDOM);
    var startTime = performance.now();
    var rafId = null;

    function step(now) {
      var elapsed = now - startTime;
      var t = Math.min(1, elapsed / duration);
      var eased = easeOutCubic(t);
      var currentY = eased * landY;
      list.style.transform = "translateY(-" + currentY + "px)";

      if (t < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        // ensure we land with the winner centered
        list.style.transform = "translateY(-" + landY + "px)";
        stopTickingSound();

        // reveal the winner only after the reel has fully stopped
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
    var names =
      e && e.detail && Array.isArray(e.detail.names) ? e.detail.names : null;

    // fallback: ask the app for its current list
    if (!names || names.length === 0) {
      try {
        var app = window.takeAPick;
        if (app && typeof app.getNames === "function") {
          names = app.getNames();
        }
      } catch (_) {}
    }

    if (!names || names.length === 0) {
      announce("No names to spin.");
      return;
    }

    runSpin(names);
  }

  window.addEventListener(SPIN_EVENT, onSpinEvent);

  // expose a helper for programmatic use / testing
  window.takeAPick = window.takeAPick || {};
  window.takeAPick.spinWith = function (names) {
    if (!Array.isArray(names)) names = [];
    window.dispatchEvent(
      new CustomEvent(SPIN_EVENT, { detail: { names: names } }),
    );
  };
})();
