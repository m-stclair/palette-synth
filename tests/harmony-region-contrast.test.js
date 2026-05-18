import test from "node:test";
import assert from "node:assert/strict";
import { labToOklch } from "../src/color-utils.js";
import { cloneDefaultConfig } from "../src/state/config.js";
import { createHarmonyPalette } from "../src/palette/generation.js";

function recordsByVariant(records) {
  return Object.fromEntries(records.map(record => [record.variant, record]));
}

function hueDegrees(record) {
  return labToOklch(record.lab)[2] * 180 / Math.PI;
}

function hueDistanceDegrees(a, b) {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

test("seed harmony keeps the classic shared hue tint/shade ramp by default", () => {
  const config = cloneDefaultConfig();
  config.paletteSize = 3;
  config.harmonyRelationship = "monochrome";
  config.harmonyRegionContrast = "tonalRamp";
  config.seedSwatch = "#e95a22";

  const byVariant = recordsByVariant(createHarmonyPalette(config));

  assert.equal(byVariant.base.familyId, byVariant.tint.familyId);
  assert.equal(byVariant.base.familyId, byVariant.shade.familyId);
  assert.equal(byVariant.base.lab[1], byVariant.tint.lab[1]);
  assert.equal(byVariant.base.lab[2], byVariant.tint.lab[2]);
  assert.equal(byVariant.base.lab[1], byVariant.shade.lab[1]);
  assert.equal(byVariant.base.lab[2], byVariant.shade.lab[2]);
});

test("seed harmony can contrast highlight, shadow, and midtone regions", () => {
  const config = cloneDefaultConfig();
  config.paletteSize = 3;
  config.harmonyRelationship = "monochrome";
  config.harmonyRegionContrast = "triadicRegions";
  config.seedSwatch = "#e95a22";

  const byVariant = recordsByVariant(createHarmonyPalette(config));
  const baseHue = hueDegrees(byVariant.base);
  const tintHue = hueDegrees(byVariant.tint);
  const shadeHue = hueDegrees(byVariant.shade);

  assert.ok(hueDistanceDegrees(baseHue, tintHue) > 80);
  assert.ok(hueDistanceDegrees(baseHue, shadeHue) > 80);
  assert.ok(hueDistanceDegrees(tintHue, shadeHue) > 80);
  assert.equal(Math.round(byVariant.tint.lab[0] - byVariant.base.lab[0]), Math.round(config.deltaL));
  assert.equal(Math.round(byVariant.base.lab[0] - byVariant.shade.lab[0]), Math.round(config.deltaL));
});
