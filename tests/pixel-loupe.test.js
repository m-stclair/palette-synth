import test from "node:test";
import assert from "node:assert/strict";
import { bindPixelLoupe } from "../src/ui/pixel-loupe.js";
import { rgb8ToLab } from "../src/color-utils.js";
import { OKLAB_SCALE } from "../src/constants.js";

function makeEventTarget(overrides = {}) {
  const listeners = new Map();
  return {
    listeners,
    classList: {
      values: new Set(),
      add(...names) { names.forEach(name => this.values.add(name)); },
      remove(...names) { names.forEach(name => this.values.delete(name)); },
      toggle(name, force) {
        const shouldAdd = force === undefined ? !this.values.has(name) : !!force;
        if (shouldAdd) this.values.add(name);
        else this.values.delete(name);
        return shouldAdd;
      },
      contains(name) { return this.values.has(name); }
    },
    style: {},
    setAttribute(name, value) { this[name] = String(value); },
    addEventListener(type, listener, options) {
      const bucket = listeners.get(type) || [];
      bucket.push({listener, options});
      listeners.set(type, bucket);
    },
    removeEventListener(type, listener) {
      const bucket = listeners.get(type) || [];
      listeners.set(type, bucket.filter(item => item.listener !== listener));
    },
    dispatch(type, event = {}) {
      for (const {listener} of listeners.get(type) || []) listener(event);
    },
    closest() { return null; },
    ...overrides
  };
}

function makeCanvas(document) {
  const ctx = {
    clearRect() {},
    createImageData(width, height) { return {width, height, data: new Uint8ClampedArray(width * height * 4)}; },
    putImageData(imageData) { document?.drawnPatches?.push(imageData); },
    drawImage() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    strokeStyle: "",
    lineWidth: 1,
    strokeRect(x, y, width, height) {
      document?.strokeRects?.push({x, y, width, height, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth});
    }
  };
  return makeEventTarget({
    width: 112,
    height: 112,
    ownerDocument: document,
    getContext() {
      return ctx;
    }
  });
}

function makeDocument() {
  const body = makeEventTarget({
    appendChild(child) { child.parentElement = this; }
  });
  const doc = makeEventTarget({
    body,
    drawnPatches: [],
    strokeRects: [],
    createElement(tagName) {
      if (tagName === "canvas") return makeCanvas(doc);
      return makeEventTarget({ownerDocument: doc});
    }
  });
  return doc;
}


function expectedOklabDiffByte(sourceRgb, finalRgb) {
  const sourceLab = rgb8ToLab(sourceRgb[0], sourceRgb[1], sourceRgb[2]);
  const finalLab = rgb8ToLab(finalRgb[0], finalRgb[1], finalRgb[2]);
  const amount = Math.min(1, Math.max(0, Math.hypot(
    finalLab[0] - sourceLab[0],
    finalLab[1] - sourceLab[1],
    finalLab[2] - sourceLab[2]
  ) / OKLAB_SCALE));
  return Math.round(amount * 255);
}

function rawRgbDiffByte(sourceRgb, finalRgb) {
  const amount = Math.min(1, Math.max(0, Math.hypot(
    finalRgb[0] - sourceRgb[0],
    finalRgb[1] - sourceRgb[1],
    finalRgb[2] - sourceRgb[2]
  ) / (Math.sqrt(3) * 255)));
  return Math.round(amount * 255);
}

function keyEvent(key, options = {}) {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: {closest: () => null},
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
    ...options
  };
}

function clickEvent(x = 1, y = 1) {
  return {
    clientX: x,
    clientY: y,
    defaultPrevented: false,
    propagationStopped: false,
    immediateStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
    stopImmediatePropagation() { this.immediateStopped = true; }
  };
}

function bindTestLoupe(overrides = {}) {
  const {config: configOverrides = {}, ...bindingOverrides} = overrides;
  const oldDocument = globalThis.document;
  const doc = makeDocument();
  globalThis.document = doc;
  const pane = makeEventTarget({ownerDocument: doc});
  const canvas = makeEventTarget({ownerDocument: doc});
  const pixelLoupeCanvas = makeCanvas(doc);
  const pin = makeEventTarget({ownerDocument: doc});
  const view = makeEventTarget({ownerDocument: doc, textContent: ""});
  const addSource = makeEventTarget({ownerDocument: doc, disabled: false});
  const diff = makeEventTarget({ownerDocument: doc});
  const expand = makeEventTarget({ownerDocument: doc, textContent: ""});
  const deltaRow = makeEventTarget({ownerDocument: doc, hidden: false});
  const delta = makeEventTarget({textContent: ""});
  const coord = makeEventTarget({textContent: ""});
  const source = makeEventTarget({textContent: ""});
  const fx = makeEventTarget({textContent: ""});
  const state = {
    diagnostics: {pixelLoupeOpen: true},
    imageData: {width: 4, height: 4, data: new Uint8ClampedArray(4 * 4 * 4).fill(255)}
  };
  const statuses = [];
  const inspected = [];
  const analyzed = [];
  const added = [];
  const binding = bindPixelLoupe({
    els: {
      pixelLoupePane: pane,
      canvas,
      pixelLoupeCanvas,
      pixelLoupePin: pin,
      pixelLoupeView: view,
      pixelLoupeAdd: addSource,
      pixelLoupeDiff: diff,
      pixelLoupeExpand: expand,
      pixelLoupeCoord: coord,
      pixelLoupeSource: source,
      pixelLoupeFx: fx,
      pixelLoupeSourceLch: makeEventTarget({textContent: ""}),
      pixelLoupeFxLch: makeEventTarget({textContent: ""}),
      pixelLoupeDeltaRow: deltaRow,
      pixelLoupeDelta: delta,
      pixelLoupeSourceSwatch: makeEventTarget(),
      pixelLoupeFxSwatch: makeEventTarget()
    },
    state,
    config: {blendAmount: 1, manualPalette: [], ...configOverrides},
    inspectLoupePixel: (clientX, clientY) => {
      inspected.push([clientX, clientY]);
      const pixel = {
        x: clientX,
        y: clientY,
        sourceHex: "#111111",
        sourceLab: [20, 1, 2],
        fxHex: "#222222",
        finalHex: "#333333",
        fxDelta: {luma: 1.234, chroma: 12.34, hue: 123.45},
        blendDelta: {luma: 2.345, chroma: 23.45, hue: 98.76}
      };
      state.diagnostics.pixelLoupe = pixel;
      return pixel;
    },
    analyzeLoupeImagePixel: (x, y) => {
      analyzed.push([x, y]);
      return {x, y, sourceHex: "#111111", fxHex: "#222222", finalHex: "#333333"};
    },
    clearLoupePixel: () => { state.diagnostics.pixelLoupe = null; },
    addPixelSourceToManualPalette: (pixel, options) => added.push([pixel, options]),
    setStatus: value => statuses.push(value),
    ...bindingOverrides
  });
  return {oldDocument, doc, pane, canvas, pixelLoupeCanvas, pin, view, addSource, diff, expand, deltaRow, delta, coord, state, statuses, inspected, analyzed, added, binding};
}

function cleanup(oldDocument) {
  if (oldDocument === undefined) delete globalThis.document;
  else globalThis.document = oldDocument;
}

test("pixel loupe space toggles frozen live sampling", () => {
  const t = bindTestLoupe();
  try {
    t.canvas.dispatch("pointermove", {clientX: 1, clientY: 2});
    assert.deepEqual(t.inspected, [[1, 2]]);

    const freeze = keyEvent(" ");
    t.doc.dispatch("keydown", freeze);
    assert.equal(freeze.defaultPrevented, true);
    assert.equal(t.state.diagnostics.pixelLoupeFrozen, true);
    assert.match(t.coord.textContent, /frozen/);

    t.canvas.dispatch("pointermove", {clientX: 3, clientY: 3});
    assert.deepEqual(t.inspected, [[1, 2]]);

    t.doc.dispatch("keydown", keyEvent(" "));
    assert.equal(t.state.diagnostics.pixelLoupeFrozen, false);
    assert.deepEqual(t.inspected.at(-1), [3, 3]);
  } finally {
    t.binding.destroy();
    cleanup(t.oldDocument);
  }
});

test("pixel loupe pin mode changes the sample by clicking", () => {
  const t = bindTestLoupe();
  try {
    t.pin.dispatch("click", {});
    assert.equal(t.state.diagnostics.pixelLoupePinMode, true);
    assert.equal(t.pin["aria-pressed"], "true");

    const firstClick = clickEvent(2, 1);
    t.canvas.dispatch("click", firstClick);
    assert.equal(firstClick.immediateStopped, false);
    assert.equal(firstClick.propagationStopped, false);
    assert.equal(t.state.diagnostics.pixelLoupePinned, true);
    assert.deepEqual(t.inspected, [[2, 1]]);

    t.canvas.dispatch("pointermove", {clientX: 3, clientY: 3});
    assert.deepEqual(t.inspected, [[2, 1]]);

    t.canvas.dispatch("click", clickEvent(0, 3));
    assert.deepEqual(t.inspected.at(-1), [0, 3]);

    t.pin.dispatch("click", {});
    assert.equal(t.state.diagnostics.pixelLoupePinMode, false);
    t.canvas.dispatch("pointermove", {clientX: 1, clientY: 1});
    assert.deepEqual(t.inspected.at(-1), [1, 1]);
  } finally {
    t.binding.destroy();
    cleanup(t.oldDocument);
  }
});

test("pixel loupe view button toggles source/final patch mode", () => {
  const t = bindTestLoupe();
  try {
    assert.equal(t.view.textContent, "Src");
    t.view.dispatch("click", {});
    assert.equal(t.state.diagnostics.pixelLoupeView, "final");
    assert.equal(t.view.textContent, "Final");
    assert.equal(t.view["aria-pressed"], "true");
    t.view.dispatch("click", {});
    assert.equal(t.state.diagnostics.pixelLoupeView, "source");
    assert.equal(t.view.textContent, "Src");
  } finally {
    t.binding.destroy();
    cleanup(t.oldDocument);
  }
});

test("pixel loupe final patch prepares one sampler for the canvas render", () => {
  let samplerFactories = 0;
  let sampleCalls = 0;
  const t = bindTestLoupe({
    createLoupePatchSampler: () => {
      samplerFactories += 1;
      return () => {
        sampleCalls += 1;
        return {r: 4, g: 5, b: 6};
      };
    }
  });
  try {
    t.view.dispatch("click", {});
    assert.equal(t.state.diagnostics.pixelLoupeView, "final");
    assert.equal(samplerFactories, 0);

    t.canvas.dispatch("pointermove", {clientX: 1, clientY: 2});

    assert.equal(samplerFactories, 1);
    assert.equal(sampleCalls, 16);
    assert.deepEqual(t.analyzed, []);
  } finally {
    t.binding.destroy();
    cleanup(t.oldDocument);
  }
});

test("pixel loupe add button adds the source color from the current loupe sample", () => {
  const t = bindTestLoupe();
  try {
    assert.equal(t.addSource.disabled, true);
    t.view.dispatch("click", {});
    assert.equal(t.state.diagnostics.pixelLoupeView, "final");

    t.canvas.dispatch("pointermove", {clientX: 1, clientY: 2});

    assert.equal(t.addSource.disabled, false);
    t.addSource.dispatch("click", {});
    assert.equal(t.added.length, 1);
    assert.equal(t.added[0][0].sourceHex, "#111111");
    assert.deepEqual(t.added[0][1], {sourceLabel: "loupe sample"});
  } finally {
    t.binding.destroy();
    cleanup(t.oldDocument);
  }
});

test("pixel loupe diff button toggles difference heatmap mode", () => {
  const t = bindTestLoupe();
  try {
    assert.equal(t.deltaRow.hidden, false);
    t.canvas.dispatch("pointermove", {clientX: 1, clientY: 2});
    assert.equal(t.delta.textContent, "ΔL 1.23 · ΔC 12.3 · ΔH 123");

    t.diff.dispatch("click", {});

    assert.equal(t.state.diagnostics.pixelLoupeDiff, true);
    assert.equal(t.diff["aria-pressed"], "true");
    assert.equal(t.deltaRow.hidden, false);
    assert.equal(t.pixelLoupeCanvas["aria-label"], "Magnified source-to-final difference heatmap");
    assert.equal(t.statuses.at(-1), "Loupe showing source-to-final difference heatmap.");

    t.diff.dispatch("click", {});

    assert.equal(t.state.diagnostics.pixelLoupeDiff, false);
    assert.equal(t.deltaRow.hidden, false);
    assert.match(t.statuses.at(-1), /Loupe difference heatmap off/);
  } finally {
    t.binding.destroy();
    cleanup(t.oldDocument);
  }
});


test("pixel loupe diff mode renders source-to-final OKLab distance in the patch", () => {
  let samplerFactories = 0;
  let sampleCalls = 0;
  const sourceRgb = [255, 0, 0];
  const finalRgb = [0, 255, 0];
  const t = bindTestLoupe({
    createLoupePatchSampler: () => {
      samplerFactories += 1;
      return () => {
        sampleCalls += 1;
        return {r: finalRgb[0], g: finalRgb[1], b: finalRgb[2]};
      };
    }
  });
  try {
    for (let i = 0; i < t.state.imageData.data.length; i += 4) {
      t.state.imageData.data[i] = sourceRgb[0];
      t.state.imageData.data[i + 1] = sourceRgb[1];
      t.state.imageData.data[i + 2] = sourceRgb[2];
      t.state.imageData.data[i + 3] = 255;
    }

    t.canvas.dispatch("pointermove", {clientX: 1, clientY: 2});
    assert.equal(samplerFactories, 0);

    t.diff.dispatch("click", {});

    assert.equal(samplerFactories, 1);
    assert.equal(sampleCalls, 16);
    const patch = t.doc.drawnPatches.at(-1);
    assert.ok(patch);
    const expected = expectedOklabDiffByte(sourceRgb, finalRgb);
    assert.notEqual(expected, rawRgbDiffByte(sourceRgb, finalRgb));
    assert.deepEqual(Array.from(patch.data.slice(0, 4)), [expected, expected, expected, 255]);
  } finally {
    t.binding.destroy();
    cleanup(t.oldDocument);
  }
});


test("pixel loupe shows the snapped art-pixel footprint when block size is larger than one", () => {
  const t = bindTestLoupe({config: {pixelBlockSize: 4}});
  try {
    t.canvas.dispatch("pointermove", {clientX: 1, clientY: 2});

    const wideFrames = t.doc.strokeRects.filter(rect => rect.width >= 25 && rect.height >= 25);
    assert.ok(wideFrames.length >= 2, "expected a highlighted art-pixel frame larger than the center cell");
    assert.ok(wideFrames.some(rect => rect.lineWidth === 2), "expected the active art-pixel frame to use the heavier outline");
  } finally {
    t.binding.destroy();
    cleanup(t.oldDocument);
  }
});


test("pixel loupe expand button toggles a 31 by 31 patch and restores 15 by 15", () => {
  const t = bindTestLoupe();
  try {
    assert.equal(t.expand.textContent, "⛶");
    assert.equal(t.pixelLoupeCanvas.width, 112);
    t.canvas.dispatch("pointermove", {clientX: 1, clientY: 2});

    t.expand.dispatch("click", {});

    assert.equal(t.state.diagnostics.pixelLoupeExpanded, true);
    assert.equal(t.pane.classList.contains("is-expanded"), true);
    assert.equal(t.expand.textContent, "▢");
    assert.equal(t.expand["aria-pressed"], "true");
    assert.equal(t.expand["aria-label"], "Restore loupe to 15 by 15 pixels");
    assert.equal(t.pixelLoupeCanvas.width, 186);
    assert.equal(t.pixelLoupeCanvas.height, 186);
    assert.equal(t.doc.drawnPatches.at(-1).width, 31);
    assert.equal(t.doc.drawnPatches.at(-1).height, 31);
    assert.equal(t.statuses.at(-1), "Loupe expanded to 31×31 pixels.");

    t.expand.dispatch("click", {});

    assert.equal(t.state.diagnostics.pixelLoupeExpanded, false);
    assert.equal(t.pane.classList.contains("is-expanded"), false);
    assert.equal(t.expand.textContent, "⛶");
    assert.equal(t.pixelLoupeCanvas.width, 112);
    assert.equal(t.pixelLoupeCanvas.height, 112);
    assert.equal(t.doc.drawnPatches.at(-1).width, 15);
    assert.equal(t.doc.drawnPatches.at(-1).height, 15);
    assert.equal(t.statuses.at(-1), "Loupe restored to 15×15 pixels.");
  } finally {
    t.binding.destroy();
    cleanup(t.oldDocument);
  }
});
