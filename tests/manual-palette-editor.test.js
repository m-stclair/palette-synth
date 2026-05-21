import test from "node:test";
import assert from "node:assert/strict";
import { createManualPaletteEditor } from "../src/ui/manual-palette-editor.js";

function makeElement(tagName = "div") {
  const listeners = new Map();
  const classes = new Set();
  let rawClassName = "";
  const el = {
    tagName: tagName.toUpperCase(),
    children: [],
    parentNode: null,
    style: {},
    dataset: {},
    attributes: {},
    hidden: false,
    disabled: false,
    value: "",
    checked: false,
    type: "",
    title: "",
    placeholder: "",
    spellcheck: true,
    textContent: "",
    id: "",
    classList: {
      add(...names) {
        for (const name of names) classes.add(name);
        rawClassName = [...classes].join(" ");
      },
      remove(...names) {
        for (const name of names) classes.delete(name);
        rawClassName = [...classes].join(" ");
      },
      toggle(name, force) {
        const shouldAdd = force === undefined ? !classes.has(name) : !!force;
        if (shouldAdd) classes.add(name);
        else classes.delete(name);
        rawClassName = [...classes].join(" ");
        return shouldAdd;
      },
      contains(name) {
        return classes.has(name);
      }
    },
    append(...nodes) {
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        node.parentNode = el;
        el.children.push(node);
      }
    },
    after(node) {
      if (!node || typeof node !== "object") return;
      if (!el.parentNode) return;
      const index = el.parentNode.children.indexOf(el);
      node.parentNode = el.parentNode;
      el.parentNode.children.splice(index + 1, 0, node);
    },
    contains(node) {
      if (node === el) return true;
      return (el.children || []).some(child => child?.contains?.(node));
    },
    closest(selector) {
      let node = el;
      while (node) {
        if (selector.startsWith(".") && node.classList?.contains?.(selector.slice(1))) return node;
        node = node.parentNode || null;
      }
      return null;
    },
    setAttribute(name, value) {
      el.attributes[name] = String(value);
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    removeEventListener(type, listener) {
      if (!listeners.has(type)) return;
      listeners.set(type, listeners.get(type).filter(candidate => candidate !== listener));
    },
    dispatchEvent(event) {
      const normalized = typeof event === "string" ? {type: event} : event;
      for (const listener of listeners.get(normalized.type) || []) listener(normalized);
    },
    querySelectorAll(selector) {
      const found = [];
      const matches = node => {
        if (selector.startsWith(".")) {
          const wanted = selector.slice(1).split(".");
          return wanted.every(name => node.classList?.contains(name));
        }
        return node.tagName?.toLowerCase() === selector.toLowerCase();
      };
      const visit = node => {
        for (const child of node.children || []) {
          if (matches(child)) found.push(child);
          visit(child);
        }
      };
      visit(el);
      return found;
    }
  };
  Object.defineProperty(el, "className", {
    get() {
      return rawClassName;
    },
    set(value) {
      rawClassName = String(value || "");
      classes.clear();
      rawClassName.split(/\s+/).filter(Boolean).forEach(name => classes.add(name));
    }
  });
  Object.defineProperty(el, "innerHTML", {
    get() {
      return "";
    },
    set() {
      el.children = [];
      el.textContent = "";
    }
  });
  return el;
}

function installFakeDocument() {
  const previous = globalThis.document;
  const listeners = new Map();
  const doc = {
    createElement: makeElement,
    body: makeElement("body"),
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    removeEventListener(type, listener) {
      if (!listeners.has(type)) return;
      listeners.set(type, listeners.get(type).filter(candidate => candidate !== listener));
    },
    dispatchEvent(event) {
      const normalized = typeof event === "string" ? {type: event} : event;
      for (const listener of listeners.get(normalized.type) || []) listener(normalized);
    }
  };
  globalThis.document = doc;
  return () => {
    globalThis.document = previous;
  };
}

function allByTag(root, tagName) {
  return root.querySelectorAll(tagName);
}

function findButton(root, text) {
  return allByTag(root, "button").find(button => button.textContent === text);
}

test("manual palette editor renders through callbacks and routes source/alias edits", () => {
  const restore = installFakeDocument();
  try {
    const palettePreview = makeElement("div");
    const chip = makeElement("button");
    chip.classList.add("chip");
    chip.dataset.swatchId = "swatch-1";
    palettePreview.append(chip);

    const els = {palettePreview};
    const config = {paletteMode: "manual", generatedAssist: 50};
    const state = {
      imageData: {width: 1, height: 1},
      manualEditor: {sourceIndex: null, swatchId: null, colorInputActive: false},
      paletteRecords: []
    };
    const swatch = {id: "swatch-1", hex: "#112233"};
    let aliasHex = null;
    const record = {source: "manual", swatchId: "swatch-1", sourceIndex: 0, hex: "#aabbcc", lab: [70, 0, 0]};
    state.paletteRecords = [record];
    const history = [];
    const sourceChanges = [];
    const copied = [];
    const statuses = [];

    const editor = createManualPaletteEditor({
      els,
      getConfig: () => config,
      getState: () => state,
      syncManualSwatches: () => [swatch],
      manualSwatchIndex: identifier => identifier === 0 || identifier === "swatch-1" ? 0 : -1,
      manualSwatchAt: identifier => identifier === 0 || identifier === "swatch-1" ? swatch : null,
      manualSwatchIndexForId: id => id === "swatch-1" ? 0 : -1,
      manualSourceHex: () => swatch.hex,
      manualMatchAliasHex: () => aliasHex,
      setManualMatchAlias: (id, color) => {
        assert.equal(id, "swatch-1");
        aliasHex = color;
      },
      manualSwatchEditable: candidate => candidate?.source === "manual" && candidate.swatchId === "swatch-1",
      paletteRecordForManualSwatchId: () => record,
      beginHistory: label => history.push(["begin", label]),
      commitHistory: label => history.push(["commit", label]),
      withHistory: (label, fn) => {
        history.push(["with", label]);
        return fn();
      },
      onSourceColorChange: (identifier, color) => {
        sourceChanges.push({identifier, color});
        swatch.hex = color;
        return color;
      },
      onDuplicateSwatch: () => null,
      onRemoveSwatch: () => null,
      copyPaletteHex: hex => copied.push(hex),
      setStatus: message => statuses.push(message)
    });

    editor.openManualPaletteEditor(record);

    assert.equal(els.paletteEditor.hidden, false);
    assert.equal(state.manualEditor.swatchId, "swatch-1");
    assert.equal(state.manualEditor.sourceIndex, 0);
    assert.equal(chip.classList.contains("is-editing"), true);
    assert.deepEqual(statuses, ["Editing source swatch 1."]);
    assert.ok(findButton(els.paletteEditor, "Copy effective"));

    const sourceText = allByTag(els.paletteEditor, "input")
      .find(input => input.attributes["aria-label"] === "Source hex color");
    sourceText.value = "#445566";
    sourceText.dispatchEvent("change");

    assert.deepEqual(sourceChanges, [{identifier: "swatch-1", color: "#445566"}]);
    assert.deepEqual(history.slice(0, 2), [["begin", "Edit manual swatch"], ["commit", "Edit manual swatch"]]);

    findButton(els.paletteEditor, "Copy effective").dispatchEvent("click");
    assert.deepEqual(copied, ["#aabbcc"]);

    const aliasToggle = allByTag(els.paletteEditor, "input").find(input => input.type === "checkbox");
    aliasToggle.checked = true;
    aliasToggle.dispatchEvent("change");

    assert.equal(aliasHex, "#112233");
    assert.deepEqual(history.at(-1), ["with", "Add match anchor"]);
  } finally {
    restore();
  }
});


test("manual palette editor can pick an extra match anchor from the source image", () => {
  const restore = installFakeDocument();
  try {
    const palettePreview = makeElement("div");
    const canvas = makeElement("canvas");
    const els = {palettePreview, canvas};
    const config = {paletteMode: "manual", generatedAssist: 0, pixelBlockSize: 1, pixelBlockSampleMode: "center"};
    const state = {
      imageData: {width: 2, height: 1, data: new Uint8ClampedArray([10, 20, 30, 255, 200, 150, 100, 255])},
      manualEditor: {sourceIndex: null, swatchId: null, colorInputActive: false},
      paletteRecords: []
    };
    const swatch = {id: "swatch-1", hex: "#112233"};
    const record = {source: "manual", swatchId: "swatch-1", sourceIndex: 0, hex: "#112233", lab: [20, 0, 0]};
    state.paletteRecords = [record];
    let aliasHex = null;
    const history = [];
    const statuses = [];

    const editor = createManualPaletteEditor({
      els,
      getConfig: () => config,
      getState: () => state,
      syncManualSwatches: () => [swatch],
      manualSwatchIndex: identifier => identifier === 0 || identifier === "swatch-1" ? 0 : -1,
      manualSwatchAt: identifier => identifier === 0 || identifier === "swatch-1" ? swatch : null,
      manualSwatchIndexForId: id => id === "swatch-1" ? 0 : -1,
      manualSourceHex: () => swatch.hex,
      manualMatchAliasHex: () => aliasHex,
      setManualMatchAlias: (id, color) => {
        assert.equal(id, "swatch-1");
        aliasHex = color;
      },
      manualSwatchEditable: candidate => candidate?.source === "manual" && candidate.swatchId === "swatch-1",
      paletteRecordForManualSwatchId: () => record,
      withHistory: (label, fn) => {
        history.push(label);
        return fn();
      },
      clientPointToImagePixel: () => ({x: 1, y: 0}),
      setStatus: message => statuses.push(message)
    });

    editor.openManualPaletteEditor(record);
    findButton(els.paletteEditor, "Pick from source image").dispatchEvent("click");

    assert.equal(state.manualEditor.aliasPickActive, true);
    assert.equal(canvas.classList.contains("is-picking-alias"), true);
    assert.match(statuses.at(-1), /Click the source image/);

    canvas.dispatchEvent({
      type: "click",
      clientX: 10,
      clientY: 10,
      preventDefault() {},
      stopPropagation() {},
      stopImmediatePropagation() {}
    });

    assert.equal(aliasHex, "#c89664");
    assert.deepEqual(history, ["Pick source-image match anchor"]);
    assert.equal(state.manualEditor.aliasPickActive, false);
    assert.equal(canvas.classList.contains("is-picking-alias"), false);
    assert.match(statuses.at(-1), /also catches source-image #c89664/);
  } finally {
    restore();
  }
});

test("manual palette editor close clears editor state and editing chips", () => {
  const restore = installFakeDocument();
  try {
    const palettePreview = makeElement("div");
    const chip = makeElement("button");
    chip.classList.add("chip", "is-editing");
    chip.dataset.swatchId = "swatch-1";
    palettePreview.append(chip);
    const els = {palettePreview, paletteEditor: makeElement("div")};
    const state = {manualEditor: {sourceIndex: 0, swatchId: "swatch-1", colorInputActive: true}};

    const editor = createManualPaletteEditor({
      els,
      getConfig: () => ({paletteMode: "manual"}),
      getState: () => state
    });

    editor.closeManualPaletteEditor();

    assert.equal(state.manualEditor.sourceIndex, null);
    assert.equal(state.manualEditor.swatchId, null);
    assert.equal(state.manualEditor.colorInputActive, false);
    assert.equal(els.paletteEditor.hidden, true);
    assert.equal(chip.classList.contains("is-editing"), false);
  } finally {
    restore();
  }
});

function setupOpenManualPaletteEditor() {
  const palettePreview = makeElement("div");
  const chip = makeElement("button");
  chip.classList.add("chip");
  chip.dataset.swatchId = "swatch-1";
  palettePreview.append(chip);

  const els = {palettePreview};
  const config = {paletteMode: "manual", generatedAssist: 0};
  const state = {
    manualEditor: {sourceIndex: null, swatchId: null, colorInputActive: false},
    paletteRecords: []
  };
  const swatch = {id: "swatch-1", hex: "#112233"};
  const record = {source: "manual", swatchId: "swatch-1", sourceIndex: 0, hex: "#112233", lab: [20, 0, 0]};
  state.paletteRecords = [record];

  const editor = createManualPaletteEditor({
    els,
    getConfig: () => config,
    getState: () => state,
    syncManualSwatches: () => [swatch],
    manualSwatchAt: identifier => identifier === 0 || identifier === "swatch-1" ? swatch : null,
    manualSwatchIndexForId: id => id === "swatch-1" ? 0 : -1,
    manualSourceHex: () => swatch.hex,
    manualMatchAliasHex: () => null,
    setManualMatchAlias: () => {},
    manualSwatchEditable: candidate => candidate?.source === "manual" && candidate.swatchId === "swatch-1",
    paletteRecordForManualSwatchId: () => record,
    copyPaletteHex: () => {}
  });

  editor.openManualPaletteEditor(record);
  return {editor, els, state, chip};
}

test("manual palette editor closes on Escape", () => {
  const restore = installFakeDocument();
  try {
    const {els, state, chip} = setupOpenManualPaletteEditor();
    let prevented = false;

    globalThis.document.dispatchEvent({
      type: "keydown",
      key: "Escape",
      preventDefault: () => { prevented = true; }
    });

    assert.equal(prevented, true);
    assert.equal(els.paletteEditor.hidden, true);
    assert.equal(state.manualEditor.swatchId, null);
    assert.equal(state.manualEditor.sourceIndex, null);
    assert.equal(chip.classList.contains("is-editing"), false);
  } finally {
    restore();
  }
});

test("manual palette editor closes on outside pointer and ignores inside/editor-adjacent picker clicks", () => {
  const restore = installFakeDocument();
  try {
    const {els, state} = setupOpenManualPaletteEditor();
    const insideControl = allByTag(els.paletteEditor, "input")[0];
    const colorPickerPopover = makeElement("div");
    colorPickerPopover.classList.add("app-color-picker-popover");
    globalThis.document.body.append(colorPickerPopover);
    const outside = makeElement("button");

    globalThis.document.dispatchEvent({type: "pointerdown", target: insideControl});
    assert.equal(els.paletteEditor.hidden, false);
    assert.equal(state.manualEditor.swatchId, "swatch-1");

    globalThis.document.dispatchEvent({type: "pointerdown", target: colorPickerPopover});
    assert.equal(els.paletteEditor.hidden, false);
    assert.equal(state.manualEditor.swatchId, "swatch-1");

    globalThis.document.dispatchEvent({type: "pointerdown", target: outside});
    assert.equal(els.paletteEditor.hidden, true);
    assert.equal(state.manualEditor.swatchId, null);
  } finally {
    restore();
  }
});
