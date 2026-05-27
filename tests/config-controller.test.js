import test from "node:test";
import assert from "node:assert/strict";
import { createConfigController } from "../src/app/config-controller.js";
import { cloneDefaultConfig } from "../src/state/config.js";

function makeElement({type = "text", value = "", step = ""} = {}) {
  const classes = new Set();
  return {
    type,
    value,
    checked: false,
    textContent: "",
    step,
    classList: {
      contains: name => classes.has(name),
      toggle: (name, force) => {
        const shouldAdd = force ?? !classes.has(name);
        if (shouldAdd) classes.add(name);
        else classes.delete(name);
        return shouldAdd;
      }
    }
  };
}

function makeRoot(elements = {}) {
  return {
    getElementById(id) {
      return elements[id] || null;
    }
  };
}

test("config controller routes dirty keys to the right invalidators", () => {
  const calls = {levels: 0, palette: 0, texture: 0};
  const state = {};
  const controller = createConfigController({
    config: cloneDefaultConfig(),
    els: {},
    state,
    root: makeRoot(),
    markLevelsDirty: () => { calls.levels++; },
    markPaletteDirty: () => { calls.palette++; },
    markTextureDirty: () => { calls.texture++; }
  });

  controller.handleControlDirty("levelsExposure");
  controller.handleControlDirty("clarityAmount");
  controller.handleControlDirty("paletteSize");
  controller.handleControlDirty("pixelPerfect");
  controller.handleControlDirty("cycleOffset");
  controller.handleControlDirty("dynamicSkin");

  assert.deepEqual(calls, {levels: 2, palette: 1, texture: 1});
  assert.equal(state.swatchesDirty, true);
});

test("config controller formats output labels", () => {
  const config = cloneDefaultConfig();
  config.cyclePreviewSpeed = 3.25;
  const controller = createConfigController({config, els: {}, state: {}, root: makeRoot()});
  const speed = makeElement();
  const generic = makeElement();
  const ramp = makeElement();

  controller.setOutputText("cyclePreviewSpeed", speed);
  controller.setOutputText("paletteSize", generic, 21);
  controller.setOutputText("harmonyRampSteepness", ramp, 1.25);

  assert.equal(speed.textContent, "3.3 steps/s");
  assert.equal(generic.textContent, "21");
  assert.equal(ramp.textContent, "1.25×");
});

test("config controller replaces snapshots and syncs the app surface", () => {
  const config = cloneDefaultConfig();
  config.compareEnabled = true;
  config.compareSplit = 0.25;
  config.paletteSwatchScale = 3;
  const elements = {
    paletteSize: makeElement({type: "range"}),
    paletteSizeValue: makeElement(),
    pixelPerfect: makeElement({type: "checkbox"}),
    pixelPerfectValue: makeElement(),
    selectMidtone: makeElement({type: "range"}),
    selectMidtoneValue: makeElement(),
    selectOutlier: makeElement({type: "range"}),
    selectOutlierValue: makeElement(),
    selectChroma: makeElement({type: "range"}),
    selectChromaValue: makeElement()
  };
  const calls = [];
  const els = {canvas: makeElement(), pixelPerfectToggle: makeElement({type: "checkbox"})};
  const controller = createConfigController({
    config,
    els,
    state: {},
    root: makeRoot(elements),
    presetExists: name => name === "amigaWorkbench",
    stopCyclePreview: () => calls.push("stopCyclePreview"),
    cancelPendingHistory: () => calls.push("cancelPendingHistory"),
    closeManualPaletteEditor: () => calls.push("closeManualPaletteEditor"),
    markEverythingDirty: () => calls.push("markEverythingDirty"),
    queueRender: () => calls.push("queueRender"),
    renderManualSwatches: () => calls.push("renderManualSwatches"),
    updateConditionalPanels: () => calls.push("updateConditionalPanels"),
    updatePaletteRegionUi: () => calls.push("updatePaletteRegionUi"),
    updatePaletteRegionOverlay: () => calls.push("updatePaletteRegionOverlay"),
    syncCycleControls: () => calls.push("syncCycleControls"),
    updateViewStatus: () => calls.push("updateViewStatus"),
    updateHistoryButtons: () => calls.push("updateHistoryButtons"),
    syncCompareControls: () => calls.push("syncCompareControls")
  });

  controller.replaceConfigSnapshot({
    paletteMode: "generated",
    paletteSize: 20,
    pixelPerfect: true,
    generatedTintShadeFamilies: true,
    selectionMidtoneWeight: 0.2,
    selectionOutlierWeight: 0.4,
    selectionChromaWeight: 0.6
  });

  assert.equal(config.paletteSize, 21);
  assert.equal(config.pixelPerfect, true);
  assert.equal(config.compareEnabled, true);
  assert.equal(config.compareSplit, 0.25);
  assert.equal(config.paletteSwatchScale, 3);
  assert.equal(elements.paletteSize.value, 21);
  assert.equal(elements.paletteSizeValue.textContent, "21");
  assert.equal(elements.pixelPerfect.checked, true);
  assert.equal(els.pixelPerfectToggle.checked, true);
  assert.equal(elements.selectMidtone.value, 0.2);
  assert.equal(elements.selectOutlierValue.textContent, 0.4);
  assert.deepEqual(calls, [
    "stopCyclePreview",
    "cancelPendingHistory",
    "syncCompareControls",
    "renderManualSwatches",
    "updateConditionalPanels",
    "updatePaletteRegionUi",
    "updatePaletteRegionOverlay",
    "syncCycleControls",
    "updateViewStatus",
    "updateHistoryButtons",
    "closeManualPaletteEditor",
    "markEverythingDirty",
    "queueRender"
  ]);
});

test("config controller keeps direct-color sizes freeform and snaps family sizes", () => {
  const config = cloneDefaultConfig();
  const elements = {
    paletteSize: makeElement({type: "range"}),
    paletteSizeValue: makeElement()
  };
  const controller = createConfigController({
    config,
    els: {},
    state: {},
    root: makeRoot(elements)
  });

  controller.replaceConfigSnapshot({paletteMode: "generated", paletteSize: 20, generatedTintShadeFamilies: false});
  assert.equal(config.paletteSize, 20);
  assert.equal(elements.paletteSize.value, 20);
  assert.equal(elements.paletteSize.step, "1");
  assert.equal(elements.paletteSizeValue.textContent, "20");

  controller.replaceConfigSnapshot({paletteMode: "generated", paletteSize: 20, generatedTintShadeFamilies: true});
  assert.equal(config.paletteSize, 21);
  assert.equal(elements.paletteSize.value, 21);
  assert.equal(elements.paletteSize.step, "3");
  assert.equal(elements.paletteSizeValue.textContent, "21");

  controller.replaceConfigSnapshot({paletteMode: "harmony", paletteSize: 20, generatedTintShadeFamilies: true});
  assert.equal(config.paletteSize, 20);
  assert.equal(elements.paletteSize.value, 20);
  assert.equal(elements.paletteSize.step, "1");
  assert.equal(elements.paletteSizeValue.textContent, "20");
});

test("config controller can replace snapshots without cancelling pending history", () => {
  const calls = [];
  const controller = createConfigController({
    config: cloneDefaultConfig(),
    els: {},
    state: {},
    root: makeRoot(),
    presetExists: name => name === "amigaWorkbench",
    stopCyclePreview: () => calls.push("stopCyclePreview"),
    cancelPendingHistory: () => calls.push("cancelPendingHistory")
  });

  controller.replaceConfigSnapshot({paletteSize: 18}, {cancelPendingHistory: false});

  assert.deepEqual(calls, ["stopCyclePreview"]);
});
