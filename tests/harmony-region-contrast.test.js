import test from "node:test";
import assert from "node:assert/strict";
import { labToOklch } from "../src/color-utils.js";
import { cloneDefaultConfig } from "../src/state/config.js";
import { createHarmonyPalette } from "../src/palette/generation.js";

function recordsByVariant(records) {
  return Object.fromEntries(records.map(record => [record.variant, record]));
}

function recordForFamilyVariant(records, familyIndex, variant) {
  return records.find(record => record.familyIndex === familyIndex && record.variant === variant);
}

function hueDegrees(record) {
  return labToOklch(record.lab)[2] * 180 / Math.PI;
}

function hueDistanceDegrees(a, b) {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

test("seed harmony ramp steepness controls lightness slope inside each tonal band", () => {
  const flat = cloneDefaultConfig();
  flat.paletteSize = 21;
  flat.harmonyRelationship = "splitComplement";
  flat.harmonyRampSteepness = 0;
  flat.seedSwatch = "#6f84c8";

  const steep = cloneDefaultConfig();
  steep.paletteSize = flat.paletteSize;
  steep.harmonyRelationship = flat.harmonyRelationship;
  steep.seedSwatch = flat.seedSwatch;
  steep.harmonyRampSteepness = 2;

  const bandRange = records => {
    const bases = records.filter(record => record.variant === "base").map(record => record.lab[0]);
    return Math.max(...bases) - Math.min(...bases);
  };

  assert.ok(bandRange(createHarmonyPalette(steep)) > bandRange(createHarmonyPalette(flat)) + 8);
});

test("seed harmony ramp steepness reaches the first relationship group after the anchor", () => {
  const flat = cloneDefaultConfig();
  flat.paletteSize = 9;
  flat.harmonyRelationship = "splitComplement";
  flat.harmonyRampSteepness = 0;
  flat.seedSwatch = "#6f84c8";

  const steep = cloneDefaultConfig();
  steep.paletteSize = flat.paletteSize;
  steep.harmonyRelationship = flat.harmonyRelationship;
  steep.seedSwatch = flat.seedSwatch;
  steep.harmonyRampSteepness = 2;

  const flatRecords = createHarmonyPalette(flat);
  const steepRecords = createHarmonyPalette(steep);

  for (const variant of ["shade", "base", "tint"]) {
    assert.ok(Math.abs(recordForFamilyVariant(steepRecords, 0, variant).lab[0] - recordForFamilyVariant(flatRecords, 0, variant).lab[0]) < 0.01);
    assert.ok(Math.abs(recordForFamilyVariant(steepRecords, 1, variant).lab[0] - recordForFamilyVariant(flatRecords, 1, variant).lab[0]) > 0.5);
    assert.ok(Math.abs(recordForFamilyVariant(steepRecords, 2, variant).lab[0] - recordForFamilyVariant(flatRecords, 2, variant).lab[0]) > 0.5);
  }
});

test("seed harmony returns the requested non-multiple-of-three palette sizes", () => {
  for (const size of [4, 5, 7, 8, 10, 11, 13, 14, 41]) {
    const config = cloneDefaultConfig();
    config.paletteSize = size;
    config.harmonyRelationship = "splitComplement";
    config.seedSwatch = "#6f84c8";

    const records = createHarmonyPalette(config);
    assert.equal(records.length, size, `paletteSize ${size}`);
  }
});

test("seed harmony balances remainder colors across tonal bands", () => {
  const countsForSize = size => {
    const config = cloneDefaultConfig();
    config.paletteSize = size;
    config.harmonyRelationship = "splitComplement";
    config.seedSwatch = "#6f84c8";
    return createHarmonyPalette(config).reduce((counts, record) => {
      counts[record.variant] = (counts[record.variant] || 0) + 1;
      return counts;
    }, {});
  };

  assert.deepEqual(countsForSize(10), {shade: 3, base: 4, tint: 3});
  assert.deepEqual(countsForSize(11), {shade: 4, base: 3, tint: 4});
});

test("larger seed harmony palettes fill each tonal band with a wider lightness ramp", () => {
  const narrow = cloneDefaultConfig();
  narrow.paletteSize = 9;
  narrow.harmonyRelationship = "splitComplement";
  narrow.harmonyRampSteepness = 1.5;
  narrow.seedSwatch = "#6f84c8";

  const wide = cloneDefaultConfig();
  wide.paletteSize = 42;
  wide.harmonyRelationship = narrow.harmonyRelationship;
  wide.harmonyRampSteepness = narrow.harmonyRampSteepness;
  wide.seedSwatch = narrow.seedSwatch;

  const rangeForVariant = (records, variant) => {
    const lightness = records.filter(record => record.variant === variant).map(record => record.lab[0]);
    return Math.max(...lightness) - Math.min(...lightness);
  };

  for (const variant of ["shade", "base", "tint"]) {
    assert.ok(rangeForVariant(createHarmonyPalette(wide), variant) > rangeForVariant(createHarmonyPalette(narrow), variant) + 16, variant);
  }
});

test("seed harmony seed applies local hue and chroma jitter instead of a uniform hue rotation", () => {
  const seedA = cloneDefaultConfig();
  seedA.paletteSize = 42;
  seedA.harmonyRelationship = "splitComplement";
  seedA.seedSwatch = "#6f84c8";
  seedA.seed = 7;

  const seedB = cloneDefaultConfig();
  seedB.paletteSize = seedA.paletteSize;
  seedB.harmonyRelationship = seedA.harmonyRelationship;
  seedB.seedSwatch = seedA.seedSwatch;
  seedB.seed = 19;

  const baseA = createHarmonyPalette(seedA)
    .filter(record => record.variant === "base")
    .sort((a, b) => a.familyIndex - b.familyIndex);
  const baseB = createHarmonyPalette(seedB)
    .filter(record => record.variant === "base")
    .sort((a, b) => a.familyIndex - b.familyIndex);

  const signedHueDelta = (a, b) => ((a - b + 540) % 360) - 180;
  const hueDeltasAfterFirstRelationshipRing = baseA
    .slice(3)
    .map((record, index) => signedHueDelta(hueDegrees(baseB[index + 3]), hueDegrees(record)));
  const roundedHueDeltas = new Set(hueDeltasAfterFirstRelationshipRing.map(value => value.toFixed(1)));
  const chromaDeltas = baseA.map((record, index) => {
    const chromaA = labToOklch(record.seedLab)[1];
    const chromaB = labToOklch(baseB[index].seedLab)[1];
    return Math.abs(chromaB - chromaA);
  });

  assert.ok(roundedHueDeltas.size >= 3);
  assert.ok(Math.max(...chromaDeltas) > 0.5);
});
