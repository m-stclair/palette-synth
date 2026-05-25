import test from "node:test";
import assert from "node:assert/strict";
import { createDiagnosticsController, panelIsOpen } from "../src/diagnostics/controller.js";

function makePanel({hidden = false, collapsed = false} = {}) {
  return {
    hidden,
    classList: {
      contains: name => name === "is-collapsed" && collapsed
    }
  };
}

function elementIn(panel) {
  return {closest: () => panel};
}

test("panelIsOpen respects hidden and collapsed diagnostics panels", () => {
  assert.equal(panelIsOpen(makePanel()), true);
  assert.equal(panelIsOpen(makePanel({hidden: true})), false);
  assert.equal(panelIsOpen(makePanel({collapsed: true})), false);
  assert.equal(panelIsOpen(null), false);
});

test("diagnostics controller skips full diagnostics while the palette diagnostics panel is closed", () => {
  let rendered = 0;
  const state = {imageData: null, diagnostics: {stats: "old", signature: "old"}, paletteRecords: []};
  const controller = createDiagnosticsController({
    els: {},
    state,
    config: {},
    renderDiagnosticsPanel: () => { rendered++; }
  });

  controller.updateDiagnostics();
  controller.updateDiagnostics({force: true});
  assert.equal(rendered, 0);
  assert.equal(state.diagnostics.stats, "old");
  assert.equal(state.diagnostics.signature, "old");
});

test("diagnostics controller does not run full diagnostics just because the pixel inspector is open", () => {
  let computed = 0;
  let rendered = 0;
  const pixelPanel = makePanel();
  const state = {
    imageData: {width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255])},
    diagnostics: {stats: "old", signature: "old"},
    paletteRecords: [{lab: [0, 0, 0]}],
    paletteDirty: false
  };
  const controller = createDiagnosticsController({
    els: {diagnosticsPixel: elementIn(pixelPanel)},
    state,
    config: {},
    renderPaletteLabs: () => [[0, 0, 0]],
    paletteUniformEntries: () => [{renderLab: [0, 0, 0]}],
    diagnosticsSignature: () => "new",
    computeDiagnostics: () => { computed++; return {signature: "new"}; },
    renderDiagnosticsPanel: () => { rendered++; }
  });

  controller.updateDiagnostics();
  controller.updateDiagnostics({force: true});

  assert.equal(computed, 0);
  assert.equal(rendered, 0);
  assert.equal(state.diagnostics.signature, "old");
});


test("floating pixel inspector uses state, not DOM panel inference, as its open truth", () => {
  const pane = makePanel({hidden: true});
  const toggle = {pressed: null, active: null, setAttribute(name, value) { if (name === "aria-pressed") this.pressed = value; }, classList: {toggle: (_name, value) => { toggle.active = value; }}};
  const canvas = {inspecting: null, classList: {toggle: (_name, value) => { canvas.inspecting = value; }}};
  const statuses = [];
  const state = {diagnostics: {pixelInspectorOpen: false}};
  const controller = createDiagnosticsController({
    els: {pixelInspectorPane: pane, togglePixelInspector: toggle, canvas},
    state,
    config: {},
    updateDiagnosticsPixel: () => {},
    setStatus: value => statuses.push(value)
  });

  assert.equal(controller.pixelInspectorPanelIsOpen(), false);
  controller.togglePixelInspector({announce: true});
  assert.equal(state.diagnostics.pixelInspectorOpen, true);
  assert.equal(pane.hidden, false);
  assert.equal(toggle.pressed, "true");
  assert.equal(toggle.active, true);
  assert.equal(canvas.inspecting, true);

  controller.togglePixelInspector({announce: true});
  assert.equal(state.diagnostics.pixelInspectorOpen, false);
  assert.equal(pane.hidden, true);
  assert.equal(toggle.pressed, "false");
  assert.equal(toggle.active, false);
  assert.equal(canvas.inspecting, false);
  assert.deepEqual(statuses, [
    "Pixel inspector open. Click the preview to inspect.",
    "Pixel inspector closed."
  ]);
});


test("diagnostics controller refreshes family selection only while its inspector tab is visible", () => {
  let selected = 0;
  let computed = 0;
  let rendered = 0;
  const pixelPanel = makePanel();
  const selectionPanel = makePanel();
  const diagnosticsPanel = makePanel();
  const state = {
    imageData: {width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255])},
    diagnostics: {stats: "old", signature: "old", pixelInspectorOpen: true, inspectorTab: "selection"},
    paletteRecords: [{lab: [0, 0, 0]}],
    paletteDirty: false
  };
  const controller = createDiagnosticsController({
    els: {
      pixelInspectorPane: makePanel(),
      inspectorPanelPixel: pixelPanel,
      inspectorPanelSelection: selectionPanel,
      inspectorPanelDiagnostics: diagnosticsPanel
    },
    state,
    config: {},
    renderDiagnosticsSelection: () => { selected++; },
    computeDiagnostics: () => { computed++; return {signature: "new"}; },
    renderDiagnosticsPanel: () => { rendered++; }
  });

  controller.updateDiagnostics();

  assert.equal(selected, 1);
  assert.equal(computed, 0);
  assert.equal(rendered, 0);
  assert.equal(state.diagnostics.signature, "old");

  controller.setInspectorTab("pixel", {update: false});
  controller.updateDiagnostics();
  assert.equal(selected, 1);
});




test("diagnostics controller requests selection trace only for generated selection tab", () => {
  const ensureCalls = [];
  let selected = 0;
  const state = {
    imageData: {width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255])},
    diagnostics: {pixelInspectorOpen: true, inspectorTab: "selection"},
    paletteRecords: [{lab: [0, 0, 0]}],
    paletteSelectionTrace: null,
    paletteDirty: false
  };
  const controller = createDiagnosticsController({
    els: {
      pixelInspectorPane: makePanel(),
      inspectorPanelSelection: makePanel(),
      inspectorPanelDiagnostics: makePanel()
    },
    state,
    config: {paletteMode: "generated"},
    ensurePalette: options => {
      ensureCalls.push(options);
      state.paletteSelectionTrace = {rounds: []};
    },
    renderDiagnosticsSelection: () => { selected++; }
  });

  controller.updateDiagnostics();
  assert.deepEqual(ensureCalls, [{captureTrace: true}]);
  assert.equal(selected, 1);

  state.paletteSelectionTrace = null;
  controller.setInspectorTab("pixel", {update: false});
  controller.updateDiagnostics();
  assert.deepEqual(ensureCalls, [{captureTrace: true}]);
});

test("diagnostics controller renders X-Ray tab from palette records without image sampling", () => {
  let xrayRendered = 0;
  let computed = 0;
  const pane = makePanel();
  const xrayPanel = makePanel();
  const records = [{lab: [45, 10, 0]}];
  const state = {
    imageData: null,
    diagnostics: {stats: null, signature: "old", pixelInspectorOpen: true, inspectorTab: "xray"},
    paletteRecords: records,
    paletteDirty: false
  };
  const controller = createDiagnosticsController({
    els: {pixelInspectorPane: pane, inspectorPanelXray: xrayPanel},
    state,
    config: {},
    renderPaletteLabs: () => [[45, 10, 0]],
    paletteUniformEntries: () => [{renderLab: [45, 10, 0], featureLab: [45, 10, 0]}],
    computeDiagnostics: () => { computed++; return {signature: "new"}; },
    renderDiagnosticsXray: value => {
      xrayRendered++;
      assert.equal(value.records, records);
    }
  });

  controller.updateDiagnostics();

  assert.equal(xrayRendered, 1);
  assert.equal(computed, 0);
  assert.equal(state.diagnostics.signature, "");
});

test("diagnostics controller runs full diagnostics when the palette diagnostics panel is open", () => {
  let computed = 0;
  let rendered = 0;
  const diagnosticsPanel = makePanel();
  const state = {
    imageData: {width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255])},
    diagnostics: {stats: null, signature: "old"},
    paletteRecords: [{lab: [0, 0, 0]}],
    paletteDirty: false
  };
  const controller = createDiagnosticsController({
    els: {diagnosticsSummary: elementIn(diagnosticsPanel)},
    state,
    config: {},
    renderPaletteLabs: () => [[0, 0, 0]],
    paletteUniformEntries: () => [{renderLab: [0, 0, 0]}],
    diagnosticsSignature: () => "new",
    computeDiagnostics: () => { computed++; return {signature: "new"}; },
    renderDiagnosticsPanel: value => { rendered++; assert.equal(value.signature, "new"); }
  });

  controller.updateDiagnostics();

  assert.equal(computed, 1);
  assert.equal(rendered, 1);
  assert.equal(state.diagnostics.signature, "new");
});

test("diagnostics controller coalesces scheduled diagnostics updates into one frame", () => {
  const frames = [];
  let computed = 0;
  let rendered = 0;
  const diagnosticsPanel = makePanel();
  const state = {
    imageData: {width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255])},
    diagnostics: {stats: null, signature: "old"},
    paletteRecords: [{lab: [0, 0, 0]}],
    paletteDirty: false
  };
  const controller = createDiagnosticsController({
    els: {diagnosticsSummary: elementIn(diagnosticsPanel)},
    state,
    config: {},
    renderPaletteLabs: () => [[0, 0, 0]],
    paletteUniformEntries: () => [{renderLab: [0, 0, 0]}],
    diagnosticsSignature: () => "new",
    computeDiagnostics: () => { computed++; return {signature: "new"}; },
    renderDiagnosticsPanel: () => { rendered++; },
    requestFrame: callback => {
      frames.push(callback);
      return frames.length;
    }
  });

  controller.updateDiagnostics();
  controller.updateDiagnostics();

  assert.equal(frames.length, 1);
  assert.equal(computed, 0);
  frames[0](100);
  assert.equal(computed, 1);
  assert.equal(rendered, 1);
});

test("diagnostics controller skips queued same-frame work after an immediate render refresh", () => {
  const frames = [];
  let computed = 0;
  let rendered = 0;
  const diagnosticsPanel = makePanel();
  const state = {
    imageData: {width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255])},
    diagnostics: {stats: null, signature: "old"},
    paletteRecords: [{lab: [0, 0, 0]}],
    paletteDirty: false
  };
  const controller = createDiagnosticsController({
    els: {diagnosticsSummary: elementIn(diagnosticsPanel)},
    state,
    config: {},
    renderPaletteLabs: () => [[0, 0, 0]],
    paletteUniformEntries: () => [{renderLab: [0, 0, 0]}],
    diagnosticsSignature: () => "new",
    computeDiagnostics: () => { computed++; return {signature: "new"}; },
    renderDiagnosticsPanel: () => { rendered++; },
    requestFrame: callback => {
      frames.push(callback);
      return frames.length;
    }
  });

  controller.updateDiagnostics();
  controller.updateDiagnostics({immediate: true, frameTime: 200});
  frames[0](200);

  assert.equal(computed, 1);
  assert.equal(rendered, 1);
});

test("diagnostics controller lets the post-render refresh win when a queued pass ran first in the same frame", () => {
  const frames = [];
  let computed = 0;
  let rendered = 0;
  let signature = "stale";
  const diagnosticsPanel = makePanel();
  const state = {
    imageData: {width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255])},
    diagnostics: {stats: null, signature: "old"},
    paletteRecords: [{lab: [0, 0, 0]}],
    paletteDirty: false
  };
  const controller = createDiagnosticsController({
    els: {diagnosticsSummary: elementIn(diagnosticsPanel)},
    state,
    config: {},
    renderPaletteLabs: () => [[0, 0, 0]],
    paletteUniformEntries: () => [{renderLab: [0, 0, 0]}],
    diagnosticsSignature: () => signature,
    computeDiagnostics: () => { computed++; return {signature}; },
    renderDiagnosticsPanel: () => { rendered++; },
    requestFrame: callback => {
      frames.push(callback);
      return frames.length;
    }
  });

  controller.updateDiagnostics();
  frames[0](300);
  signature = "fresh";
  controller.updateDiagnostics({immediate: true, frameTime: 300});

  assert.equal(computed, 2);
  assert.equal(rendered, 2);
  assert.equal(state.diagnostics.signature, "fresh");
});

test("diagnostics controller inspects a client point and refreshes pixel UI", () => {
  let refreshed = 0;
  const state = {
    imageData: {width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255])},
    paletteRecords: [{}],
    diagnostics: {}
  };
  const match = {renderLab: [0, 0, 0], displayIndex: 0};
  const controller = createDiagnosticsController({
    els: {},
    state,
    config: {blendAmount: 1},
    ensurePalette: () => {},
    renderPaletteLabs: () => [[0, 0, 0]],
    paletteUniformEntries: () => [{renderLab: [0, 0, 0], featureLab: [0, 0, 0], sourceRecord: state.paletteRecords[0]}],
    clientPointToImagePixel: () => ({x: 0, y: 0}),
    topPaletteMatches: () => [match],
    assignmentWeights: () => [1],
    updateDiagnosticsPixel: () => { refreshed++; }
  });

  controller.inspectDiagnosticPixel(10, 20);

  assert.equal(refreshed, 1);
  assert.equal(state.diagnostics.pixel.sourceHex, "#000000");
  assert.equal(state.diagnostics.pixel.assigned, match);
});

test("diagnostics controller inspects against the palette after ensurePalette refreshes state", () => {
  const staleRecord = {id: "stale"};
  const freshRecord = {id: "fresh"};
  const state = {
    imageData: {width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255])},
    paletteRecords: [staleRecord],
    diagnostics: {}
  };
  const controller = createDiagnosticsController({
    els: {},
    state,
    config: {blendAmount: 1},
    ensurePalette: () => { state.paletteRecords = [freshRecord]; },
    renderPaletteLabs: records => records.map((_, index) => [index, 0, 0]),
    paletteUniformEntries: records => records.map(record => ({
      sourceRecord: record,
      renderLab: [0, 0, 0],
      featureLab: [0, 0, 0]
    })),
    clientPointToImagePixel: () => ({x: 0, y: 0}),
    topPaletteMatches: (_lab, entries) => [{...entries[0], displayIndex: 0}],
    assignmentWeights: () => [1],
    updateDiagnosticsPixel: () => {}
  });

  controller.inspectDiagnosticPixel(0, 0);

  assert.equal(state.diagnostics.pixel.matches[0].sourceRecord.id, "fresh");
});

