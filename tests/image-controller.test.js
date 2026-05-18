import test from "node:test";
import assert from "node:assert/strict";
import { cloneDefaultConfig } from "../src/state/config.js";
import { createImageController, scaledBitmapSize } from "../src/runtime/image-controller.js";

function makeCanvas(name) {
  const calls = [];
  return {
    name,
    width: 0,
    height: 0,
    calls,
    getContext(type, options) {
      calls.push(["getContext", type, options]);
      return {
        clearRect: (...args) => calls.push(["clearRect", ...args]),
        drawImage: (...args) => calls.push(["drawImage", ...args])
      };
    }
  };
}

function makeState() {
  return {
    maxImageSide: 100,
    originalCanvas: makeCanvas("original"),
    originalSourceVersion: 0,
    sourceCanvas: makeCanvas("source"),
    referenceOriginalCanvas: makeCanvas("referenceOriginal"),
    referenceOriginalSourceVersion: 0,
    referenceCanvas: makeCanvas("reference"),
    sourceLevelsDirty: false,
    referenceLevelsDirty: false,
    imageData: null,
    referenceImageData: null,
    referenceImageName: ""
  };
}

function makeController(overrides = {}) {
  const calls = [];
  const state = overrides.state || makeState();
  const config = overrides.config || cloneDefaultConfig();
  const controller = createImageController({
    state,
    config,
    els: overrides.els || {},
    root: overrides.root || {getElementById: () => null},
    Image: overrides.Image || class {},
    URL: overrides.URL || {createObjectURL: () => "blob:test", revokeObjectURL: () => calls.push("revoke")},
    cloneConfigSnapshot: () => ({before: true}),
    pushHistorySnapshot: (...args) => calls.push(["history", ...args]),
    ensureLevelAdjustedSources: () => {
      calls.push("levels");
      if (state.sourceLevelsDirty) state.imageData = {width: state.sourceCanvas.width, height: state.sourceCanvas.height};
      if (state.referenceLevelsDirty) state.referenceImageData = {width: state.referenceCanvas.width, height: state.referenceCanvas.height};
    },
    resetPaletteRegion: (...args) => calls.push(["resetPaletteRegion", ...args]),
    resetView: (...args) => calls.push(["resetView", ...args]),
    markEverythingDirty: () => calls.push("markEverythingDirty"),
    markPaletteDirty: () => calls.push("markPaletteDirty"),
    updateConditionalPanels: () => calls.push("updateConditionalPanels"),
    queueRender: () => calls.push("queueRender"),
    setStatus: text => calls.push(["status", text]),
    ...overrides.deps
  });
  return {controller, state, config, calls};
}

test("scaledBitmapSize caps the longest side and preserves aspect", () => {
  assert.deepEqual(scaledBitmapSize({width: 400, height: 200}, 100), {width: 100, height: 50});
  assert.deepEqual(scaledBitmapSize({naturalWidth: 80, naturalHeight: 40}, 100), {width: 80, height: 40});
  assert.deepEqual(scaledBitmapSize({}, 100), {width: 1, height: 1});
});

test("image controller loads the primary bitmap source and invalidates the render path", () => {
  const {controller, state, calls} = makeController();

  controller.loadImageFromBitmapSource({width: 400, height: 200}, "sample.png");

  assert.equal(state.originalCanvas.width, 100);
  assert.equal(state.originalCanvas.height, 50);
  assert.equal(state.sourceCanvas.width, 100);
  assert.equal(state.sourceCanvas.height, 50);
  assert.equal(state.sourceLevelsDirty, true);
  assert.equal(state.originalSourceVersion, 1);
  assert.deepEqual(state.imageData, {width: 100, height: 50});
  assert.equal(state.originalCanvas.calls.at(-1)[0], "drawImage");
  assert.deepEqual(calls, [
    "levels",
    ["resetPaletteRegion", {announce: false, dirty: false}],
    ["resetView", false],
    "markEverythingDirty",
    ["status", "sample.png: 100×50"],
    "queueRender"
  ]);
});

test("image controller loads reference bitmaps, switches palette mode, and updates status", () => {
  const referenceStatus = {textContent: ""};
  const paletteMode = {value: "generated"};
  const {controller, state, config, calls} = makeController({els: {referenceImageStatus: referenceStatus, paletteMode}});

  controller.loadReferenceImageFromBitmapSource({width: 50, height: 25}, "ref.jpg");

  assert.equal(state.referenceOriginalCanvas.width, 50);
  assert.equal(state.referenceCanvas.height, 25);
  assert.equal(state.referenceImageName, "ref.jpg");
  assert.equal(state.referenceOriginalSourceVersion, 1);
  assert.deepEqual(state.referenceImageData, {width: 50, height: 25});
  assert.equal(config.paletteMode, "generatedReference");
  assert.equal(paletteMode.value, "generatedReference");
  assert.equal(referenceStatus.textContent, "ref.jpg: 50×25");
  assert.deepEqual(calls, [
    "levels",
    "markPaletteDirty",
    "updateConditionalPanels",
    ["status", "Reference ref.jpg: 50×25"],
    "queueRender"
  ]);
});

test("image controller file loaders wire object URLs, history, success, and error paths", () => {
  const images = [];
  class FakeImage {
    constructor() {
      this.width = 20;
      this.height = 10;
      images.push(this);
    }
  }
  const urlCalls = [];
  const URL = {
    createObjectURL: file => {
      urlCalls.push(["create", file.name]);
      return `blob:${file.name}`;
    },
    revokeObjectURL: url => urlCalls.push(["revoke", url])
  };
  const {controller, calls} = makeController({Image: FakeImage, URL});

  controller.loadReferenceFile({name: "ref.png"});
  assert.equal(images[0].src, "blob:ref.png");
  images[0].onload();

  assert.deepEqual(urlCalls, [["create", "ref.png"], ["revoke", "blob:ref.png"]]);
  assert.deepEqual(calls.filter(call => Array.isArray(call) && call[0] === "history"), [
    ["history", {before: true}, "Load reference image"]
  ]);

  controller.loadFile({name: "bad.png"});
  images[1].onerror();
  assert.deepEqual(urlCalls.at(-2), ["create", "bad.png"]);
  assert.deepEqual(urlCalls.at(-1), ["revoke", "blob:bad.png"]);
  assert.deepEqual(calls.at(-1), ["status", "Could not load that image."]);
});
