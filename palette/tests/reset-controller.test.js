import test from "node:test";
import assert from "node:assert/strict";
import { createResetController } from "../src/app/reset-controller.js";
import { cloneDefaultConfig } from "../src/state/config.js";

function makeState() {
  return {
    paletteRegion: {
      enabled: true,
      dragging: true,
      pointerId: 10,
      start: {x: 1, y: 2},
      draftRect: {x: 1, y: 2, width: 3, height: 4}
    }
  };
}

test("reset controller routes reset through snapshot replacement without cancelling pending history", () => {
  const calls = [];
  let snapshot = null;
  let options = null;
  const controller = createResetController({
    state: makeState(),
    replaceConfigSnapshot(nextSnapshot, nextOptions) {
      snapshot = nextSnapshot;
      options = nextOptions;
      calls.push("replaceConfigSnapshot");
    },
    resetView(queue) {
      calls.push(["resetView", queue]);
    },
    resetPaletteRegion(regionOptions) {
      calls.push(["resetPaletteRegion", regionOptions]);
    }
  });

  controller.resetSettings();

  assert.equal(snapshot.paletteMode, "generated");
  assert.equal(snapshot.presetName, "amigaWorkbench");
  assert.equal(snapshot.levelsShoulder, 2.5);
  assert.deepEqual(options, {cancelPendingHistory: false});
  assert.deepEqual(calls, [
    "replaceConfigSnapshot",
    ["resetView", false],
    ["resetPaletteRegion", {announce: false, dirty: false}]
  ]);
});

function makePanel(controls) {
  return {
    querySelectorAll(selector) {
      assert.equal(selector, "input[id], select[id], textarea[id]");
      return controls;
    }
  };
}

test("reset controller resets only config-backed controls in a panel", () => {
  const config = cloneDefaultConfig();
  config.paletteSize = 42;
  config.levelsExposure = 2;
  config.selectWeights = [1.1, 1.2, 1.3];
  let snapshot = null;
  let status = "";
  const controller = createResetController({
    state: makeState(),
    config,
    replaceConfigSnapshot(nextSnapshot) {
      snapshot = nextSnapshot;
    },
    setStatus: text => { status = text; }
  });

  const changed = controller.resetPanelControls(makePanel([
    {id: "paletteSize", type: "range"},
    {id: "selectOutlier", type: "range"},
    {id: "referenceImageInput", type: "file"}
  ]), {label: "Palette"});

  assert.equal(changed, true);
  assert.equal(snapshot.paletteSize, 15);
  assert.equal(snapshot.levelsExposure, 2);
  assert.deepEqual(snapshot.selectWeights, [1.1, 0, 1.3]);
  assert.equal(status, "Reset Palette controls.");
});

test("reset controller resets animation export controls without replacing config", () => {
  const state = makeState();
  state.animationExport = {
    frameCount: 48,
    fps: 24,
    step: 6,
    prefix: "custom",
    exporting: false
  };
  let replaceCount = 0;
  let syncCount = 0;
  const controller = createResetController({
    state,
    config: cloneDefaultConfig(),
    replaceConfigSnapshot() { replaceCount++; },
    syncAnimationExportUi() { syncCount++; }
  });

  const changed = controller.resetPanelControls(makePanel([
    {id: "animFrameCount", type: "number"},
    {id: "animPrefix", type: "text"}
  ]));

  assert.equal(changed, true);
  assert.equal(replaceCount, 0);
  assert.equal(syncCount, 1);
  assert.equal(state.animationExport.frameCount, null);
  assert.equal(state.animationExport.fps, 24);
  assert.equal(state.animationExport.step, 6);
  assert.equal(state.animationExport.prefix, "palette-synth-frame");
});

test("reset controller falls back to DOM defaults for plain panel controls", () => {
  const events = [];
  const recipeName = {
    id: "recipeName",
    type: "text",
    tagName: "INPUT",
    value: "edited",
    defaultValue: "",
    dispatchEvent(event) { events.push(event.type); }
  };
  const controller = createResetController({
    state: makeState(),
    config: cloneDefaultConfig(),
    replaceConfigSnapshot() {}
  });

  const changed = controller.resetPanelControls(makePanel([recipeName]));

  assert.equal(changed, true);
  assert.equal(recipeName.value, "");
  assert.deepEqual(events, ["input", "change"]);
});
