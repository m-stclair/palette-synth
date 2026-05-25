import test from "node:test";
import assert from "node:assert/strict";
import { applyAutoSourceLevels } from "../src/ui/controls.js";

test("auto source levels writes exposure and gamma without touching curve or clarity", () => {
  const elements = {
    levelsExposure: {value: 0},
    levelsExposureValue: {textContent: ""},
    levelsGamma: {value: 1},
    levelsGammaValue: {textContent: ""}
  };
  const root = {getElementById: id => elements[id] || null};
  const config = {
    levelsExposure: 0,
    levelsGamma: 1,
    levelsShoulder: 2.5,
    levelsCurveAmount: 0.35,
    clarityAmount: 0.2
  };
  const calls = [];

  const changed = applyAutoSourceLevels({
    state: {originalCanvas: {}, originalCtx: {}},
    config,
    root,
    setOutputText: (key, out, value) => { out.textContent = String(value); },
    handleControlDirty: key => calls.push(["dirty", key]),
    queueRender: () => calls.push("render"),
    setStatus: text => calls.push(["status", text]),
    calculator: () => ({levelsExposure: 0.75, levelsGamma: 1.2, lowTarget: 0.24, highTarget: 0.92, lowPercentile: 0.10, highPercentile: 0.90})
  });

  assert.equal(changed, true);
  assert.equal(config.levelsExposure, 0.75);
  assert.equal(config.levelsGamma, 1.2);
  assert.equal(config.levelsShoulder, 2.5);
  assert.equal(config.levelsCurveAmount, 0.35);
  assert.equal(config.clarityAmount, 0.2);
  assert.equal(elements.levelsExposure.value, 0.75);
  assert.equal(elements.levelsGammaValue.textContent, "1.2");
  assert.deepEqual(calls, [
    ["dirty", "levelsExposure"],
    "render",
    ["status", "Auto levels: lifted p90 to 92%."]
  ]);
});

test("auto source levels reports failure without invalidating render", () => {
  const calls = [];
  const changed = applyAutoSourceLevels({
    state: {},
    config: {levelsExposure: 0, levelsGamma: 1},
    root: {getElementById: () => null},
    handleControlDirty: key => calls.push(["dirty", key]),
    queueRender: () => calls.push("render"),
    setStatus: text => calls.push(["status", text]),
    calculator: () => null
  });

  assert.equal(changed, false);
  assert.deepEqual(calls, [["status", "Could not auto-level this source image."]]);
});
