import test from "node:test";
import assert from "node:assert/strict";
import { paletteSampleCacheKey, samplePaletteLabs } from "../src/palette/sampling.js";
import { createGeneratedPalette } from "../src/palette/generation.js";
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
    selectWeights: [0.1, 0.2, 0.3],
    generatedLocks: []
  };

  const first = createGeneratedPalette({config, mode: "generated", imageData});
  const second = createGeneratedPalette({
    config: {...config, selectWeights: [0.3, 0.1, 0.2], minDistance: config.minDistance + 1},
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
    selectWeights: [0.1, 0.2, 0.3],
    generatedLocks: [{id: "lock-red", hex: "#ff0000"}]
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
