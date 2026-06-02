import test from "node:test";
import assert from "node:assert/strict";
import { cloneDefaultConfig } from "../src/state/config.js";
import {
  createManualPaletteActions,
  extractPaletteColorsFromText,
  groupedBuiltInPresetNames,
  humanizePresetName
} from "../src/manual/manual-palette-actions.js";

function installFakeStorage() {
  const values = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
    }
  };
  return values;
}

function makeElement(tagName = "div") {
  return {
    tagName: tagName.toUpperCase(),
    value: "",
    textContent: "",
    disabled: false,
    open: false,
    children: [],
    classList: {
      toggles: [],
      toggle(name, value) {
        this.toggles.push([name, value]);
      }
    },
    append(child) {
      this.children.push(child);
    },
    set innerHTML(value) {
      this.children = [];
      this._innerHTML = value;
    },
    get innerHTML() {
      return this._innerHTML || "";
    }
  };
}

function makeRoot(elements = {}, canvasData = []) {
  return {
    elements,
    createElement(tagName) {
      if (tagName === "canvas") {
        return {
          tagName: "CANVAS",
          width: 0,
          height: 0,
          getContext() {
            return {
              drawImage() {},
              getImageData: () => ({data: canvasData})
            };
          }
        };
      }
      return makeElement(tagName);
    },
    getElementById(id) {
      return elements[id] || null;
    }
  };
}

function makeHarness(overrides = {}) {
  installFakeStorage();
  const calls = [];
  const statuses = [];
  const elements = overrides.elements || {presetName: makeElement("select"), generatedAssistValue: makeElement("span")};
  const state = overrides.state || {
    manualPresets: [],
    paletteRecords: [
      {hex: "#112233"},
      {hex: "#445566"}
    ],
    paletteDirty: false
  };
  const config = overrides.config || {
    ...cloneDefaultConfig(),
    paletteMode: "generated",
    presetName: "demoPreset",
    generatedAssist: 0,
    harmonyRelationship: "splitComplement",
    cosinePreset: "sinebow",
    manualPalette: [],
    manualMatchAliases: []
  };
  const els = overrides.els || {
    paletteMode: {value: config.paletteMode},
    presetName: elements.presetName,
    generatedAssist: {value: config.generatedAssist},
    capturePalette: makeElement("button"),
    capturePaletteMenu: makeElement("details")
  };
  const root = overrides.root || makeRoot(elements, overrides.canvasData || []);
  const images = [];
  class FakeImage {
    constructor() {
      this.width = overrides.imageWidth || 3;
      this.height = overrides.imageHeight || 1;
      images.push(this);
    }
  }
  const urlCalls = [];
  const controller = createManualPaletteActions({
    els,
    state,
    config,
    root,
    window: overrides.window || {prompt: () => "Captured Name"},
    Image: overrides.Image || FakeImage,
    URL: overrides.URL || {
      createObjectURL: file => {
        urlCalls.push(["create", file.name]);
        return `blob:${file.name}`;
      },
      revokeObjectURL: url => urlCalls.push(["revoke", url])
    },
    cloneConfigSnapshot: overrides.cloneConfigSnapshot || (() => ({before: true})),
    pushHistorySnapshot: (...args) => calls.push(["history", ...args]),
    withHistory: (label, fn) => {
      calls.push(["withHistory", label]);
      return fn();
    },
    presetExists: name => name === "amigaWorkbench" || name === "demoPreset" || String(name).startsWith("manualPreset:"),
    presetColors: () => ["#010203", "#aabbcc", "#ddeeff"],
    presetSize: name => (name === "demoPreset" ? 3 : 2),
    manualPresetName: id => `manualPreset:${id}`,
    activePaletteImageData: mode => overrides.activePaletteImageData?.(mode) || null,
    activePaletteRegionRect: overrides.activePaletteRegionRect || (() => null),
    getPaletteRecords: overrides.getPaletteRecords || (() => state.paletteRecords),
    syncManualSwatches: overrides.syncManualSwatches || (() => config.manualPalette),
    renderManualSwatches: () => calls.push("renderManualSwatches"),
    markPaletteDirty: () => calls.push("markPaletteDirty"),
    updateConditionalPanels: () => calls.push("updateConditionalPanels"),
    queueRender: () => calls.push("queueRender"),
    setStatus: text => statuses.push(text),
    setOutputText: (...args) => calls.push(["setOutputText", ...args])
  });
  return {controller, state, config, els, root, elements, calls, statuses, images, urlCalls};
}

test("manual palette actions humanize built-in preset names", () => {
  assert.equal(humanizePresetName("amigaWorkbench"), "Amiga Workbench");
  assert.equal(humanizePresetName("c64"), "C64");
});


test("manual palette actions group built-in presets and alphabetize inside categories", () => {
  const groups = groupedBuiltInPresetNames({
    zxSpectrum: [],
    amigaWorkbench: [],
    pico8: [],
    tic80Sweetie16: [],
    roseGlass: []
  });

  assert.deepEqual(groups.map(group => group.label), [
    "Computer hardware",
    "Pixel art",
    "Minimal + material"
  ]);
  assert.deepEqual(groups[0].names, ["amigaWorkbench", "zxSpectrum"]);
  assert.deepEqual(groups[1].names, ["pico8", "tic80Sweetie16"]);
});

test("manual palette actions populate built-in and captured preset options", () => {
  const select = makeElement("select");
  const {controller, state, config} = makeHarness({elements: {presetName: select}});
  state.manualPresets = [{id: "saved", name: "Saved Look", colors: ["#111111", "#222222"]}];

  controller.populatePresetSelect("manualPreset:saved");

  assert.equal(select.children[0].label, "Computer hardware");
  const manualGroup = select.children.find(child => child.label === "Captured manual");
  assert.ok(manualGroup);
  assert.equal(manualGroup.children[0].value, "manualPreset:saved");
  assert.equal(manualGroup.children[0].textContent, "Saved Look (2)");
  assert.equal(config.presetName, "manualPreset:saved");
});


test("manual palette actions switch presets directly and alphabetize captured presets", () => {
  const select = makeElement("select");
  const {controller, state, config, els, calls, statuses} = makeHarness({elements: {presetName: select}});
  state.manualPresets = [
    {id: "z", name: "Zed Look", colors: ["#111111"]},
    {id: "a", name: "Amber Look", colors: ["#222222", "#333333"]}
  ];
  config.presetName = "manualPreset:a";
  els.presetName.value = config.presetName;

  controller.populatePresetSelect(config.presetName);
  const manualGroup = select.children.find(child => child.label === "Captured manual");
  assert.deepEqual(manualGroup.children.map(option => option.value), ["manualPreset:a", "manualPreset:z"]);

  assert.equal(controller.switchPalettePreset(1), true);
  assert.equal(config.presetName, "manualPreset:z");
  assert.equal(config.paletteMode, "manual");
  assert.equal(calls.includes("renderManualSwatches"), true);
  assert.equal(statuses.at(-1), "Loaded preset: Zed Look.");
});

test("manual palette actions load a preset into manual mode", () => {
  const {controller, config, els, calls} = makeHarness();

  controller.loadPresetAsManual();

  assert.equal(config.paletteMode, "manual");
  assert.equal(els.paletteMode.value, "manual");
  assert.equal(config.manualPalette.length, 3);
  assert.deepEqual(calls, [
    ["withHistory", "Load preset as manual palette"],
    "renderManualSwatches",
    "markPaletteDirty",
    "updateConditionalPanels",
    "queueRender"
  ]);
});

test("manual palette actions replace, append, and fill unlocked manual colors", () => {
  const {controller, config} = makeHarness();

  assert.deepEqual(controller.applyCapturedColorsToManual(["#111111", "#222222"], "replace", "seed"), {changed: true, count: 2});
  assert.deepEqual(config.manualPalette.map(swatch => swatch.hex), ["#111111", "#222222"]);

  assert.deepEqual(controller.applyCapturedColorsToManual(["#333333"], "append", "seed"), {changed: true, count: 1});
  assert.deepEqual(config.manualPalette.map(swatch => swatch.hex), ["#111111", "#222222", "#333333"]);

  config.manualPalette[0].locked = true;
  assert.deepEqual(controller.applyCapturedColorsToManual(["#aaaaaa", "#bbbbbb"], "fillUnlocked", "seed"), {changed: true, count: 2});
  assert.deepEqual(config.manualPalette.map(swatch => swatch.hex), ["#111111", "#aaaaaa", "#bbbbbb"]);
});

test("manual palette actions capture the visible palette to manual mode", () => {
  const {controller, config, statuses, calls} = makeHarness({
    activePaletteImageData: () => ({width: 10, height: 10})
  });

  controller.captureCurrentPaletteToManual("replace");

  assert.equal(config.paletteMode, "manual");
  assert.deepEqual(config.manualPalette.map(swatch => swatch.hex), ["#112233", "#445566"]);
  assert.deepEqual(calls[0], ["withHistory", "Replace manual palette"]);
  assert.equal(calls[1][0], "setOutputText");
  assert.equal(calls[1][1], "generatedAssist");
  assert.equal(calls[1][3], 0);
  assert.equal(calls.includes("renderManualSwatches"), true);
  assert.equal(calls.includes("markPaletteDirty"), true);
  assert.equal(calls.includes("updateConditionalPanels"), true);
  assert.equal(calls.includes("queueRender"), true);
  assert.equal(statuses.at(-1), "Captured 2 colors from main image.");
});


test("manual palette text parser extracts CSS color formats in source order", () => {
  const colors = extractPaletteColorsFromText(`
    --ink: #1b2;
    --paper: 112233;
    --accent: rgb(236 92 74 / .8);
    --wash: rgba(255, 214, 102, .85);
    --link: hsl(210 100% 40%);
    --legacy: 0xff00cc99;
  `);

  assert.deepEqual(colors, [
    "#11bb22",
    "#112233",
    "#ec5c4a",
    "#ffd666",
    "#0066cc",
    "#ff00cc"
  ]);
});


test("manual palette actions add inspected source color to manual palette", () => {
  const state = {
    manualPresets: [],
    paletteRecords: [],
    paletteDirty: false,
    diagnostics: {
      pixel: {sourceHex: "#abcdef", sourceLab: [70, -2, -12]}
    }
  };
  const config = {
    ...cloneDefaultConfig(),
    paletteMode: "generated",
    presetName: "demoPreset",
    generatedAssist: 0.5,
    harmonyRelationship: "splitComplement",
    cosinePreset: "sinebow",
    manualPalette: [],
    manualMatchAliases: []
  };
  const {controller, els, calls, statuses} = makeHarness({state, config});

  controller.addPixelSourceToManualPalette();

  assert.equal(config.paletteMode, "manual");
  assert.equal(els.paletteMode.value, "manual");
  assert.equal(config.generatedAssist, 0);
  assert.deepEqual(config.manualPalette.map(swatch => swatch.hex), ["#abcdef"]);
  assert.deepEqual(calls[0], ["withHistory", "Add source color to manual palette"]);
  assert.equal(calls[1][0], "setOutputText");
  assert.equal(calls.includes("renderManualSwatches"), true);
  assert.equal(calls.includes("markPaletteDirty"), true);
  assert.equal(calls.includes("updateConditionalPanels"), true);
  assert.equal(calls.includes("queueRender"), true);
  assert.equal(statuses.at(-1), "Added #abcdef from the inspected pixel to the manual palette.");
});

test("manual palette actions import text colors into manual mode", () => {
  const dialog = {
    open: false,
    hidden: true,
    showModal() { this.open = true; this.hidden = false; },
    close() { this.open = false; this.hidden = true; }
  };
  const input = {value: "#102030 rgba(255, 128, 0, .6)", focused: false, focus() { this.focused = true; }};
  const elements = {
    presetName: makeElement("select"),
    generatedAssistValue: makeElement("span"),
    manualPaletteTextDialog: dialog,
    manualPaletteTextInput: input
  };
  const {controller, config, els, calls, statuses} = makeHarness({elements});
  els.manualPaletteTextDialog = dialog;
  els.manualPaletteTextInput = input;

  controller.openManualPaletteTextDialog();
  assert.equal(dialog.open, true);
  assert.equal(input.value, "");
  assert.equal(input.focused, true);

  input.value = "#102030 rgba(255, 128, 0, .6)";
  controller.importManualPaletteText();

  assert.equal(dialog.open, false);
  assert.equal(config.paletteMode, "manual");
  assert.deepEqual(config.manualPalette.map(swatch => swatch.hex), ["#102030", "#ff8000"]);
  assert.deepEqual(calls[0], ["withHistory", "Import text palette"]);
  assert.equal(calls.includes("renderManualSwatches"), true);
  assert.equal(calls.includes("markPaletteDirty"), true);
  assert.equal(calls.includes("updateConditionalPanels"), true);
  assert.equal(calls.includes("queueRender"), true);
  assert.equal(statuses.at(-1), "Imported 2 colors from text.");
});

test("manual palette actions copy visible palette hex strings to clipboard", async () => {
  const writes = [];
  const {controller, statuses} = makeHarness({
    window: {navigator: {clipboard: {writeText: async text => writes.push(text)}}}
  });

  await controller.copyCurrentPaletteHexStrings();

  assert.deepEqual(writes, ["#112233\n#445566"]);
  assert.equal(statuses.at(-1), "Copied 2 hex colors.");
});

test("manual palette actions import LUT files as manual swatches and records history", async () => {
  const data = new Uint8ClampedArray([
    0, 0, 0, 255,
    128, 64, 32, 255,
    255, 255, 255, 255
  ]);
  const {controller, config, els, calls, images, urlCalls} = makeHarness({canvasData: data});

  await controller.importLut({name: "look.png"});
  assert.equal(images[0].src, "blob:look.png");
  images[0].onload();

  assert.equal(config.paletteMode, "manual");
  assert.equal(els.paletteMode.value, "manual");
  assert.deepEqual(config.manualPalette.map(swatch => swatch.hex), ["#000000", "#804020", "#ffffff"]);
  assert.equal(calls.includes("renderManualSwatches"), true);
  assert.equal(calls.some(call => Array.isArray(call) && call[0] === "history" && call[2] === "Import LUT"), true);
  assert.deepEqual(urlCalls, [["create", "look.png"], ["revoke", "blob:look.png"]]);
});

function imageDataFromRgbTriples(rgbTriples) {
  const data = new Uint8ClampedArray(rgbTriples.length * 4);
  rgbTriples.forEach(([r, g, b], index) => {
    const offset = index * 4;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = 255;
  });
  return {width: rgbTriples.length, height: 1, data};
}

test("manual palette actions add a k-means swatch from residual image color", () => {
  const imageData = imageDataFromRgbTriples([
    [255, 0, 0],
    [0, 0, 255],
    [0, 255, 0]
  ]);
  const config = {
    ...cloneDefaultConfig(),
    paletteMode: "manual",
    generatedAssist: 25,
    manualPalette: [
      {id: "red", hex: "#ff0000", locked: true, muted: false},
      {id: "blue", hex: "#0000ff", locked: false, muted: false}
    ],
    manualMatchAliases: [],
    blockSize: 1,
    samplingMode: "stratified",
    seed: 2
  };
  const {controller, calls, statuses} = makeHarness({config, activePaletteImageData: () => imageData});

  controller.addManualKMeansSwatch();

  assert.equal(config.generatedAssist, 0);
  assert.equal(config.manualPalette.length, 3);
  assert.equal(config.manualPalette[2].hex, "#00ff00");
  assert.deepEqual(calls[0], ["withHistory", "Add k-means manual swatch"]);
  assert.equal(calls.some(call => Array.isArray(call) && call[0] === "setOutputText"), true);
  assert.equal(statuses.at(-1), "Added k-means swatch #00ff00.");
});

test("manual palette actions refit only unlocked active swatches with k-means", () => {
  const imageData = imageDataFromRgbTriples([
    [255, 0, 0],
    [0, 0, 255]
  ]);
  const config = {
    ...cloneDefaultConfig(),
    paletteMode: "manual",
    generatedAssist: 0,
    manualPalette: [
      {id: "red", hex: "#ff0000", locked: true, muted: false},
      {id: "fit", hex: "#111111", aliasHex: "#222222", locked: false, muted: false},
      {id: "muted", hex: "#00ff00", locked: false, muted: true}
    ],
    manualMatchAliases: [{index: 1, hex: "#222222"}],
    blockSize: 1,
    samplingMode: "stratified",
    seed: 2
  };
  const {controller, calls, statuses} = makeHarness({config, activePaletteImageData: () => imageData});

  controller.refitUnlockedManualWithKMeans();

  assert.equal(config.manualPalette[0].hex, "#ff0000");
  assert.equal(config.manualPalette[1].hex, "#0000ff");
  assert.equal(config.manualPalette[1].aliasHex, null);
  assert.equal(config.manualPalette[2].hex, "#00ff00");
  assert.deepEqual(config.manualMatchAliases, []);
  assert.deepEqual(calls[0], ["withHistory", "Refit unlocked swatches with k-means"]);
  assert.equal(statuses.at(-1), "Refit 1 unlocked manual swatch with k-means.");
});
