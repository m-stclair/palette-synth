import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONFIG,
  cloneConfigSnapshot,
  cloneDefaultConfig,
  normalizeCosineCustomVectors,
  normalizeCycleManualKeys,
  normalizeManualSwatches,
  normalizePaletteSwatchScale,
  nextPaletteSwatchScale,
  sanitizeConfigSnapshot
} from "../src/state/config.js";

test("default config clones are deep copies", () => {
  const a = cloneDefaultConfig();
  const b = cloneDefaultConfig();
  a.manualPalette[0].hex = "#ffffff";
  a.selectWeights[0] = 1.5;
  assert.equal(b.manualPalette[0].hex, DEFAULT_CONFIG.manualPalette[0].hex);
  assert.equal(b.selectWeights[0], DEFAULT_CONFIG.selectWeights[0]);

  const snapshot = cloneConfigSnapshot(a);
  snapshot.manualPalette[1].hex = "#000000";
  assert.notEqual(snapshot.manualPalette[1].hex, a.manualPalette[1].hex);
});

test("manual swatches normalize IDs, aliases, locks, and duplicates", () => {
  const swatches = normalizeManualSwatches([
    {id: "Accent", hex: "f04", alias: "00ff00", locked: true},
    {id: "Accent", color: "#112233", matchAliasHex: "not-a-color"},
    "abc"
  ]);

  assert.deepEqual(swatches.map(s => s.id), ["Accent", "Accent-2", "manual-3-aabbcc"]);
  assert.equal(swatches[0].hex, "#ff0044");
  assert.equal(swatches[0].aliasHex, "#00ff00");
  assert.equal(swatches[0].locked, true);
  assert.equal(swatches[1].aliasHex, null);
  assert.equal(swatches[2].hex, "#aabbcc");
});

test("cycle manual keys migrate legacy index keys and preserve generated keys", () => {
  const swatches = [
    {id: "First Swatch"},
    {id: "Second_Swatch"}
  ];
  assert.deepEqual(
    normalizeCycleManualKeys([
      "manual:manual-0:single:0",
      "Second_Swatch",
      "generated:family:single:0",
      "manual:missing"
    ], swatches),
    ["manual:first-swatch", "manual:second_swatch", "generated:family:single:0"]
  );
});

test("cycle manual keys survive mixed-case saved swatch IDs", () => {
  const swatches = [
    {id: "Manual-One"},
    {id: "manual-two"},
    {id: "Preset-AmigaWorkbench"}
  ];

  assert.deepEqual(
    normalizeCycleManualKeys([
      "manual:manual-one",
      "Manual-One",
      "manual-two",
      "generated:family:single:0"
    ], swatches),
    [
      "manual:manual-one",
      "manual:manual-two",
      "generated:family:single:0"
    ]
  );
});

test("config sanitization clamps values and honors injected preset lookup", () => {
  const clean = sanitizeConfigSnapshot({
    paletteMode: "nonsense",
    presetName: "customPreset",
    paletteSize: 17,
    seedSwatch: "not-a-color",
    harmonyRelationship: "bad",
    harmonyRegionContrast: "bad",
    harmonyRampSteepness: 99,
    cosinePreset: "bad",
    selectWeights: [2, -1, "0.25"],
    CYCLE_MODE: "manual",
    cycleManualKeys: ["Manual-One"],
    manualPalette: [{id: "Manual One", hex: "abc", aliasHex: "def"}],
    manualMatchAliases: ["123456"],
    paletteRegionRect: {x: -4.4, y: 2.2, width: 0, height: 12.7},
    levelsExposure: 99,
    levelsGamma: "nope",
    clarityAmount: 99,
    maxDistanceEnabled: true,
    maxDistance: 250,
    compareSplit: 2,
    pixelBlockSize: 99,
    pixelBlockSampleMode: "nonsense"
  }, {
    presetExists: name => name === "customPreset"
  });

  assert.equal(clean.paletteMode, DEFAULT_CONFIG.paletteMode);
  assert.equal(clean.presetName, "customPreset");
  assert.equal(clean.paletteSize, 18);
  assert.equal(clean.seedSwatch, DEFAULT_CONFIG.seedSwatch);
  assert.equal(clean.harmonyRegionContrast, DEFAULT_CONFIG.harmonyRegionContrast);
  assert.equal(clean.harmonyRampSteepness, 2.5);
  assert.deepEqual(clean.selectWeights, [1.5, 0, 0.25]);
  assert.equal(clean.CYCLE_MODE, "manual");
  assert.deepEqual(clean.cycleManualKeys, ["manual:manual-one"]);
  assert.deepEqual(clean.paletteRegionRect, {x: 0, y: 2, width: 1, height: 13});
  assert.equal(clean.levelsExposure, 4);
  assert.equal(clean.levelsGamma, DEFAULT_CONFIG.levelsGamma);
  assert.equal(clean.clarityAmount, 1);
  assert.equal(clean.maxDistanceEnabled, true);
  assert.equal(clean.maxDistance, 100);
  assert.equal(clean.compareSplit, 1);
  assert.equal(clean.pixelBlockSize, 16);
  assert.equal(clean.pixelBlockSampleMode, DEFAULT_CONFIG.pixelBlockSampleMode);
  assert.equal(clean.manualMatchAliases.length, 0);
});

test("palette swatch scale normalizes and cycles through allowed sizes", () => {
  assert.equal(normalizePaletteSwatchScale(2), 2);
  assert.equal(normalizePaletteSwatchScale("3"), 3);
  assert.equal(normalizePaletteSwatchScale(5), 1);
  assert.equal(nextPaletteSwatchScale(1), 2);
  assert.equal(nextPaletteSwatchScale(2), 3);
  assert.equal(nextPaletteSwatchScale(3), 1);
  assert.equal(sanitizeConfigSnapshot({paletteSwatchScale: 3}).paletteSwatchScale, 3);
  assert.equal(sanitizeConfigSnapshot({paletteSwatchScale: 99}).paletteSwatchScale, DEFAULT_CONFIG.paletteSwatchScale);
});

test("config sanitization preserves representative pixel block sampling", () => {
  const clean = sanitizeConfigSnapshot({pixelBlockSampleMode: "representative"});
  assert.equal(clean.pixelBlockSampleMode, "representative");
});


test("cosine custom vectors sanitize and preserve the custom preset", () => {
  const clean = sanitizeConfigSnapshot({
    cosinePreset: "custom",
    cosineCustomVectors: {
      a: ["0.1", "bad", 0.3],
      b: [-1, 0, 1],
      c: [],
      d: null
    }
  });

  assert.equal(clean.cosinePreset, "custom");
  assert.deepEqual(clean.cosineCustomVectors.a, [0.1, DEFAULT_CONFIG.cosineCustomVectors.a[1], 0.3]);
  assert.deepEqual(clean.cosineCustomVectors.b, [-1, 0, 1]);
  assert.deepEqual(clean.cosineCustomVectors.c, DEFAULT_CONFIG.cosineCustomVectors.c);
  assert.deepEqual(clean.cosineCustomVectors.d, DEFAULT_CONFIG.cosineCustomVectors.d);
  assert.deepEqual(normalizeCosineCustomVectors(null), DEFAULT_CONFIG.cosineCustomVectors);
});

test("config sanitization falls back when preset lookup rejects a preset", () => {
  const clean = sanitizeConfigSnapshot({presetName: "missingPreset"}, {presetExists: () => false});
  assert.equal(clean.presetName, DEFAULT_CONFIG.presetName);
});

test("config sanitization clamps post-process despeckle values", () => {
  const clean = sanitizeConfigSnapshot({
    despeckleEnabled: "yes",
    despeckleStrength: 99
  });
  assert.equal(clean.despeckleEnabled, true);
  assert.equal(clean.despeckleStrength, 4);
});

test("removed outline config keys are ignored during sanitization", () => {
  const clean = sanitizeConfigSnapshot({
    outlineEnabled: 1,
    outlineThickness: 0,
    outlineColor: "#abcdef",
    outlineOpacity: 0
  });
  assert.equal(Object.hasOwn(clean, "outlineEnabled"), false);
  assert.equal(Object.hasOwn(clean, "outlineThickness"), false);
  assert.equal(Object.hasOwn(clean, "outlineColor"), false);
  assert.equal(Object.hasOwn(clean, "outlineOpacity"), false);
});

test("post-process defaults are off and well-defined", () => {
  assert.equal(DEFAULT_CONFIG.despeckleEnabled, false);
  assert.equal(DEFAULT_CONFIG.despeckleStrength, 1);
});
