import { describe, it, expect, beforeEach, vi } from "vitest";

let app;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  app = await import("../app.js");
  document.dispatchEvent(new Event("DOMContentLoaded"));
});

it("dedupes and trims names when preparing final list", async () => {
  const { prepareFinalNames, getNames } = app;
  // Simulate state by interacting through trailing input
  const trailingInput = document.querySelector("#chip-input-slot .chip-input");
  trailingInput.value = " Alice ";
  trailingInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  trailingInput.value = "alice";
  trailingInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  trailingInput.value = "Bob";
  trailingInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

  const names = prepareFinalNames();
  expect(names).toEqual(["Alice", "Bob"]);
  expect(getNames()).toEqual(["Alice", "Bob"]);
});

it("dispatches takeapick:spin with deduped names", async () => {
  const spinHandler = vi.fn();
  const { getNames } = app;
  window.addEventListener("takeapick:spin", spinHandler);

  const spinBtn = document.getElementById("spin-button");
  // add two unique names
  const input = document.querySelector("#chip-input-slot .chip-input");
  input.value = "A";
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  input.value = "B";
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

  spinBtn.click();
  expect(spinHandler).toHaveBeenCalledTimes(1);
  const payload = spinHandler.mock.calls[0][0].detail.names;
  expect(payload).toEqual(["A", "B"]);
  expect(getNames()).toEqual(["A", "B"]);
});
