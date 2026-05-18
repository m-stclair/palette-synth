import test from "node:test";
import assert from "node:assert/strict";
import { createCycleMaskController } from "../src/ui/cycle-mask.js";

function classList() {
  const classes = new Set();
  return {
    add(...names) {
      for (const name of names) classes.add(name);
    },
    remove(...names) {
      for (const name of names) classes.delete(name);
    },
    toggle(name, force) {
      if (force) classes.add(name);
      else classes.delete(name);
    },
    contains(name) {
      return classes.has(name);
    }
  };
}

function fakeContext() {
  const calls = [];
  return {
    calls,
    save: () => calls.push(["save"]),
    restore: () => calls.push(["restore"]),
    clearRect: (...args) => calls.push(["clearRect", ...args]),
    beginPath: () => calls.push(["beginPath"]),
    arc: (...args) => calls.push(["arc", ...args]),
    fill: () => calls.push(["fill"]),
    moveTo: (...args) => calls.push(["moveTo", ...args]),
    lineTo: (...args) => calls.push(["lineTo", ...args]),
    stroke: () => calls.push(["stroke"]),
    drawImage: (...args) => calls.push(["drawImage", ...args]),
    fillRect: (...args) => calls.push(["fillRect", ...args]),
    set lineCap(value) { calls.push(["lineCap", value]); },
    set lineJoin(value) { calls.push(["lineJoin", value]); },
    set lineWidth(value) { calls.push(["lineWidth", value]); },
    set globalCompositeOperation(value) { calls.push(["globalCompositeOperation", value]); },
    set strokeStyle(value) { calls.push(["strokeStyle", value]); },
    set fillStyle(value) { calls.push(["fillStyle", value]); }
  };
}

function fakeCanvasElement() {
  const handlers = new Map();
  const ctx = fakeContext();
  return {
    width: 0,
    height: 0,
    hidden: false,
    style: {},
    dataset: {},
    classList: classList(),
    captured: [],
    parentElement: {getBoundingClientRect: () => ({left: 0, top: 0})},
    ownerDocument: null,
    getContext: () => ctx,
    setPointerCapture(pointerId) {
      this.captured.push(pointerId);
    },
    addEventListener(type, handler) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(handler);
    },
    dispatch(type, event = {}) {
      const fullEvent = {
        type,
        preventDefault() {
          this.defaultPrevented = true;
        },
        currentTarget: this,
        ...event
      };
      for (const handler of handlers.get(type) ?? []) handler(fullEvent);
      return fullEvent;
    },
    _ctx: ctx
  };
}

function fakeButton() {
  const handlers = new Map();
  return {
    textContent: "",
    disabled: false,
    attrs: {},
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    addEventListener(type, handler) {
      handlers.set(type, handler);
    },
    click(event = {}) {
      handlers.get("click")?.({target: this, ...event});
    }
  };
}

function fakeInput(value = "") {
  const handlers = new Map();
  return {
    value,
    checked: false,
    disabled: false,
    addEventListener(type, handler) {
      handlers.set(type, handler);
    },
    dispatch(type, event = {}) {
      handlers.get(type)?.({target: this, ...event});
    }
  };
}

test("cycle mask overlay becomes the active paint target while painting", () => {
  const createdCanvases = [];
  const doc = {
    createElement(name) {
      assert.equal(name, "canvas");
      const canvas = fakeCanvasElement();
      canvas.ownerDocument = doc;
      createdCanvases.push(canvas);
      return canvas;
    }
  };

  const previewCanvas = fakeCanvasElement();
  previewCanvas.ownerDocument = doc;
  const overlay = fakeCanvasElement();
  overlay.ownerDocument = doc;
  const statuses = [];
  let queued = 0;
  let dirty = 0;

  const state = {
    imageData: {width: 100, height: 80},
    gl: {canvas: {width: 200, height: 160}},
    view: {centerX: 0.5, centerY: 0.5},
    cycleMask: {
      enabled: false,
      paintMode: "off",
      showOverlay: true,
      dragging: false,
      pointerId: null,
      lastPoint: null,
      brushSize: 24,
      canvas: null,
      ctx: null,
      texture: null,
      textureDirty: true,
      hasPaint: false
    }
  };

  const els = {
    canvas: previewCanvas,
    cycleMaskOverlay: overlay,
    cycleMaskEnabled: fakeInput(),
    cycleMaskPaint: fakeButton(),
    cycleMaskShow: fakeInput(),
    cycleMaskErase: fakeButton(),
    cycleMaskClear: fakeButton(),
    cycleMaskBrushSize: fakeInput("24"),
    cycleMaskBrushSizeValue: {textContent: ""},
    cycleMaskNote: {textContent: ""}
  };

  const controller = createCycleMaskController({
    els,
    state,
    getCanvasRenderSize: () => ({width: 200, height: 160, dpr: 1}),
    getViewRect: () => ({x: 0, y: 0, w: 200, h: 160}),
    getDisplayViewRect: () => ({left: 0, top: 0, width: 200, height: 160}),
    getViewSpan: () => [1, 1],
    clientPointToImagePixel: (clientX, clientY) => ({x: clientX / 2, y: clientY / 2}),
    markMaskDirty: () => dirty++,
    queueRender: () => queued++,
    setStatus: message => statuses.push(message)
  });

  controller.bindCycleMaskControls();
  els.cycleMaskPaint.click();

  assert.equal(state.cycleMask.paintMode, "paint");
  assert.equal(state.cycleMask.enabled, true);
  assert.equal(overlay.hidden, false);
  assert.equal(overlay.classList.contains("is-painting-mask"), true);
  assert.equal(previewCanvas.classList.contains("is-painting-mask"), true);
  assert.equal(createdCanvases.length, 1);

  const down = overlay.dispatch("pointerdown", {button: 0, pointerId: 9, clientX: 20, clientY: 30});
  assert.equal(down.defaultPrevented, true);
  assert.equal(state.cycleMask.dragging, true);
  assert.equal(state.cycleMask.pointerId, 9);
  assert.equal(state.cycleMask.hasPaint, true);
  assert.deepEqual(overlay.captured, [9]);

  const move = overlay.dispatch("pointermove", {pointerId: 9, clientX: 40, clientY: 50});
  assert.equal(move.defaultPrevented, true);
  assert.equal(state.cycleMask.canvas._ctx.calls.some(call => call[0] === "stroke"), true);

  const up = overlay.dispatch("pointerup", {pointerId: 9});
  assert.equal(up.defaultPrevented, true);
  assert.equal(state.cycleMask.dragging, false);
  assert.equal(state.cycleMask.pointerId, null);
  assert.equal(queued > 0, true);
  assert.equal(dirty > 0, true);
  assert.equal(statuses.at(-1), "Paint the mask on the preview.");
});


test("cycle mask can hide its visible overlay while keeping the mask active", () => {
  const doc = {
    createElement(name) {
      assert.equal(name, "canvas");
      const canvas = fakeCanvasElement();
      canvas.ownerDocument = doc;
      return canvas;
    }
  };

  const previewCanvas = fakeCanvasElement();
  previewCanvas.ownerDocument = doc;
  const overlay = fakeCanvasElement();
  overlay.ownerDocument = doc;
  const statuses = [];

  const state = {
    imageData: {width: 100, height: 80},
    gl: {canvas: {width: 200, height: 160}},
    view: {centerX: 0.5, centerY: 0.5},
    cycleMask: {
      enabled: true,
      paintMode: "off",
      showOverlay: true,
      dragging: false,
      pointerId: null,
      lastPoint: null,
      brushSize: 24,
      canvas: null,
      ctx: null,
      texture: null,
      textureDirty: true,
      hasPaint: false
    }
  };

  const els = {
    canvas: previewCanvas,
    cycleMaskOverlay: overlay,
    cycleMaskEnabled: fakeInput(),
    cycleMaskPaint: fakeButton(),
    cycleMaskShow: fakeInput(),
    cycleMaskErase: fakeButton(),
    cycleMaskClear: fakeButton(),
    cycleMaskBrushSize: fakeInput("24"),
    cycleMaskBrushSizeValue: {textContent: ""},
    cycleMaskNote: {textContent: ""}
  };

  const controller = createCycleMaskController({
    els,
    state,
    getCanvasRenderSize: () => ({width: 200, height: 160, dpr: 1}),
    getViewRect: () => ({x: 0, y: 0, w: 200, h: 160}),
    getDisplayViewRect: () => ({left: 0, top: 0, width: 200, height: 160}),
    getViewSpan: () => [1, 1],
    clientPointToImagePixel: (clientX, clientY) => ({x: clientX / 2, y: clientY / 2}),
    setStatus: message => statuses.push(message)
  });

  controller.bindCycleMaskControls();
  controller.ensureMaskCanvas();
  state.cycleMask.hasPaint = true;
  controller.updateCycleMaskOverlay();

  assert.equal(overlay.hidden, false);
  assert.equal(els.cycleMaskShow.checked, true);

  els.cycleMaskShow.checked = false;
  els.cycleMaskShow.dispatch("change");

  assert.equal(state.cycleMask.enabled, true);
  assert.equal(state.cycleMask.showOverlay, false);
  assert.equal(overlay.hidden, true);
  assert.equal(statuses.at(-1), "Mask overlay hidden.");

  state.cycleMask.paintMode = "paint";
  controller.updateCycleMaskOverlay();

  assert.equal(overlay.hidden, false);
});
