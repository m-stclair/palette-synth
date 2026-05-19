import test from "node:test";
import assert from "node:assert/strict";
import { createManualSwatchesList } from "../src/ui/manual-swatches-list.js";
import { createPalettePreview } from "../src/ui/palette-preview.js";
import { cycleTagged, manualCycleIndices, syncCycleManualKeys } from "../src/palette/cycle.js";
import { manualCycleKeyForId } from "../src/manual/ids.js";

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
    spellcheck: true,
    textContent: "",
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
    setAttribute(name, value) {
      el.attributes[name] = String(value);
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatchEvent(event) {
      const normalized = typeof event === "string" ? {type: event} : event;
      for (const listener of listeners.get(normalized.type) || []) listener(normalized);
    },
    querySelectorAll(selector) {
      const found = [];
      const matches = node => {
        if (selector.startsWith(".")) return node.classList?.contains(selector.slice(1));
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
  globalThis.document = {createElement: makeElement};
  return () => {
    globalThis.document = previous;
  };
}

test("manual swatch list renders edits, locks, and removal through callbacks", () => {
  const restore = installFakeDocument();
  try {
    const els = {manualSwatches: makeElement("div")};
    const config = {
      manualPalette: [
        {id: "swatch-a", hex: "#111111", locked: false},
        {id: "swatch-b", hex: "#222222", locked: true}
      ]
    };
    const state = {manualEditor: {swatchId: "swatch-a", sourceIndex: 0}};
    const history = [];
    let dirty = 0;
    let renders = 0;
    const list = createManualSwatchesList({
      els,
      config,
      state,
      syncManualSwatches: () => config.manualPalette,
      manualSwatchIndexForId: id => config.manualPalette.findIndex(swatch => swatch.id === id),
      removeManualSwatchAt: index => {
        config.manualPalette.splice(index, 1);
        return config.manualPalette[index] ?? config.manualPalette[index - 1] ?? null;
      },
      beginHistory: label => history.push(["begin", label]),
      commitHistory: label => history.push(["commit", label]),
      withHistory: (label, fn) => {
        history.push(["with", label]);
        return fn();
      },
      markPaletteDirty: () => { dirty += 1; },
      queueRender: () => { renders += 1; }
    });

    list.renderManualSwatches();

    assert.equal(els.manualSwatches.children.length, 2);
    const firstRow = els.manualSwatches.children[0];
    const [colorInput, textInput, lockButton, removeButton] = firstRow.children;

    colorInput.value = "#333333";
    colorInput.dispatchEvent("input");
    colorInput.dispatchEvent("change");

    assert.equal(config.manualPalette[0].hex, "#333333");
    assert.deepEqual(history.slice(0, 2), [["begin", "Edit manual swatch"], ["commit", "Edit manual swatch"]]);
    assert.equal(dirty, 1);
    assert.equal(renders, 1);

    textInput.value = "not-a-color";
    textInput.dispatchEvent("change");
    assert.equal(config.manualPalette[0].hex, "#333333");
    assert.equal(textInput.value, "#333333");

    lockButton.dispatchEvent("click");
    assert.equal(config.manualPalette[0].locked, true);
    assert.deepEqual(history.at(-1), ["with", "Toggle manual swatch lock"]);

    removeButton.dispatchEvent("click");
    assert.equal(config.manualPalette.length, 1);
    assert.equal(state.manualEditor.swatchId, "swatch-b");
    assert.equal(state.manualEditor.sourceIndex, 0);
  } finally {
    restore();
  }
});

test("palette preview renders generated locks, manual aliases, and click actions", async () => {
  const restore = installFakeDocument();
  try {
    const els = {
      palettePreview: makeElement("div"),
      paletteCount: makeElement("div"),
      paletteHint: makeElement("div"),
      clearPaletteLocks: makeElement("button"),
      clearCycleTags: makeElement("button")
    };
    const config = {
      paletteMode: "generated",
      generatedLocks: [],
      cycleManualKeys: [],
      generatedAssist: 0,
      harmonyRelationship: "complementary",
      cosinePreset: "sunset",
      seedSwatch: "#123456"
    };
    const state = {
      imageData: {width: 2, height: 2},
      manualEditor: {swatchId: null},
      palette: [],
      paletteRecords: [
        {id: "generated-1", source: "generated", lab: [20, 0, 0], hex: "#111111", seedLab: [30, 0, 0], familyId: "family-a", variant: "shadow"}
      ]
    };
    const history = [];
    const statuses = [];
    let dirty = 0;
    let renders = 0;
    let syncedCycles = 0;
    let syncedEditor = 0;
    const copied = [];

    const preview = createPalettePreview({
      els,
      config,
      state,
      syncGeneratedLocks: () => config.generatedLocks,
      activeGeneratedLocks: () => config.generatedLocks,
      generatedFamilyCount: () => 3,
      isGeneratedPaletteMode: () => config.paletteMode === "generated",
      activePaletteImageData: () => state.imageData,
      activePaletteImageLabel: () => "current image",
      manualCycleModeEnabled: () => false,
      syncCycleManualKeys: () => config.cycleManualKeys,
      cycleTaggable: record => !!record.cycleKey,
      cycleTagged: () => false,
      manualCycleIndices: () => [],
      manualSwatchEditable: record => record.source === "manual",
      manualMatchAliasHex: id => id === "swatch-a" ? "#abcdef" : null,
      manualSourceHex: () => "#123456",
      activeManualMatchAliasCount: records => records.filter(record => record.swatchId === "swatch-a").length,
      withHistory: (label, fn) => {
        history.push(label);
        return fn();
      },
      markPaletteDirty: () => { dirty += 1; },
      queueRender: () => { renders += 1; },
      syncCycleControls: () => { syncedCycles += 1; },
      syncManualPaletteEditor: () => { syncedEditor += 1; },
      openManualPaletteEditor: record => { state.manualEditor.swatchId = record.swatchId; },
      copyPaletteHex: hex => { copied.push(hex); },
      setStatus: message => statuses.push(message)
    });

    preview.renderSwatches();

    assert.equal(els.palettePreview.children.length, 1);
    const chip = els.palettePreview.children[0];
    assert.equal(chip.classList.contains("is-lockable"), true);
    assert.equal(els.paletteCount.textContent, "1 colors · 0 locks");
    assert.match(els.paletteHint.textContent, /Generated palette from current image/);
    assert.equal(syncedCycles, 1);
    assert.equal(syncedEditor, 1);

    chip.dispatchEvent({type: "click", shiftKey: false});
    assert.deepEqual(history, ["Toggle generated lock"]);
    assert.equal(config.generatedLocks.length, 1);
    assert.equal(config.generatedLocks[0].hex, "#2e2e2e");
    assert.equal(dirty, 1);
    assert.equal(renders, 1);
    assert.deepEqual(statuses, ["Locked family #2e2e2e."]);

    await chip.dispatchEvent({type: "click", shiftKey: true});
    assert.deepEqual(copied, ["#111111"]);

    config.paletteMode = "manual";
    state.paletteRecords = [{id: "manual-1", source: "manual", swatchId: "swatch-a", sourceIndex: 0, lab: [80, 0, 0], hex: "#eeeeee"}];
    preview.renderSwatches();

    const manualChip = els.palettePreview.children[0];
    assert.equal(manualChip.classList.contains("is-editable"), true);
    assert.equal(manualChip.classList.contains("has-match-alias"), true);
    assert.equal(els.paletteCount.textContent, "1 colors · 1 match alias");
    manualChip.dispatchEvent({type: "click", shiftKey: false});
    assert.equal(state.manualEditor.swatchId, "swatch-a");
  } finally {
    restore();
  }
});


test("palette preview keeps manual cycle tags on mixed-case manual swatch IDs", () => {
  const restore = installFakeDocument();
  try {
    const els = {
      palettePreview: makeElement("div"),
      paletteCount: makeElement("div"),
      paletteHint: makeElement("div"),
      clearCycleTags: makeElement("button")
    };
    const config = {
      paletteMode: "manual",
      CYCLE_MODE: "manual",
      cycleManualKeys: [],
      manualPalette: [{id: "Manual-One", hex: "#111111"}]
    };
    const state = {
      imageData: null,
      manualEditor: {swatchId: null},
      palette: [],
      paletteRecords: [{
        id: "manual:Manual-One",
        source: "manual",
        swatchId: "Manual-One",
        sourceIndex: 0,
        lab: [12, 0, 0],
        hex: "#111111",
        cycleKey: manualCycleKeyForId("Manual-One")
      }]
    };
    let dirty = 0;
    let renders = 0;
    const statuses = [];

    const preview = createPalettePreview({
      els,
      config,
      state,
      syncGeneratedLocks: () => [],
      activeGeneratedLocks: () => [],
      generatedFamilyCount: () => 0,
      isGeneratedPaletteMode: () => false,
      activePaletteImageData: () => null,
      activePaletteImageLabel: () => "current image",
      manualCycleModeEnabled: () => true,
      syncCycleManualKeys: () => syncCycleManualKeys(config, config.manualPalette),
      cycleTaggable: record => config.CYCLE_MODE === "manual" && !!record?.cycleKey,
      cycleTagged: record => cycleTagged(config, record, config.manualPalette),
      manualCycleIndices: records => manualCycleIndices(config, records, new Set(syncCycleManualKeys(config, config.manualPalette))),
      manualSwatchEditable: () => false,
      manualMatchAliasHex: () => null,
      manualSourceHex: () => "#111111",
      activeManualMatchAliasCount: () => 0,
      withHistory: (label, fn) => fn(),
      markPaletteDirty: () => { dirty += 1; },
      queueRender: () => { renders += 1; },
      syncCycleControls: () => {},
      syncManualPaletteEditor: () => {},
      openManualPaletteEditor: () => {},
      copyPaletteHex: () => {},
      setStatus: message => statuses.push(message)
    });

    preview.renderSwatches();
    const chip = els.palettePreview.children[0];
    chip.dispatchEvent({type: "click", shiftKey: false});

    assert.deepEqual(config.cycleManualKeys, ["manual:manual-one"]);
    assert.equal(dirty, 1);
    assert.equal(renders, 1);
    assert.equal(statuses.at(-1), "Tagged #111111 for manual cycling.");

    preview.renderSwatches();
    assert.equal(els.palettePreview.children[0].classList.contains("is-cycle-tagged"), true);
    assert.equal(els.paletteCount.textContent, "1 colors · 1 cycle tag");
  } finally {
    restore();
  }
});
