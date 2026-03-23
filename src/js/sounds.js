/* take_a_pick - sounds.js (ES module)
 * Web Audio manager for spin button click and subtle reel ticking.
 * Exports: startTicking, stopTicking, setEnabled, resumeContext
 * Auto-wires on import (DOMContentLoaded).
 */

const AUDIO_SETTING_KEY = "takeapick:v1:audio";
const SPIN_BUTTON_ID = "spin-button";
const AUDIO_TOGGLE_ID = "audio-toggle";
const EVENT_SPIN = "takeapick:spin";
const EVENT_SPIN_START = "takeapick:spin:start";
const EVENT_SPIN_END = "takeapick:spin:end";

function readAudioEnabled() {
  try {
    const stored = localStorage.getItem(AUDIO_SETTING_KEY);
    if (stored === "0") return false;
    if (stored === "1") return true;
  } catch (_) {
    /* ignore */
  }
  return true;
}

class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = readAudioEnabled();
    this.tickTimer = null;
    this.tickTimeout = null;
    this.isTicking = false;
    this.unlockScheduled = false;
  }

  ensureContext() {
    if (!window.AudioContext && !window.webkitAudioContext) return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctor();
    }
    return this.ctx;
  }

  resumeContextFromGesture() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === "suspended" && !this.unlockScheduled) {
      this.unlockScheduled = true;
      Promise.resolve().then(() => {
        ctx
          .resume()
          .catch(() => {})
          .finally(() => {
            this.unlockScheduled = false;
          });
      });
    }
  }

  setEnabled(flag) {
    this.enabled = !!flag;
    if (!this.enabled) {
      this.stopTicking();
    }
  }

  playSpinClick() {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(520, now);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.08);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  playTick() {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(180, now);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  startTicking() {
    if (this.isTicking || !this.enabled) return;
    this.isTicking = true;
    this.resumeContextFromGesture();
    this.playTick();
    this.tickTimer = setInterval(() => this.playTick(), 95);
    this.tickTimeout = setTimeout(() => this.stopTicking(), 7000);
  }

  stopTicking() {
    if (!this.isTicking) return;
    this.isTicking = false;
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.tickTimeout) clearTimeout(this.tickTimeout);
    this.tickTimer = null;
    this.tickTimeout = null;
  }
}

const sounds = new SoundManager();

function wireSpinButton() {
  const btn = document.getElementById(SPIN_BUTTON_ID);
  if (!btn) return;
  btn.addEventListener("click", () => {
    sounds.resumeContextFromGesture();
  });
}

function wireAudioToggle() {
  const toggle = document.getElementById(AUDIO_TOGGLE_ID);
  if (!toggle) return;
  toggle.checked = sounds.enabled;
  toggle.addEventListener("change", () => {
    const enabled = !!toggle.checked;
    setEnabled(enabled);
  });
}

function wireReelEvents() {
  window.addEventListener(EVENT_SPIN_START, () => {
    sounds.startTicking();
  });
  window.addEventListener(EVENT_SPIN_END, () => {
    sounds.stopTicking();
  });
  window.addEventListener(EVENT_SPIN, () => {
    sounds.stopTicking();
  });
}

function init() {
  wireSpinButton();
  wireAudioToggle();
  wireReelEvents();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export function playTick() {
  sounds.playTick();
}

export function startTicking() {
  sounds.startTicking();
}

export function stopTicking() {
  sounds.stopTicking();
}

export function setEnabled(flag) {
  sounds.setEnabled(flag);
  try {
    localStorage.setItem(AUDIO_SETTING_KEY, flag ? "1" : "0");
  } catch (_) {
    /* ignore */
  }
}

export function resumeContext() {
  sounds.resumeContextFromGesture();
}
