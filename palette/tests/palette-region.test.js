import test from "node:test";
import assert from "node:assert/strict";
import {
  createPaletteRegionController,
  makeImageRegionRect,
  overlayRectForImageRegion
} from "../src/ui/palette-region.js";

function classList() {
  const classes = new Set();
  return {
    toggle(name, force) {
      if (force) classes.add(name);
      else classes.delete(name);
    },
    contains(name) {
      return classes.has(name);
    }
  };
}

function makeButton() {
  return {
    textContent: "",
    disabled: false,
    attrs: {},
    setAttribute(name, value) {
      this.attrs[name] = value;
    }
  };
}

test("palette region geometry clamps image selection and projects overlay rectangles", () => {
  assert.deepEqual(
    makeImageRegionRect({x: 90.2, y: -10}, {x: 10.4, y: 55.2}, {width: 100, height: 80}),
    {x: 10, y: 0, width: 81, height: 56}
  );

  assert.deepEqual(
    overlayRectForImageRegion({
      region: {x: 25, y: 20, width: 50, height: 40},
      imageWidth: 100,
      imageHeight: 100,
      displayRect: {left: 10, top: 20, width: 200, height: 100},
      shellRect: {left: 0, top: 0},
      centerX: 0.5,
      centerY: 0.5,
      spanX: 1,
      spanY: 1
    }),
    {left: 60, top: 40, width: 100, height: 40}
  );
});

test("palette region controller toggles, resets, and commits a dragged region", () => {
  let queued = 0;
  let paletteDirty = 0;
  const statuses = [];
  const history = [];
  const config = {paletteMode: "generatedReference", paletteRegionRect: null, showPaletteRegion: true};
  const state = {
    imageData: {width: 100, height: 80},
    sourceCanvas: {width: 100, height: 80},
    gl: {canvas: {width: 200, height: 160}},
    view: {centerX: 0.5, centerY: 0.5},
    paletteRegion: {enabled: false, dragging: false, pointerId: null, start: null, draftRect: null}
  };
  const overlayParent = {getBoundingClientRect: () => ({left: 0, top: 0})};
  const els = {
    canvas: {classList: classList(), setPointerCapture() {}},
    paletteMode: {value: "generatedReference"},
    selectPaletteRegion: makeButton(),
    clearPaletteRegion: makeButton(),
    paletteRegionNote: {textContent: ""},
    regionOverlay: {hidden: true, style: {}, parentElement: overlayParent}
  };
  const controller = createPaletteRegionController({
    els,
    state,
    config,
    getCanvasRenderSize: () => ({width: 200, height: 160, dpr: 1}),
    getViewRect: () => ({x: 0, y: 0, w: 200, h: 160}),
    getDisplayViewRect: () => ({left: 0, top: 0, width: 200, height: 160}),
    getViewSpan: () => [1, 1],
    clientPointToImagePixel: (clientX, clientY) => ({x: clientX / 2, y: clientY / 2}),
    cloneConfigSnapshot: () => ({before: true}),
    pushHistorySnapshot: (before, label) => history.push({before, label}),
    markPaletteDirty: () => paletteDirty++,
    updateConditionalPanels: () => {},
    queueRender: () => queued++,
    setStatus: message => statuses.push(message)
  });

  controller.togglePaletteRegionSelection();
  assert.equal(state.paletteRegion.enabled, true);
  assert.equal(els.selectPaletteRegion.textContent, "Drag on preview…");
  assert.equal(els.canvas.classList.contains("is-selecting-region"), false);

  const preventions = [];
  controller.beginPaletteRegionDrag({clientX: 20, clientY: 20, pointerId: 7, preventDefault: () => preventions.push("down")});
  controller.updatePaletteRegionDrag({clientX: 80, clientY: 60, pointerId: 7, preventDefault: () => preventions.push("move")});
  controller.finishPaletteRegionDrag({pointerId: 7, preventDefault: () => preventions.push("up")});

  assert.deepEqual(config.paletteRegionRect, {x: 10, y: 10, width: 30, height: 20});
  assert.equal(config.paletteMode, "generated");
  assert.equal(state.paletteRegion.enabled, false);
  assert.equal(paletteDirty, 1);
  assert.equal(queued, 1);
  assert.deepEqual(history, [{before: {before: true}, label: "Select palette region"}]);
  assert.equal(statuses.at(-1), "Palette now sampling selected region 30×20.");
  assert.deepEqual(preventions, ["down", "move", "up"]);

  controller.resetPaletteRegion({announce: true, dirty: true});
  assert.equal(config.paletteRegionRect, null);
  assert.equal(paletteDirty, 2);
  assert.equal(queued, 2);
  assert.equal(statuses.at(-1), "Using the full image for generated palettes.");
});
