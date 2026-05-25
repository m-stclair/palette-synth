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
