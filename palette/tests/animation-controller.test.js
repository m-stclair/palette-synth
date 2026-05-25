import test from "node:test";
import assert from "node:assert/strict";
import { createAnimationExportController } from "../src/export/animation-controller.js";
import { positiveMod, gcdInt, clamp } from "../src/color-utils.js";

function makeState(records = [{}, {}, {}, {}]) {
  return {
    imageData: {width: 8, height: 4},
    sourceCanvas: {width: 8, height: 4},
    paletteRecords: records,
    animationExport: {
      exporting: false,
      frameCount: null,
      fps: 8,
      step: 1,
      prefix: "palette-synth-frame"
    }
  };
}

function makeElement() {
  return {value: "", textContent: "", disabled: false, hidden: false};
}

function makeController(overrides = {}) {
  const state = overrides.state || makeState();
  const config = overrides.config || {cycleOffset: 1, CYCLE_MODE: 2};
  return createAnimationExportController({
    els: overrides.els || {},
    state,
    config,
    clamp,
    cyclePeriod: records => Math.max(1, records.length || 1),
    gcdInt,
    positiveMod,
    normalizedCycleOffset: (offset, records) => positiveMod(Math.round(Number(offset) || 0), Math.max(1, records.length || 1)),
    manualCycleModeEnabled: overrides.manualCycleModeEnabled || (() => false),
    getPaletteRecords: overrides.getPaletteRecords || (() => state.paletteRecords),
    ensurePalette: overrides.ensurePalette || (() => {}),
    renderFullImageCanvas: overrides.renderFullImageCanvas || (() => ({tag: "canvas"})),
    setStatus: overrides.setStatus || (() => {}),
    downloadAnimationPngZipFn: overrides.downloadAnimationPngZipFn,
    downloadAnimationGifFn: overrides.downloadAnimationGifFn,
    now: overrides.now || (() => new Date("2026-05-16T12:00:00.000Z"))
  });
}

test("animation export controller syncs controls, clamps settings, and reports loop span", () => {
  const state = makeState([{}, {}, {}, {}, {}, {}]);
  state.animationExport.frameCount = 9999;
  state.animationExport.fps = 0;
  state.animationExport.step = 4;
  state.animationExport.prefix = " bad / prefix ";
  const els = {
    animFrameCount: makeElement(),
    animFps: makeElement(),
    animStep: makeElement(),
    animPrefix: makeElement(),
    animLoopInfo: makeElement(),
    exportAnimationZipButton: makeElement(),
    exportAnimationGifButton: makeElement(),
    animUseLoopSpan: makeElement()
  };

  const controller = makeController({state, els});

  controller.syncAnimationExportUi(state.paletteRecords);

  assert.equal(state.animationExport.frameCount, 1000);
  assert.equal(state.animationExport.fps, 8);
  assert.equal(state.animationExport.step, 4);
  assert.equal(state.animationExport.prefix, "bad---prefix");
  assert.equal(els.animFrameCount.value, "1000");
  assert.equal(els.animFps.value, "8");
  assert.equal(els.animStep.value, "4");
  assert.equal(els.animPrefix.value, "bad---prefix");
  assert.equal(els.animLoopInfo.textContent, "3 frames · middle · 1/6");
  assert.equal(els.exportAnimationZipButton.disabled, false);
  assert.equal(els.exportAnimationGifButton.disabled, false);
});

test("animation export controller uses current loop span on request", () => {
  const state = makeState([{}, {}, {}, {}, {}, {}]);
  state.animationExport.step = 4;
  const calls = [];
  const controller = makeController({state, setStatus: text => calls.push(text)});

  controller.useAnimationLoopSpan();

  assert.equal(state.animationExport.frameCount, 3);
  assert.deepEqual(calls, ["Animation frame count set to the current loop span: 3."]);
});

test("animation export controller builds frame plans with loop span", () => {
  const state = makeState([{}, {}, {}, {}, {}]);
  state.animationExport.frameCount = 3;
  state.animationExport.step = 2;
  state.animationExport.prefix = "frames";
  const controller = makeController({state, config: {cycleOffset: 4, CYCLE_MODE: 0}});

  const plan = controller.buildAnimationFramePlan(null, state.paletteRecords);

  assert.equal(plan.loopSpan, 5);
  assert.deepEqual(plan.frames.map(frame => frame.cycleOffset), [4, 1, 3]);
  assert.deepEqual(plan.frames.map(frame => frame.filename), [
    "frames_0001.png",
    "frames_0002.png",
    "frames_0003.png"
  ]);
});

test("animation export controller refuses export before an image is loaded", async () => {
  const state = makeState();
  state.imageData = null;
  const calls = [];
  const controller = makeController({state, setStatus: text => calls.push(text)});

  await controller.exportAnimationPngZip();

  assert.deepEqual(calls, ["Open an image first, then export animation frames."]);
});

test("animation export controller exports png zip plans and manifest", async () => {
  const state = makeState([{}, {}, {}, {}]);
  state.animationExport.frameCount = 2;
  state.animationExport.fps = 12;
  state.animationExport.step = 2;
  state.animationExport.prefix = "demo";
  const els = {
    error: makeElement(),
    exportAnimationZipButton: makeElement(),
    exportAnimationGifButton: makeElement(),
    animUseLoopSpan: makeElement(),
    animFrameCount: makeElement(),
    animFps: makeElement(),
    animStep: makeElement(),
    animPrefix: makeElement()
  };
  const calls = [];
  const controller = makeController({
    state,
    els,
    config: {cycleOffset: 1, CYCLE_MODE: 3},
    ensurePalette: () => calls.push(["ensurePalette"]),
    renderFullImageCanvas: options => {
      calls.push(["render", options]);
      return {tag: "canvas", options};
    },
    setStatus: text => calls.push(["status", text]),
    downloadAnimationPngZipFn: async payload => {
      calls.push(["download", payload.plan, payload.manifest]);
      payload.onProgress(payload.plan.frames[0], payload.plan.frames.length);
      payload.renderFrameCanvas(payload.plan.frames[0]);
    }
  });

  await controller.exportAnimationPngZip();

  assert.deepEqual(calls[0], ["ensurePalette"]);
  assert.equal(calls[1][0], "download");
  assert.equal(calls[1][1].frameCount, 2);
  assert.deepEqual(calls[1][1].frames.map(frame => frame.cycleOffset), [1, 3]);
  assert.equal(calls[1][2].exportedAt, "2026-05-16T12:00:00.000Z");
  assert.equal(calls[1][2].width, 8);
  assert.equal(calls[1][2].height, 4);
  assert.equal(calls[1][2].cycleMode, 3);
  assert.deepEqual(calls[2], ["status", "Rendering PNG frame 1/2…"]);
  assert.deepEqual(calls[3], ["render", {cycleOffset: 1, records: state.paletteRecords}]);
  assert.deepEqual(calls.at(-1), ["status", "Exported 2 PNG frames as demo.zip."]);
  assert.equal(state.animationExport.exporting, false);
  assert.equal(els.error.hidden, true);
  assert.equal(els.exportAnimationZipButton.disabled, false);
  assert.equal(els.exportAnimationGifButton.disabled, false);
});

test("animation export controller exports gif plans through the same path", async () => {
  const state = makeState([{}, {}, {}, {}]);
  state.animationExport.frameCount = 2;
  state.animationExport.fps = 10;
  state.animationExport.step = 1;
  state.animationExport.prefix = "demo-gif";
  const els = {
    error: makeElement(),
    exportAnimationZipButton: makeElement(),
    exportAnimationGifButton: makeElement(),
    animUseLoopSpan: makeElement(),
    animFrameCount: makeElement(),
    animFps: makeElement(),
    animStep: makeElement(),
    animPrefix: makeElement()
  };
  const calls = [];
  const controller = makeController({
    state,
    els,
    renderFullImageCanvas: options => {
      calls.push(["render", options]);
      return {tag: "canvas", options};
    },
    setStatus: text => calls.push(["status", text]),
    downloadAnimationGifFn: async payload => {
      calls.push(["gif", payload.plan, payload.manifest]);
      payload.onProgress(payload.plan.frames[1], payload.plan.frames.length);
      payload.renderFrameCanvas(payload.plan.frames[1]);
    }
  });

  await controller.exportAnimationGif();

  assert.equal(calls[0][0], "gif");
  assert.equal(calls[0][1].prefix, "demo-gif");
  assert.equal(calls[0][1].fps, 10);
  assert.deepEqual(calls[0][1].frames.map(frame => frame.filename), [
    "demo-gif_0001.png",
    "demo-gif_0002.png"
  ]);
  assert.equal(calls[0][2].kind, "palette-synth-animated-gif");
  assert.equal(calls[0][2].frameCount, 2);
  assert.deepEqual(calls[1], ["status", "Rendering GIF frame 2/2…"]);
  assert.deepEqual(calls[2], ["render", {cycleOffset: 2, records: state.paletteRecords}]);
  assert.deepEqual(calls.at(-1), ["status", "Exported 2 GIF frames as demo-gif.gif."]);
  assert.equal(state.animationExport.exporting, false);
  assert.equal(els.exportAnimationZipButton.disabled, false);
  assert.equal(els.exportAnimationGifButton.disabled, false);
});

test("animation export controller reports export failures", async () => {
  const state = makeState();
  state.animationExport.frameCount = 1;
  const els = {error: makeElement()};
  const calls = [];
  const controller = makeController({
    state,
    els,
    setStatus: text => calls.push(text),
    downloadAnimationPngZipFn: async () => {
      throw new Error("disk full");
    }
  });

  await controller.exportAnimationPngZip();

  assert.equal(els.error.hidden, false);
  assert.equal(els.error.textContent, "Animation export failed: disk full");
  assert.equal(calls.includes("Animation export failed: disk full"), true);
  assert.equal(state.animationExport.exporting, false);
});
