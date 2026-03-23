import { it, expect, beforeEach, vi } from "vitest";

beforeEach(async () => {
  await import("../reel.js");
  // ensure announcements + winnerDisplay exist from setup
});

it("creates overlay and fires spin:end on OK", () => {
  const endHandler = vi.fn();
  window.addEventListener("takeapick:spin:end", endHandler);

  window.dispatchEvent(
    new CustomEvent("takeapick:spin", { detail: { names: ["A", "B"] } }),
  );

  const overlay = document.querySelector(".tap-reel-overlay");
  expect(overlay).toBeTruthy();

  const ok = overlay.querySelector("button");
  ok.click();

  expect(endHandler).toHaveBeenCalledWith(
    expect.objectContaining({
      detail: { winner: expect.any(String), removed: false },
    }),
  );
  expect(document.getElementById("winnerDisplay").textContent).not.toBe("");
});
