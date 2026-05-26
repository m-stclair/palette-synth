import test from "node:test";
import assert from "node:assert/strict";
import { cloneDefaultConfig } from "../src/state/config.js";
import { createCosinePalette, createCosinePaletteResult } from "../src/palette/generation.js";

test("cosine palette supports custom a/b/c/d vectors", () => {
  const config = cloneDefaultConfig();
  config.paletteMode = "cosine";
  config.paletteSize = 6;
  config.cosinePreset = "custom";
  config.cosineCustomVectors = {
    a: [0.5, 0.5, 0.5],
    b: [0, 0, 0],
    c: [1, 1, 1],
    d: [0, 0, 0]
  };

  const records = createCosinePalette(config);

  assert.equal(records.length, 6);
  assert.equal(records.every(record => record.source === "cosine"), true);
  assert.equal(records.every(record => record.familyId.startsWith("cosine-custom-")), true);
});

test("cosine palette result records procedural trace for inspector", () => {
  const config = cloneDefaultConfig();
  config.paletteMode = "cosine";
  config.paletteSize = 9;
  config.cosinePreset = "aurora";
  config.seed = 12;

  const {records, trace} = createCosinePaletteResult(config, {captureTrace: true});

  assert.equal(trace.type, "procedural-cosine");
  assert.equal(trace.preset.key, "aurora");
  assert.equal(trace.families.length, 3);
  assert.equal(trace.curveSamples.length, 72);
  assert.equal(trace.finalPaletteSize, records.length);
  assert.equal(trace.families.every(family => family.records.length === 3), true);
  assert.equal(trace.families.every(family => family.displayIndexes.length === 3), true);
});


test("custom cosine can emit direct waveform colors without tint shade families", () => {
  const config = cloneDefaultConfig();
  config.paletteMode = "cosine";
  config.paletteSize = 8;
  config.cosinePreset = "custom";
  config.cosineCustomTintShadeFamilies = false;

  const {records, trace} = createCosinePaletteResult(config, {captureTrace: true});

  assert.equal(records.length, 8);
  assert.equal(trace.tintShadeFamilies, false);
  assert.equal(trace.requestedSize, 8);
  assert.equal(trace.familyCount, 8);
  assert.equal(trace.finalPaletteSize, 8);
  assert.equal(trace.families.length, 8);
  assert.equal(records.every(record => record.variant === "single"), true);
  assert.equal(records.every(record => record.role === "cosine-waveform-swatch"), true);
  assert.equal(trace.families.every(family => family.records.length === 1), true);
});

test("built-in cosine presets ignore the custom-only tint shade toggle", () => {
  const config = cloneDefaultConfig();
  config.paletteMode = "cosine";
  config.paletteSize = 8;
  config.cosinePreset = "aurora";
  config.cosineCustomTintShadeFamilies = false;

  const {records, trace} = createCosinePaletteResult(config, {captureTrace: true});

  assert.equal(records.length, 9);
  assert.equal(trace.tintShadeFamilies, true);
  assert.equal(trace.familyCount, 3);
  assert.equal(trace.families.every(family => family.records.length === 3), true);
});
