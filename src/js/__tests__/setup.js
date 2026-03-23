import { vi } from "vitest";

beforeEach(() => {
  // Minimal DOM scaffold expected by app.js bootstrap
  document.body.innerHTML = `
    <div id="chips-container"></div>
    <div id="chip-input-slot"></div>
    <button id="spin-button"></button>
    <button id="clear-button"></button>
    <input type="checkbox" id="audio-toggle" />
    <div id="announcements"></div>
    <div id="namesCount"></div>
    <div id="chips-warning"></div>
    <div id="winnerDisplay"></div>
    <button class="theme-button"><img class="theme-icon" /></button>
    <button class="theme-option" data-theme="system"></button>
    <button class="theme-option" data-theme="light"></button>
    <button class="theme-option" data-theme="dark"></button>
  `;
  // Reduced-motion for deterministic reel tests
  window.matchMedia = vi.fn().mockImplementation((q) => ({
    matches: q.includes("reduce"),
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  // AudioContext stub
  class FakeCtx {
    constructor() {
      this.currentTime = 0;
      this.state = "running";
    }
    createOscillator() {
      return {
        type: "",
        frequency: { setValueAtTime: vi.fn() },
        connect: () => ({ connect: () => ({}) }),
        start: vi.fn(),
        stop: vi.fn(),
      };
    }
    createGain() {
      return {
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: () => ({ connect: () => ({}) }),
      };
    }
  }
  window.AudioContext = FakeCtx;
  window.webkitAudioContext = FakeCtx;
  // Fresh localStorage
  localStorage.clear();
});
