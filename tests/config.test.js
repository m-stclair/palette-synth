import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONFIG,
  cloneConfigSnapshot,
  cloneDefaultConfig,
  cloneStoredConfigSnapshot,
  normalizeCosineCustomVectors,
  normalizeCycleManualKeys,
  normalizeManualSwatches,
  normalizePaletteSwatchScale,
  nextPaletteSwatchScale,
  preserveMissingTransientConfigState,
  sanitizeConfigSnapshot,
  stripTransientConfigState
} from "../src/state/config.js";

test("default config clones are deep copies", () => {
  const a = cloneDefaultConfig();
  const b = cloneDefaultConfig();
  a.manualPalette[0].hex = "#ffffff";
  a.selectionMidtoneWeight = 1.5;
  assert.equal(b.manualPalette[0].hex, DEFAULT_CONFIG.manualPalette[0].hex);
  assert.equal(b.selectionMidtoneWeight, DEFAULT_CONFIG.selectionMidtoneWeight);

  const snapshot = cloneConfigSnapshot(a);
  snapshot.manualPalette[1].hex = "#000000";
  assert.notEqual(snapshot.manualPalette[1].hex, a.manualPalette[1].hex);
});



test("stored config snapshots omit transient view-only state", () => {
  const config = {
    ...cloneDefaultConfig(),
    paletteSize: 18,
    paletteSwatchScale: 3,
    compareEnabled: true,
    compareSplit: 0.25
  };

  const stored = cloneStoredConfigSnapshot(config);

  assert.equal(stored.paletteSize, 18);
  assert.equal(Object.hasOwn(stored, "paletteSwatchScale"), false);
  assert.equal(Object.hasOwn(stored, "compareEnabled"), false);
  assert.equal(Object.hasOwn(stored, "compareSplit"), false);
  assert.deepEqual(stripTransientConfigState(config), stored);
});

test("missing transient config values can be preserved while applying stored snapshots", () => {
  const incoming = {paletteSize: 21};
  const current = {paletteSwatchScale: 3, compareEnabled: true, compareSplit: 0.35};

  assert.deepEqual(preserveMissingTransientConfigState(incoming, current), {
    paletteSize: 21,
    paletteSwatchScale: 3,
    compareEnabled: true,
    compareSplit: 0.35
  });
  assert.deepEqual(preserveMissingTransientConfigState({compareEnabled: false}, current), {
    compareEnabled: false,
    paletteSwatchScale: 3,
    compareSplit: 0.35
  });
});

test("manual swatches normalize IDs, aliases, locks, mutes, and duplicates", () => {
  const swatches = normalizeManualSwatches([
    {id: "Accent", hex: "f04", alias: "00ff00", locked: true, muted: true},
    {id: "Accent", color: "#112233", matchAliasHex: "not-a-color"},
    "abc"
  ]);

  assert.deepEqual(swatches.map(s => s.id), ["Accent", "Accent-2", "manual-3-aabbcc"]);
  assert.equal(swatches[0].hex, "#ff0044");
  assert.equal(swatches[0].aliasHex, "#00ff00");
  assert.equal(swatches[0].locked, true);
  assert.equal(swatches[0].muted, true);
  assert.equal(swatches[1].aliasHex, null);
  assert.equal(swatches[2].hex, "#aabbcc");
});


test("manual swatch normalization keeps at least one swatch assignable", () => {
  const swatches = normalizeManualSwatches([
    {id: "A", hex: "#111111", muted: true},
    {id: "B", hex: "#222222", muted: true}
  ]);

  assert.equal(swatches[0].muted, false);
  assert.equal(swatches[1].muted, true);
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
    selectionMidtoneWeight: 2,
    selectionOutlierWeight: -1.5,
    selectionChromaWeight: "0.25",
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
    pixelBlockSampleMode: "nonsense",
    tonalZoneWeight: 99,
    widthBonus: 99,
    generatedTintShadeFamilies: false,
    cosineCustomTintShadeFamilies: false
  }, {
    presetExists: name => name === "customPreset"
  });

  assert.equal(clean.paletteMode, DEFAULT_CONFIG.paletteMode);
  assert.equal(clean.presetName, "customPreset");
  assert.equal(clean.paletteSize, 17);
  assert.equal(clean.seedSwatch, DEFAULT_CONFIG.seedSwatch);
  assert.equal(clean.harmonyRegionContrast, DEFAULT_CONFIG.harmonyRegionContrast);
  assert.equal(clean.harmonyRampSteepness, 2.5);
  assert.equal(clean.selectionMidtoneWeight, 1);
  assert.equal(clean.selectionOutlierWeight, -1);
  assert.equal(clean.selectionChromaWeight, 0.25);
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
  assert.equal(clean.tonalZoneWeight, 2);
  assert.equal(clean.widthBonus, 2);
  assert.equal(clean.generatedTintShadeFamilies, false);
  assert.equal(clean.cosineCustomTintShadeFamilies, false);
  assert.equal(clean.manualMatchAliases.length, 0);
});

test("config sanitization keeps tonal zone and width multipliers in range", () => {
  assert.equal(sanitizeConfigSnapshot({tonalZoneWeight: 0}).tonalZoneWeight, 0);
  assert.equal(sanitizeConfigSnapshot({tonalZoneWeight: 1.5}).tonalZoneWeight, 1.5);
  assert.equal(sanitizeConfigSnapshot({tonalZoneWeight: -1}).tonalZoneWeight, 0);
  assert.equal(sanitizeConfigSnapshot({tonalZoneWeight: "nope"}).tonalZoneWeight, DEFAULT_CONFIG.tonalZoneWeight);
  assert.equal(sanitizeConfigSnapshot({widthBonus: 0}).widthBonus, 0);
  assert.equal(sanitizeConfigSnapshot({widthBonus: 1.5}).widthBonus, 1.5);
  assert.equal(sanitizeConfigSnapshot({widthBonus: -1}).widthBonus, 0);
  assert.equal(sanitizeConfigSnapshot({widthBonus: "nope"}).widthBonus, DEFAULT_CONFIG.widthBonus);
});

test("config sanitization migrates old tonal need bonus multiplier", () => {
  assert.equal(sanitizeConfigSnapshot({tonalNeedBonusWeight: 1.75}).tonalZoneWeight, 1.75);
  assert.equal(sanitizeConfigSnapshot({tonalZoneWeight: 0.5, tonalNeedBonusWeight: 1.75}).tonalZoneWeight, 0.5);
});

test("config sanitization keeps direct-color palette sizes and snaps family sizes", () => {
  const direct = sanitizeConfigSnapshot({paletteMode: "generated", paletteSize: 20, generatedTintShadeFamilies: false});
  const family = sanitizeConfigSnapshot({paletteMode: "generated", paletteSize: 20, generatedTintShadeFamilies: true});
  const harmony = sanitizeConfigSnapshot({paletteMode: "harmony", paletteSize: 20, generatedTintShadeFamilies: true});

  const customCosineDirect = sanitizeConfigSnapshot({paletteMode: "cosine", cosinePreset: "custom", paletteSize: 20, cosineCustomTintShadeFamilies: false});
  const customCosineFamilies = sanitizeConfigSnapshot({paletteMode: "cosine", cosinePreset: "custom", paletteSize: 20, cosineCustomTintShadeFamilies: true});

  assert.equal(direct.paletteSize, 20);
  assert.equal(family.paletteSize, 21);
  assert.equal(harmony.paletteSize, 20);
  assert.equal(customCosineDirect.paletteSize, 20);
  assert.equal(customCosineFamilies.paletteSize, 20);
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

test("config sanitization clamps post-process values", () => {
  const clean = sanitizeConfigSnapshot({
    despeckleEnabled: "yes",
    despeckleStrength: 99,
    ditherProtectionEnabled: false,
    edgeTightenEnabled: "yes",
    edgeTightenStrength: 99
  });
  assert.equal(clean.despeckleEnabled, true);
  assert.equal(clean.despeckleStrength, 4);
  assert.equal(clean.ditherProtectionEnabled, false);
  assert.equal(clean.edgeTightenEnabled, true);
  assert.equal(clean.edgeTightenStrength, 2);
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
  assert.equal(DEFAULT_CONFIG.ditherProtectionEnabled, true);
  assert.equal(DEFAULT_CONFIG.edgeTightenEnabled, false);
  assert.equal(DEFAULT_CONFIG.edgeTightenStrength, 1);
});
