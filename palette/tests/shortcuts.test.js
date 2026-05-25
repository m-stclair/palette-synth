import test from "node:test";
import assert from "node:assert/strict";
import { createShortcutDispatcher, shouldIgnoreShortcut } from "../src/ui/shortcuts.js";

function makeElement(overrides = {}) {
  return {
    value: "",
    checked: false,
    title: "",
    type: "range",
    min: "1",
    max: "500",
    classList: {toggle() {}},
    setAttribute(name, value) {
      this[name] = value;
    },
    closest() { return null; },
    ...overrides
  };
}

function makeRoot(elements = {}) {
  const keydown = {capture: [], bubble: []};
  return {
    elements,
    body: {append() {}},
    createElement() {
      return makeElement({innerHTML: "", showModal() { this.open = true; }, close() { this.open = false; }});
    },
    getElementById(id) {
      return elements[id] || null;
    },
    addEventListener(type, listener, options) {
      if (type !== "keydown") return;
      const phase = options === true || options?.capture ? "capture" : "bubble";
      keydown[phase].push(listener);
    },
    removeEventListener(type, listener, options) {
      if (type !== "keydown") return;
      const phase = options === true || options?.capture ? "capture" : "bubble";
      const index = keydown[phase].indexOf(listener);
      if (index >= 0) keydown[phase].splice(index, 1);
    },
    dispatch(event) {
      const run = listener => {
        if (!event.__stopped) listener(event);
      };
      keydown.capture.forEach(run);
      keydown.bubble.forEach(run);
    }
  };
}

function keyEvent(key, options = {}) {
  let prevented = false;
  return {
    key,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    defaultPrevented: false,
    target: {closest: () => null},
    preventDefault() { prevented = true; this.defaultPrevented = true; },
    stopPropagation() { this.__stopped = true; },
    stopImmediatePropagation() { this.__stopped = true; },
    get prevented() { return prevented; },
    ...options
  };
}

function controlTarget(kind, overrides = {}) {
  const control = makeElement(overrides);
  control.closest = selector => {
    if (kind === "dialog" && selector.includes("dialog[open]")) return control;
    if (kind === "contenteditable" && selector.includes("[contenteditable]")) return control;
    if (selector.includes(kind)) return control;
    return null;
  };
  return control;
}

test("shortcut dispatcher nudges seed and blocks editing controls", () => {
  const root = makeRoot({
    seed: makeElement({value: "2", min: "1", max: "500"}),
    seedValue: makeElement({textContent: "2"})
  });
  const dirty = [];
  let renders = 0;
  const config = {seed: 2};
  const dispatcher = createShortcutDispatcher({
    root,
    config,
    els: {seed: root.elements.seed},
    withHistory: (_label, mutator) => mutator(),
    setOutputText: (_key, out, value) => { if (out) out.textContent = String(value); },
    handleControlDirty: key => dirty.push(key),
    queueRender: () => { renders += 1; }
  });

  const next = keyEvent("ArrowRight");
  dispatcher.handleKeydown(next);
  assert.equal(next.prevented, true);
  assert.equal(config.seed, 3);
  assert.equal(root.elements.seed.value, 3);
  assert.equal(root.elements.seedValue.textContent, "3");
  assert.deepEqual(dirty, ["seed"]);
  assert.equal(renders, 1);

  const inputTarget = {closest: selector => selector.includes("input") ? {} : null};
  const blocked = keyEvent("ArrowRight", {target: inputTarget});
  dispatcher.handleKeydown(blocked);
  assert.equal(blocked.prevented, false);
  assert.equal(config.seed, 3);
});


test("shortcut dispatcher wraps seed arrows at range boundaries", () => {
  const root = makeRoot({
    seed: makeElement({value: "500", min: "1", max: "500"}),
    seedValue: makeElement({textContent: "500"})
  });
  const config = {seed: 500};
  const dispatcher = createShortcutDispatcher({
    root,
    config,
    els: {seed: root.elements.seed},
    withHistory: (_label, mutator) => mutator(),
    setOutputText: (_key, out, value) => { if (out) out.textContent = String(value); },
    handleControlDirty: () => {},
    queueRender: () => {}
  });

  const right = keyEvent("ArrowRight");
  dispatcher.handleKeydown(right);
  assert.equal(right.prevented, true);
  assert.equal(config.seed, 1);
  assert.equal(root.elements.seed.value, 1);
  assert.equal(root.elements.seedValue.textContent, "1");

  const left = keyEvent("ArrowLeft");
  dispatcher.handleKeydown(left);
  assert.equal(left.prevented, true);
  assert.equal(config.seed, 500);
  assert.equal(root.elements.seed.value, 500);
  assert.equal(root.elements.seedValue.textContent, "500");
});

test("shortcut dispatcher keeps bracket keys on cycle offset and arrows on seed", () => {
  const root = makeRoot({
    seed: makeElement({value: "2", min: "1", max: "500"}),
    seedValue: makeElement({textContent: "2"}),
    cycleOffset: makeElement({value: "0"}),
    cycleOffsetValue: makeElement({textContent: "0"})
  });
  const dirty = [];
  const statuses = [];
  const switchedPresets = [];
  const config = {seed: 2, cycleOffset: 0};
  const state = {paletteRecords: [{}, {}, {}, {}]};
  const dispatcher = createShortcutDispatcher({
    root,
    config,
    state,
    els: {seed: root.elements.seed, cycleOffset: root.elements.cycleOffset},
    withHistory: (_label, mutator) => mutator(),
    setOutputText: (_key, out, value) => { if (out) out.textContent = String(value); },
    handleControlDirty: key => dirty.push(key),
    normalizedCycleOffset: value => ((value % 4) + 4) % 4,
    syncCycleControls: () => {},
    switchPalettePreset: delta => { switchedPresets.push(delta); return true; },
    queueRender: () => {},
    setStatus: value => statuses.push(value)
  });

  const cycleNext = keyEvent("]");
  dispatcher.handleKeydown(cycleNext);
  assert.equal(cycleNext.prevented, true);
  assert.equal(config.cycleOffset, 1);
  assert.equal(config.seed, 2);

  const presetNext = keyEvent(".");
  dispatcher.handleKeydown(presetNext);
  assert.equal(presetNext.prevented, true);
  assert.deepEqual(switchedPresets, [1]);

  const seedNext = keyEvent("ArrowRight");
  dispatcher.handleKeydown(seedNext);
  assert.equal(seedNext.prevented, true);
  assert.equal(config.seed, 3);
  assert.equal(config.cycleOffset, 1);
});


test("shortcut dispatcher toggles inspector and gives its keys precedence while open", () => {
  const root = makeRoot({
    seed: makeElement({value: "2", min: "1", max: "500"}),
    seedValue: makeElement({textContent: "2"})
  });
  const calls = [];
  const config = {seed: 2, pixelBlockSize: 4};
  const state = {diagnostics: {pixel: {sourceHex: "#111111", finalHex: "#222222"}}};
  let inspectorOpen = false;
  const dispatcher = createShortcutDispatcher({
    root,
    config,
    state,
    els: {seed: root.elements.seed},
    withHistory: (_label, mutator) => mutator(),
    setOutputText: (_key, out, value) => { if (out) out.textContent = String(value); },
    handleControlDirty: key => calls.push(["dirty", key]),
    queueRender: () => calls.push(["render"]),
    togglePixelInspector: () => { inspectorOpen = !inspectorOpen; calls.push(["toggleInspector"]); },
    pixelInspectorPanelIsOpen: () => inspectorOpen,
    nudgeDiagnosticPixel: (dx, dy, options) => calls.push(["nudgePixel", dx, dy, options.step]),
    copyPixelHex: hex => calls.push(["copy", hex]),
    addPixelSourceToManualPalette: () => calls.push(["addSource"])
  });

  const toggle = keyEvent("i");
  dispatcher.handleKeydown(toggle);
  assert.equal(toggle.prevented, true);
  assert.equal(inspectorOpen, true);

  dispatcher.handleKeydown(keyEvent("ArrowRight", {shiftKey: true}));
  dispatcher.handleKeydown(keyEvent("a"));

  assert.equal(config.seed, 2);
  assert.deepEqual(calls, [
    ["toggleInspector"],
    ["nudgePixel", 1, 0, 4],
    ["addSource"]
  ]);
});



test("shortcut snapshots save without history and load with history", () => {
  const root = makeRoot();
  const calls = [];
  const statuses = [];
  const config = {seed: 10, paletteMode: "manual", manualPalette: [{hex: "#111111"}]};
  const clone = value => JSON.parse(JSON.stringify(value));
  const dispatcher = createShortcutDispatcher({
    root,
    config,
    cloneConfigSnapshot: () => clone(config),
    defaultConfigSnapshot: () => ({seed: 1, paletteMode: "generated", manualPalette: [{hex: "#000000"}]}),
    replaceConfigSnapshot: (snapshot, options) => {
      calls.push(["replace", clone(snapshot), options]);
      Object.keys(config).forEach(key => delete config[key]);
      Object.assign(config, clone(snapshot));
    },
    withHistory: (label, mutator) => {
      calls.push(["history", label]);
      return mutator();
    },
    setStatus: value => statuses.push(value)
  });

  const save = keyEvent("A", {shiftKey: true, code: "KeyA"});
  dispatcher.handleKeydown(save);
  assert.equal(save.prevented, true);
  assert.deepEqual(calls, []);
  assert.equal(statuses.at(-1), "Saved snapshot A.");

  config.seed = 42;
  config.manualPalette[0].hex = "#222222";

  const load = keyEvent("a", {code: "KeyA"});
  dispatcher.handleKeydown(load);
  assert.equal(load.prevented, true);
  assert.deepEqual(config, {seed: 10, paletteMode: "manual", manualPalette: [{hex: "#111111"}]});
  assert.deepEqual(calls, [
    ["history", "Load snapshot A"],
    ["replace", {seed: 10, paletteMode: "manual", manualPalette: [{hex: "#111111"}]}, {cancelPendingHistory: false}]
  ]);
  assert.equal(statuses.at(-1), "Loaded snapshot A.");
});


test("empty snapshot slots load the default config", () => {
  const root = makeRoot();
  const config = {seed: 42, paletteMode: "manual"};
  const clone = value => JSON.parse(JSON.stringify(value));
  const dispatcher = createShortcutDispatcher({
    root,
    config,
    cloneConfigSnapshot: () => clone(config),
    defaultConfigSnapshot: () => ({seed: 1, paletteMode: "generated"}),
    replaceConfigSnapshot: snapshot => {
      Object.keys(config).forEach(key => delete config[key]);
      Object.assign(config, clone(snapshot));
    },
    withHistory: (_label, mutator) => mutator()
  });

  const loadDefault = keyEvent("d", {code: "KeyD"});
  dispatcher.handleKeydown(loadDefault);

  assert.equal(loadDefault.prevented, true);
  assert.deepEqual(config, {seed: 1, paletteMode: "generated"});
});

test("shortcut dispatcher routes requested app actions", () => {
  const root = makeRoot({
    paletteMode: makeElement({type: "select", value: "generated"}),
    pixelPerfectToggle: makeElement({type: "checkbox"})
  });
  const calls = [];
  const config = {paletteMode: "generated", pixelPerfect: false, compareEnabled: false};
  const state = {diagnostics: {overlay: {mode: "none"}}, paletteRecords: []};
  const dispatcher = createShortcutDispatcher({
    root,
    config,
    state,
    els: {canvas: makeElement(), pixelPerfectToggle: root.elements.pixelPerfectToggle},
    withHistory: (label, mutator) => { calls.push(["history", label]); return mutator(); },
    setOutputText: () => {},
    handleControlDirty: key => calls.push(["dirty", key]),
    updateConditionalPanels: () => calls.push(["conditional"]),
    setCompareEnabled: value => { config.compareEnabled = value; calls.push(["compare", value]); },
    markTextureDirty: () => calls.push(["texture"]),
    queueRender: () => calls.push(["render"]),
    captureCurrentPaletteToManual: strategy => calls.push(["capture", strategy]),
    copyCurrentPaletteHexStrings: () => calls.push(["copyPaletteHexStrings"]),
    exportPalette: () => calls.push(["exportPalette"]),
    downloadFullImage: () => calls.push(["fullImage"]),
    setDiagnosticOverlay: next => { state.diagnostics.overlay = next; calls.push(["overlay", next.mode]); },
    updateDiagnostics: () => calls.push(["diagnostics"])
  });

  dispatcher.handleKeydown(keyEvent("c"));
  dispatcher.handleKeydown(keyEvent("C", {shiftKey: true}));
  dispatcher.handleKeydown(keyEvent("p"));
  dispatcher.handleKeydown(keyEvent("m"));
  dispatcher.handleKeydown(keyEvent("M", {shiftKey: true}));
  dispatcher.handleKeydown(keyEvent("x"));
  dispatcher.handleKeydown(keyEvent("X", {shiftKey: true}));
  dispatcher.handleKeydown(keyEvent("h"));

  assert.equal(config.compareEnabled, true);
  assert.equal(config.pixelPerfect, true);
  assert.equal(config.paletteMode, "manual");
  assert.deepEqual(calls.filter(call => call[0] === "capture"), [["capture", "replace"]]);
  assert.deepEqual(calls.filter(call => call[0] === "copyPaletteHexStrings"), [["copyPaletteHexStrings"]]);
  assert.deepEqual(calls.filter(call => call[0] === "exportPalette"), [["exportPalette"]]);
  assert.deepEqual(calls.filter(call => call[0] === "fullImage"), [["fullImage"]]);
  assert.deepEqual(state.diagnostics.overlay, {mode: "difference"});
});

test("B toggles the mask brush even while brush mode owns other shortcuts", () => {
  let clicks = 0;
  const maskPaint = makeElement({
    click() {
      clicks += 1;
      const mask = state.mask;
      mask.paintMode = mask.paintMode === "off" ? "paint" : "off";
    }
  });
  const root = makeRoot({maskPaint});
  const state = {mask: {paintMode: "off", dragging: false}};
  const dispatcher = createShortcutDispatcher({root, state, els: {maskPaint}});

  const pickUp = keyEvent("b", {code: "KeyB"});
  dispatcher.handleKeydown(pickUp);
  assert.equal(pickUp.prevented, true);
  assert.equal(clicks, 1);
  assert.equal(state.mask.paintMode, "paint");

  const seedWhilePainting = keyEvent("ArrowRight");
  dispatcher.handleKeydown(seedWhilePainting);
  assert.equal(seedWhilePainting.prevented, false);
  assert.equal(clicks, 1);

  const putDown = keyEvent("B", {code: "KeyB"});
  dispatcher.handleKeydown(putDown);
  assert.equal(putDown.prevented, true);
  assert.equal(clicks, 2);
  assert.equal(state.mask.paintMode, "off");
});


test("toolbar panel headings show their number shortcut hints", () => {
  function makeHeading(text, {directText = text, initialChildren = []} = {}) {
    const children = [...initialChildren];
    const heading = makeElement({
      textContent: text,
      dataset: {},
      children,
      childNodes: [{nodeType: 3, textContent: directText}, ...initialChildren],
      querySelector(selector) {
        if (selector === ".panel-hotkey-hint") return children.find(child => child.className === "panel-hotkey-hint") || null;
        if (selector === ".panel-reset-button") return children.find(child => child.className === "panel-reset-button") || null;
        return null;
      },
      insertBefore(child, before) {
        const index = before ? children.indexOf(before) : -1;
        if (index >= 0) children.splice(index, 0, child);
        else children.push(child);
      }
    });
    return heading;
  }

  const resetButton = makeElement({className: "panel-reset-button", textContent: "Reset"});
  const paletteHeading = makeHeading("PaletteReset", {directText: "Palette", initialChildren: [resetButton]});
  const maskHeading = makeHeading("Mask");
  const panels = [
    {dataset: {}, querySelector: selector => selector === "h2" ? paletteHeading : null},
    {dataset: {}, querySelector: selector => selector === "h2" ? maskHeading : null}
  ];
  const toolPane = makeElement({querySelectorAll: selector => selector === ".panel" ? panels : []});
  const root = makeRoot({toolPane});

  createShortcutDispatcher({root});

  assert.equal(paletteHeading["aria-keyshortcuts"], "1");
  assert.equal(paletteHeading.dataset.panelShortcut, "1");
  assert.equal(paletteHeading.querySelector(".panel-hotkey-hint").textContent, "1");
  assert.equal(maskHeading["aria-keyshortcuts"], "Shift+1");
  assert.equal(maskHeading.dataset.panelShortcut, "Shift+1");
  assert.equal(maskHeading.querySelector(".panel-hotkey-hint").textContent, "Shift+1");
});

test("shift-E rotates assignment mode even from focused controls", () => {
  const assignMode = makeElement({
    type: "select",
    value: "blend",
    options: [
      {value: "nearest", textContent: "Nearest"},
      {value: "blend", textContent: "Blend"},
      {value: "dither", textContent: "Dither"}
    ],
    closest(selector) { return selector.includes("select") ? this : null; }
  });
  const root = makeRoot({assignMode});
  const config = {assignMode: "blend"};
  const calls = [];
  const dispatcher = createShortcutDispatcher({
    root,
    config,
    els: {assignMode},
    withHistory: (label, mutator) => { calls.push(["history", label]); mutator(); },
    handleControlDirty: key => calls.push(["dirty", key]),
    updateConditionalPanels: () => calls.push(["panels"]),
    updateDiagnostics: () => calls.push(["diagnostics"]),
    queueRender: () => calls.push(["render"]),
    setStatus: value => calls.push(["status", value])
  });

  const event = keyEvent("E", {shiftKey: true, code: "KeyE", target: assignMode});
  dispatcher.handleKeydown(event);

  assert.equal(event.prevented, true);
  assert.equal(config.assignMode, "dither");
  assert.equal(assignMode.value, "dither");
  assert.deepEqual(calls, [
    ["history", "Rotate assignment mode"],
    ["dirty", "assignMode"],
    ["panels"],
    ["diagnostics"],
    ["render"],
    ["status", "Assignment: Dither."]
  ]);
});

test("Escape closes the inspector when a non-pixel tab is active", () => {
  let blurred = false;
  const select = makeElement({
    type: "select",
    blur() { blurred = true; },
    closest(selector) {
      if (selector === "dialog[open]") return null;
      return selector.includes("select") ? this : null;
    }
  });
  const root = makeRoot();
  const state = {diagnostics: {pixelInspectorOpen: true, inspectorTab: "diagnostics", pixel: {x: 1, y: 2}}};
  const calls = [];
  const dispatcher = createShortcutDispatcher({
    root,
    state,
    pixelInspectorPanelIsOpen: () => false,
    setPixelInspectorOpen: (open, options) => {
      state.diagnostics.pixelInspectorOpen = open;
      calls.push(["open", open, options?.announce]);
    }
  });

  const event = keyEvent("Escape", {target: select});
  dispatcher.handleKeydown(event);

  assert.equal(event.prevented, true);
  assert.equal(blurred, false);
  assert.equal(state.diagnostics.pixelInspectorOpen, false);
  assert.deepEqual(calls, [["open", false, true]]);
});

test("shortcut dispatcher opens toolbar panels by number chord", () => {
  const calls = [];
  const toolPane = makeElement({
    dispatchEvent(event) {
      calls.push([event.type, event.detail?.panelKey]);
      event.preventDefault?.();
      return false;
    }
  });
  const statuses = [];
  const root = makeRoot({toolPane});
  const dispatcher = createShortcutDispatcher({
    root,
    setStatus: value => statuses.push(value)
  });

  const palette = keyEvent("1", {code: "Digit1"});
  dispatcher.handleKeydown(palette);
  assert.equal(palette.prevented, true);

  const mask = keyEvent("!", {shiftKey: true, code: "Digit1"});
  dispatcher.handleKeydown(mask);
  assert.equal(mask.prevented, true);

  assert.deepEqual(calls, [
    ["palette-synth:focus-panel", "palette"],
    ["palette-synth:focus-panel", "mask"]
  ]);
  assert.deepEqual(statuses, ["Palette panel focused.", "Mask panel focused."]);
});


test("shortcut dispatcher routes shifted number chords to lower tool panels", () => {
  const calls = [];
  const toolPane = makeElement({
    dispatchEvent(event) {
      calls.push(["toolbar", event.type, event.detail?.panelKey]);
      event.preventDefault?.();
      return false;
    }
  });
  const statuses = [];
  const root = makeRoot({toolPane});
  const dispatcher = createShortcutDispatcher({
    root,
    setStatus: value => statuses.push(value)
  });

  const animationExport = keyEvent("#", {shiftKey: true, code: "Digit3"});
  dispatcher.handleKeydown(animationExport);

  assert.equal(animationExport.prevented, true);
  assert.deepEqual(calls, [
    ["toolbar", "palette-synth:focus-panel", "animation-export"]
  ]);
  assert.deepEqual(statuses, ["Animation export panel focused."]);
});


test("shortcut dispatcher reports panel collapse actions from the workbench", () => {
  const toolPane = makeElement({
    dispatchEvent(event) {
      event.detail.action = "collapsed";
      event.preventDefault?.();
      return false;
    }
  });
  const statuses = [];
  const root = makeRoot({toolPane});
  const dispatcher = createShortcutDispatcher({
    root,
    setStatus: value => statuses.push(value)
  });

  const ditherBlend = keyEvent("7", {code: "Digit7"});
  dispatcher.handleKeydown(ditherBlend);

  assert.equal(ditherBlend.prevented, true);
  assert.deepEqual(statuses, ["Dither / Blend panel collapsed."]);
});


test("shift-I cycles inspector tabs and opens the floating inspector", () => {
  const root = makeRoot({
    inspectorTabPixel: makeElement(),
    inspectorTabSelection: makeElement(),
    inspectorTabDiagnostics: makeElement()
  });
  const state = {diagnostics: {inspectorTab: "pixel", pixelInspectorOpen: false}};
  const calls = [];
  const dispatcher = createShortcutDispatcher({
    root,
    state,
    els: {
      inspectorTabPixel: root.elements.inspectorTabPixel,
      inspectorTabSelection: root.elements.inspectorTabSelection,
      inspectorTabDiagnostics: root.elements.inspectorTabDiagnostics
    },
    setPixelInspectorOpen: open => { state.diagnostics.pixelInspectorOpen = open; calls.push(["open", open]); },
    setInspectorTab: (tab, options) => { state.diagnostics.inspectorTab = tab; calls.push(["tab", tab, options?.focus, options?.announce, options?.update]); }
  });

  const first = keyEvent("I", {shiftKey: true, code: "KeyI"});
  dispatcher.handleKeydown(first);
  assert.equal(first.prevented, true);
  assert.equal(state.diagnostics.pixelInspectorOpen, true);
  assert.equal(state.diagnostics.inspectorTab, "selection");

  const rangeInput = makeElement({type: "range"});
  const second = keyEvent("İ", {
    shiftKey: true,
    code: "KeyI",
    target: {closest: selector => selector === "input" ? rangeInput : null}
  });
  dispatcher.handleKeydown(second);
  assert.equal(second.prevented, true);
  assert.equal(state.diagnostics.inspectorTab, "diagnostics");
  assert.deepEqual(calls, [
    ["tab", "selection", false, false, false],
    ["open", true],
    ["tab", "selection", true, true, undefined],
    ["tab", "diagnostics", true, true, undefined]
  ]);
});



test("shift-I capture handler works from focused controls", () => {
  const root = makeRoot({
    inspectorTabPixel: makeElement(),
    inspectorTabSelection: makeElement(),
    inspectorTabDiagnostics: makeElement()
  });
  const state = {diagnostics: {inspectorTab: "pixel", pixelInspectorOpen: false}};
  const dispatcher = createShortcutDispatcher({
    root,
    state,
    els: {
      inspectorTabPixel: root.elements.inspectorTabPixel,
      inspectorTabSelection: root.elements.inspectorTabSelection,
      inspectorTabDiagnostics: root.elements.inspectorTabDiagnostics
    },
    setPixelInspectorOpen: open => { state.diagnostics.pixelInspectorOpen = open; },
    setInspectorTab: tab => { state.diagnostics.inspectorTab = tab; }
  });

  let stopped = false;
  const focusedInput = makeElement({type: "text"});
  const event = keyEvent("I", {
    shiftKey: true,
    code: "KeyI",
    target: {closest: selector => selector === "input" ? focusedInput : null},
    stopPropagation() { stopped = true; }
  });

  dispatcher.handleCaptureKeydown(event);

  assert.equal(event.prevented, true);
  assert.equal(stopped, true);
  assert.equal(state.diagnostics.pixelInspectorOpen, true);
  assert.equal(state.diagnostics.inspectorTab, "selection");
});


test("unshifted uppercase I toggles inspector instead of cycling tabs", () => {
  const root = makeRoot({
    inspectorTabPixel: makeElement(),
    inspectorTabSelection: makeElement(),
    inspectorTabDiagnostics: makeElement()
  });
  const state = {diagnostics: {inspectorTab: "pixel", pixelInspectorOpen: false}};
  let toggles = 0;
  const dispatcher = createShortcutDispatcher({
    root,
    state,
    els: {
      inspectorTabPixel: root.elements.inspectorTabPixel,
      inspectorTabSelection: root.elements.inspectorTabSelection,
      inspectorTabDiagnostics: root.elements.inspectorTabDiagnostics
    },
    setPixelInspectorOpen: open => { state.diagnostics.pixelInspectorOpen = open; },
    setInspectorTab: tab => { state.diagnostics.inspectorTab = tab; },
    togglePixelInspector: () => { toggles += 1; }
  });

  const event = keyEvent("I", {code: "KeyI"});
  dispatcher.handleKeydown(event);

  assert.equal(event.prevented, true);
  assert.equal(toggles, 1);
  assert.equal(state.diagnostics.inspectorTab, "pixel");
});

test("shift-minus collapses toolbar panels through the collapse-all control", () => {
  let clicks = 0;
  const collapseAllPanelsButton = makeElement({
    click() { clicks += 1; }
  });
  const statuses = [];
  const root = makeRoot({collapseAllPanelsButton});
  const dispatcher = createShortcutDispatcher({
    root,
    setStatus: value => statuses.push(value)
  });

  const event = keyEvent("_", {shiftKey: true, code: "Minus"});
  dispatcher.handleKeydown(event);

  assert.equal(event.prevented, true);
  assert.equal(clicks, 1);
  assert.deepEqual(statuses, ["Toolbar panels collapsed."]);
});

test("escape blurs focused controls before shortcut blocking", () => {
  let blurred = false;
  const input = makeElement({
    type: "text",
    blur() { blurred = true; },
    closest(selector) {
      if (selector === "dialog[open]") return null;
      return selector.includes("input") ? this : null;
    }
  });
  const root = makeRoot();
  const dispatcher = createShortcutDispatcher({root});

  const escape = keyEvent("Escape", {target: input});
  dispatcher.handleKeydown(escape);

  assert.equal(escape.prevented, true);
  assert.equal(blurred, true);
});

test("shouldIgnoreShortcut blocks modifier chords and protected modal/editor targets", () => {
  assert.equal(shouldIgnoreShortcut(keyEvent("o", {ctrlKey: true})), true);
  assert.equal(shouldIgnoreShortcut(keyEvent("o", {target: controlTarget("dialog")})), true);
  assert.equal(shouldIgnoreShortcut(keyEvent("o", {target: controlTarget("textarea")})), true);
  assert.equal(shouldIgnoreShortcut(keyEvent("o", {target: controlTarget("contenteditable")})), true);
  assert.equal(shouldIgnoreShortcut(keyEvent("o")), false);
});

test("shouldIgnoreShortcut only blocks keys consumed by focused controls", () => {
  const range = controlTarget("input", {type: "range"});
  assert.equal(shouldIgnoreShortcut(keyEvent("ArrowRight", {target: range})), true);
  assert.equal(shouldIgnoreShortcut(keyEvent("g", {target: range})), false);

  const number = controlTarget("input", {type: "number"});
  assert.equal(shouldIgnoreShortcut(keyEvent("1", {target: number})), true);
  assert.equal(shouldIgnoreShortcut(keyEvent("ArrowUp", {target: number})), true);
  assert.equal(shouldIgnoreShortcut(keyEvent("g", {target: number})), false);
  assert.equal(shouldIgnoreShortcut(keyEvent("ArrowRight", {target: number})), false);
  assert.equal(shouldIgnoreShortcut(keyEvent("!", {target: number, shiftKey: true, code: "Digit1"})), false);

  const text = controlTarget("input", {type: "text"});
  assert.equal(shouldIgnoreShortcut(keyEvent("g", {target: text})), true);
  assert.equal(shouldIgnoreShortcut(keyEvent("ArrowRight", {target: text})), true);

  const readonlyText = controlTarget("input", {type: "text", readOnly: true});
  assert.equal(shouldIgnoreShortcut(keyEvent("g", {target: readonlyText})), false);

  const select = controlTarget("select");
  assert.equal(shouldIgnoreShortcut(keyEvent("g", {target: select})), true);
  assert.equal(shouldIgnoreShortcut(keyEvent("ArrowDown", {target: select})), true);
  assert.equal(shouldIgnoreShortcut(keyEvent("F5", {target: select})), false);
});

test("shift-P cycles palette swatch bar size", () => {
  const styleProps = {};
  const palettePreview = makeElement({
    style: {setProperty(name, value) { styleProps[name] = value; }},
    dataset: {}
  });
  const paletteSwatchScaleToggle = makeElement({type: "button", textContent: ""});
  const root = makeRoot({palettePreview, paletteSwatchScaleToggle});
  const config = {paletteSwatchScale: 1};
  const statuses = [];
  const history = [];
  const dispatcher = createShortcutDispatcher({
    root,
    config,
    els: {palettePreview, paletteSwatchScaleToggle},
    withHistory: (label, mutator) => {
      history.push(label);
      return mutator();
    },
    setStatus: value => statuses.push(value)
  });

  const event = keyEvent("P", {shiftKey: true});
  dispatcher.handleKeydown(event);

  assert.equal(event.prevented, true);
  assert.equal(config.paletteSwatchScale, 2);
  assert.equal(styleProps["--palette-swatch-scale"], "2");
  assert.equal(palettePreview.dataset.swatchScale, "2");
  assert.equal(paletteSwatchScaleToggle.textContent, "2×");
  assert.equal(paletteSwatchScaleToggle["aria-pressed"], "true");
  assert.deepEqual(history, ["Change palette swatch size"]);
  assert.deepEqual(statuses, ["Palette swatches 2×."]);
});
