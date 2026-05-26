import test from "node:test";
import assert from "node:assert/strict";
import { createConditionalPanelsController } from "../src/app/conditional-panels.js";
import { createStatusController } from "../src/app/status-controller.js";

test("conditional panels normalize palette mode, sync datasets, and refresh dependents", () => {
  const calls = [];
  const config = {paletteMode: "preset", assignMode: "blend", outputMode: "preserveLuma"};
  const state = {paletteRegion: {enabled: true, dragging: false}};
  const els = {paletteMode: {value: "preset"}};
  const root = {body: {dataset: {}}};
  const controller = createConditionalPanelsController({
    config,
    state,
    els,
    root,
    manualCycleModeEnabled: () => false,
    cancelPaletteRegionDrag: options => calls.push(["cancel", options]),
    closeManualPaletteEditor: () => calls.push(["close"]),
    updateGeneratedLockUi: () => calls.push(["locks"]),
    updateCapturePaletteUi: () => calls.push(["capture"]),
    syncCycleControls: () => calls.push(["cycle"]),
    updatePaletteRegionUi: () => calls.push(["region-ui"]),
    updatePaletteRegionOverlay: () => calls.push(["region-overlay"])
  });

  controller.updateConditionalPanels();

  assert.equal(config.paletteMode, "manual");
  assert.equal(els.paletteMode.value, "manual");
  assert.deepEqual(root.body.dataset, {
    paletteMode: "manual",
    assignMode: "blend",
    outputMode: "preserveLuma",
    generatedTintShadeFamilies: "true",
    cosineCustomTintShadeFamilies: "true"
  });
  assert.deepEqual(calls, [
    ["cancel", {announce: false}],
    ["locks"],
    ["capture"],
    ["cycle"],
    ["region-ui"],
    ["region-overlay"]
  ]);
});

test("status controller reports idle and transient status text", () => {
  const classes = new Set();
  const els = {
    status: {
      textContent: "",
      classList: {
        toggle(name, force) {
          if (force) classes.add(name);
          else classes.delete(name);
        }
      }
    }
  };
  const state = {imageData: null};
  const controller = createStatusController({els, state});

  controller.setStatus();
  assert.equal(els.status.textContent, "Open image");
  assert.equal(classes.has("is-transient"), false);

  controller.setStatus("Copied #fff");
  assert.equal(els.status.textContent, "Copied #fff");
  assert.equal(classes.has("is-transient"), true);

  state.imageData = {width: 1, height: 1};
  controller.setStatus();
  assert.equal(els.status.textContent, "Ready");
  assert.equal(classes.has("is-transient"), false);
});
