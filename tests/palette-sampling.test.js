import test from "node:test";
import assert from "node:assert/strict";
import { paletteSampleCacheKey, samplePaletteLabs } from "../src/palette/sampling.js";
import { createGeneratedPalette } from "../src/palette/generation.js";
import { targetBandCounts } from "../src/palette/selection.js";
import { DEFAULT_CONFIG } from "../src/state/config.js";

test("samplePaletteLabs caches palette candidate samples on capable image sources", () => {
  let dataReads = 0;
  const data = new Uint8ClampedArray([
    255, 0, 0, 255,
    0, 255, 0, 255
  ]);
  const cache = new Map();
  const imageData = {
    width: 2,
    height: 1,
    get data() {
      dataReads += 1;
      return data;
    },
    getCachedSample(key, producer) {
      if (!cache.has(key)) cache.set(key, producer());
      return cache.get(key);
    }
  };
  const origins = [[0, 0], [1, 0]];
  const cacheKey = paletteSampleCacheKey({sampleCount: 2, width: 2, height: 1, seed: 1, samplingMode: "stratified", blockSize: 1});

  const first = samplePaletteLabs(imageData, 2, 1, origins, 1, cacheKey);
  const second = samplePaletteLabs(imageData, 2, 1, origins, 1, cacheKey);
  const third = samplePaletteLabs(imageData, 2, 1, origins, 1, `${cacheKey}:different`);

  assert.equal(first, second);
  assert.notEqual(first, third);
  assert.equal(dataReads, 2);
  assert.equal(cache.size, 2);
});


test("generated palette generation reuses cached candidate samples across non-sampling setting changes", () => {
  let dataReads = 0;
  const data = new Uint8ClampedArray([
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 255,
    255, 255, 255, 255
  ]);
  const cache = new Map();
  const imageData = {
    width: 2,
    height: 2,
    get data() {
      dataReads += 1;
      return data;
    },
    getCachedSample(key, producer) {
      if (!cache.has(key)) cache.set(key, producer());
      return cache.get(key);
    }
  };
  const config = {
    ...DEFAULT_CONFIG,
    paletteSize: 6,
    seed: 3,
    samplingMode: "stratified",
    blockSize: 1,
    selectionMidtoneWeight: 0.1,
    selectionOutlierWeight: 0.2,
    selectionChromaWeight: 0.3,
    generatedLocks: []
  };

  const first = createGeneratedPalette({config, mode: "generated", imageData});
  const second = createGeneratedPalette({
    config: {...config, selectionMidtoneWeight: 0.3, selectionOutlierWeight: 0.1, selectionChromaWeight: 0.2, minDistance: config.minDistance + 1},
    mode: "generated",
    imageData
  });

  assert.ok(first.records.length > 0);
  assert.ok(second.records.length > 0);
  assert.equal(dataReads, 1);
  assert.equal(cache.size, 1);
});

test("generated locks seed selection before automatic families are picked", () => {
  const data = new Uint8ClampedArray([
    255, 0, 0, 255,     0, 255, 0, 255,     0, 0, 255, 255,     255, 255, 255, 255,
    255, 255, 0, 255,   0, 255, 255, 255,   255, 0, 255, 255,   0, 0, 0, 255,
    120, 60, 30, 255,   30, 120, 60, 255,   60, 30, 120, 255,   220, 120, 60, 255,
    60, 220, 120, 255,  120, 60, 220, 255,  220, 220, 220, 255, 40, 40, 40, 255
  ]);
  const imageData = {width: 4, height: 4, data};
  const config = {
    ...DEFAULT_CONFIG,
    paletteSize: 9,
    seed: 2,
    samplingMode: "stratified",
    blockSize: 1,
    minDistance: 30,
    selectionMidtoneWeight: 0.1,
    selectionOutlierWeight: 0.2,
    selectionChromaWeight: 0.3,
    generatedLocks: [{id: "lock-red", hex: "#ff0000"}],
    generatedTintShadeFamilies: true
  };

  const result = createGeneratedPalette({config, mode: "generated", imageData, captureTrace: true});
  const lockedRecords = result.records.filter(record => record.locked);

  assert.equal(result.records.length, 9);
  assert.equal(lockedRecords.length, 3);
  assert.equal(lockedRecords.every(record => record.lockId === "lock-red"), true);
  assert.equal(result.trace.rounds.length, 2);
  assert.equal(result.trace.rounds[0].slot, 1);
  assert.equal(result.trace.rounds[0].spacing.selectedFamilyCount, 1);
  assert.deepEqual(result.trace.rounds[0].selectedFamilyHexes[0], ["#ff0000", "#ff937a", "#8e0000"]);
});

test("generated image palettes can select individual colors without tint/shade families", () => {
  const data = new Uint8ClampedArray([
    255, 0, 0, 255,       0, 255, 0, 255,       0, 0, 255, 255,
    255, 255, 0, 255,     0, 255, 255, 255,     255, 0, 255, 255,
    255, 128, 0, 255,     128, 0, 255, 255,     0, 0, 0, 255
  ]);
  const imageData = {width: 3, height: 3, data};
  const config = {
    ...DEFAULT_CONFIG,
    paletteSize: 6,
    generatedTintShadeFamilies: false,
    seed: 4,
    samplingMode: "stratified",
    blockSize: 1,
    minDistance: 12,
    selectionMidtoneWeight: 0.1,
    selectionOutlierWeight: 0.2,
    selectionChromaWeight: 0.3,
    generatedLocks: []
  };

  const result = createGeneratedPalette({config, mode: "generated", imageData, captureTrace: true});

  assert.equal(result.records.length, 6);
  assert.equal(result.records.every(record => record.variant === "single"), true);
  assert.equal(result.records.every(record => !["tint", "shade", "base"].includes(record.variant)), true);
  assert.equal(result.trace.selectionCount, 6);
  assert.equal(result.trace.tintShadeFamilies, false);
  assert.equal(result.trace.spacingMode, "color");
  assert.deepEqual(result.trace.tonalTargets, [
    {band: "shadow", count: 1},
    {band: "midtone", count: 2},
    {band: "highlight", count: 1}
  ]);
  assert.equal(result.trace.tonalTargetMode, "direct-colors");
  assert.equal(result.trace.tonalTargetBoost, 0);
  assert.equal(result.trace.expansion, null);
});

test("direct-color tonal endpoint targets scale in six-color bands", () => {
  assert.deepEqual(targetBandCounts(2, {directColorTargets: true}), [1, 0, 1]);
  assert.deepEqual(targetBandCounts(6, {directColorTargets: true}), [1, 2, 1]);
  assert.deepEqual(targetBandCounts(7, {directColorTargets: true}), [2, 3, 2]);
  assert.deepEqual(targetBandCounts(12, {directColorTargets: true}), [2, 4, 2]);
  assert.deepEqual(targetBandCounts(13, {directColorTargets: true}), [3, 6, 3]);
  assert.deepEqual(targetBandCounts(18, {directColorTargets: true}), [3, 6, 3]);
  assert.deepEqual(targetBandCounts(19, {directColorTargets: true}), [4, 8, 4]);
});

test("direct-color generated palettes use two shadow and highlight targets at seven or more colors", () => {
  const data = new Uint8ClampedArray([
    255, 0, 0, 255,       0, 255, 0, 255,       0, 0, 255, 255,
    255, 255, 0, 255,     0, 255, 255, 255,     255, 0, 255, 255,
    255, 128, 0, 255,     128, 0, 255, 255,     0, 0, 0, 255
  ]);
  const imageData = {width: 3, height: 3, data};
  const config = {
    ...DEFAULT_CONFIG,
    paletteSize: 7,
    generatedTintShadeFamilies: false,
    seed: 4,
    samplingMode: "stratified",
    blockSize: 1,
    minDistance: 12,
    selectionMidtoneWeight: 0.1,
    selectionOutlierWeight: 0.2,
    selectionChromaWeight: 0.3,
    generatedLocks: []
  };

  const result = createGeneratedPalette({config, mode: "generated", imageData, captureTrace: true});

  assert.equal(result.records.length, 7);
  assert.equal(result.trace.selectionCount, 7);
  assert.equal(result.trace.finalPaletteSize, 7);
  assert.deepEqual(result.trace.tonalTargets, [
    {band: "shadow", count: 2},
    {band: "midtone", count: 3},
    {band: "highlight", count: 2}
  ]);
});

test("generated image locks become individual colors when tint/shade families are disabled", () => {
  const data = new Uint8ClampedArray([
    255, 0, 0, 255,       0, 255, 0, 255,       0, 0, 255, 255,
    255, 255, 0, 255,     0, 255, 255, 255,     255, 0, 255, 255,
    255, 128, 0, 255,     128, 0, 255, 255,     0, 0, 0, 255
  ]);
  const imageData = {width: 3, height: 3, data};
  const config = {
    ...DEFAULT_CONFIG,
    paletteSize: 6,
    generatedTintShadeFamilies: false,
    seed: 4,
    samplingMode: "stratified",
    blockSize: 1,
    minDistance: 12,
    selectionMidtoneWeight: 0.1,
    selectionOutlierWeight: 0.2,
    selectionChromaWeight: 0.3,
    generatedLocks: [{id: "lock-red", hex: "#ff0000"}]
  };

  const result = createGeneratedPalette({config, mode: "generated", imageData});
  const lockedRecords = result.records.filter(record => record.locked);

  assert.equal(result.records.length, 6);
  assert.equal(lockedRecords.length, 1);
  assert.equal(lockedRecords[0].variant, "single");
  assert.equal(lockedRecords[0].role, "locked-color");
  assert.equal(lockedRecords[0].lockId, "lock-red");
});
