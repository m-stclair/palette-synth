import test from "node:test";
import assert from "node:assert/strict";
import { bindPixelLoupe } from "../src/ui/pixel-loupe.js";

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
  return makeEventTarget({
    width: 112,
    height: 112,
    ownerDocument: document,
    getContext() {
      return {
        clearRect() {},
        createImageData(width, height) { return {width, height, data: new Uint8ClampedArray(width * height * 4)}; },
        putImageData() {},
        drawImage() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        strokeRect() {}
      };
    }
  });
}

function makeDocument() {
  const body = makeEventTarget({
    appendChild(child) { child.parentElement = this; }
  });
  const doc = makeEventTarget({
    body,
    createElement(tagName) {
      if (tagName === "canvas") return makeCanvas(doc);
      return makeEventTarget({ownerDocument: doc});
    }
  });
  return doc;
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
  const oldDocument = globalThis.document;
  const doc = makeDocument();
  globalThis.document = doc;
  const pane = makeEventTarget({ownerDocument: doc});
  const canvas = makeEventTarget({ownerDocument: doc});
  const pixelLoupeCanvas = makeCanvas(doc);
  const pin = makeEventTarget({ownerDocument: doc});
  const view = makeEventTarget({ownerDocument: doc, textContent: ""});
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
  const binding = bindPixelLoupe({
    els: {
      pixelLoupePane: pane,
      canvas,
      pixelLoupeCanvas,
      pixelLoupePin: pin,
      pixelLoupeView: view,
      pixelLoupeCoord: coord,
      pixelLoupeSource: source,
      pixelLoupeFx: fx,
      pixelLoupeSourceLch: makeEventTarget({textContent: ""}),
      pixelLoupeFxLch: makeEventTarget({textContent: ""}),
      pixelLoupeSourceSwatch: makeEventTarget(),
      pixelLoupeFxSwatch: makeEventTarget()
    },
    state,
    config: {blendAmount: 1},
    inspectLoupePixel: (clientX, clientY) => {
      inspected.push([clientX, clientY]);
      const pixel = {x: clientX, y: clientY, sourceHex: "#111111", fxHex: "#222222", finalHex: "#333333"};
      state.diagnostics.pixelLoupe = pixel;
      return pixel;
    },
    analyzeLoupeImagePixel: (x, y) => {
      analyzed.push([x, y]);
      return {x, y, sourceHex: "#111111", fxHex: "#222222", finalHex: "#333333"};
    },
    clearLoupePixel: () => { state.diagnostics.pixelLoupe = null; },
    setStatus: value => statuses.push(value),
    ...overrides
  });
  return {oldDocument, doc, pane, canvas, pin, view, coord, state, statuses, inspected, analyzed, binding};
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
    assert.equal(firstClick.immediateStopped, true);
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
