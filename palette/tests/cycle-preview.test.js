import test from "node:test";
import assert from "node:assert/strict";
import { createCyclePreviewController } from "../src/runtime/cycle-preview.js";
import { positiveMod } from "../src/color-utils.js";

function makeState(records = [{}, {}, {}]) {
  return {
    paletteRecords: records,
    cycleAnimation: {
      playing: false,
      frameHandle: null,
      lastTick: 0
    }
  };
}

function makeElement() {
  return {value: "", max: "", textContent: ""};
}

function normalizedCycleOffset(offset, records) {
  const period = records.length || 1;
  return positiveMod(Math.round(Number(offset) || 0), period);
}

test("cycle preview syncs offset controls and animation export UI", () => {
  const state = makeState([{}, {}, {}, {}]);
  const config = {cycleOffset: -1, cyclePreviewSpeed: 3.25};
  const els = {
    cycleOffset: makeElement(),
    cycleOffsetValue: makeElement(),
    cyclePreviewToggle: makeElement(),
    cyclePreviewSpeedValue: makeElement()
  };
  const calls = [];
  const controller = createCyclePreviewController({
    els,
    state,
    config,
    cyclePeriod: records => records.length,
    normalizedCycleOffset: offset => positiveMod(Math.round(offset), state.paletteRecords.length),
    positiveMod,
    syncAnimationExportUi: records => calls.push(["syncAnimationExportUi", records])
  });

  controller.syncCycleControls(state.paletteRecords);

  assert.equal(config.cycleOffset, 3);
  assert.equal(els.cycleOffset.max, "3");
  assert.equal(els.cycleOffset.value, "3");
  assert.equal(els.cycleOffsetValue.textContent, "3");
  assert.equal(els.cyclePreviewToggle.textContent, "Play preview");
  assert.equal(els.cyclePreviewSpeedValue.textContent, "3.3 steps/s");
  assert.deepEqual(calls, [["syncAnimationExportUi", state.paletteRecords]]);
});

test("cycle preview starts, stops, and cancels the queued frame", () => {
  const state = makeState([{}]);
  const config = {cycleOffset: 0, cyclePreviewSpeed: 4};
  const els = {cyclePreviewToggle: makeElement()};
  const calls = [];
  const controller = createCyclePreviewController({
    els,
    state,
    config,
    cyclePeriod: records => records.length,
    normalizedCycleOffset,
    positiveMod,
    manualCycleModeEnabled: () => false,
    setStatus: text => calls.push(["status", text]),
    requestAnimationFrame: callback => {
      calls.push(["request", callback]);
      return `frame-${calls.length}`;
    },
    cancelAnimationFrame: handle => calls.push(["cancel", handle])
  });

  controller.toggleCyclePreview();

  assert.equal(state.cycleAnimation.playing, true);
  assert.equal(els.cyclePreviewToggle.textContent, "Pause preview");
  assert.equal(state.cycleAnimation.frameHandle, "frame-2");
  assert.deepEqual(calls[0], ["status", "Preview running; the current cycle region has one color."]);
  assert.equal(calls[1][0], "request");

  controller.toggleCyclePreview();

  assert.equal(state.cycleAnimation.playing, false);
  assert.equal(state.cycleAnimation.lastTick, 0);
  assert.equal(state.cycleAnimation.frameHandle, null);
  assert.equal(els.cyclePreviewToggle.textContent, "Play preview");
  assert.deepEqual(calls.at(-1), ["cancel", "frame-2"]);
});

test("cycle preview frame advances offsets, dirties manual palettes, and queues render", () => {
  const state = makeState([{}, {}, {}, {}]);
  const config = {cycleOffset: 0, cyclePreviewSpeed: 4};
  const calls = [];
  const queuedFrames = [];
  let nextFrameHandle = 0;
  const controller = createCyclePreviewController({
    els: {},
    state,
    config,
    cyclePeriod: records => records.length,
    normalizedCycleOffset,
    positiveMod,
    manualCycleModeEnabled: () => true,
    markPaletteDirty: options => calls.push(["markPaletteDirty", options]),
    queueRender: () => calls.push(["queueRender"]),
    syncAnimationExportUi: () => calls.push(["syncAnimationExportUi"]),
    requestAnimationFrame: callback => {
      queuedFrames.push(callback);
      nextFrameHandle += 1;
      return nextFrameHandle;
    },
    cancelAnimationFrame: () => {}
  });

  controller.toggleCyclePreview();
  queuedFrames.shift()(1000);
  queuedFrames.shift()(1250);

  assert.equal(config.cycleOffset, 1);
  assert.deepEqual(calls.slice(-3), [
    ["syncAnimationExportUi"],
    ["markPaletteDirty", {swatches: false}],
    ["queueRender"]
  ]);
  assert.equal(state.cycleAnimation.frameHandle, 3);
});
