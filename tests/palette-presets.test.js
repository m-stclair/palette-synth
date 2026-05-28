import test from "node:test";
import assert from "node:assert/strict";
import "../palette-presets.js";
import {
  PALETTE_PRESET_CATALOG,
  PALETTE_PRESET_CATEGORY_ORDER,
  PALETTE_PRESETS
} from "../src/constants.js";

test("palette preset catalog is the single source for flat presets", () => {
  assert.deepEqual(Object.keys(PALETTE_PRESETS).sort(), Object.keys(PALETTE_PRESET_CATALOG).sort());

  for (const [name, preset] of Object.entries(PALETTE_PRESET_CATALOG)) {
    assert.equal(typeof preset.category, "string", `${name} has a category`);
    assert.ok(PALETTE_PRESET_CATEGORY_ORDER.includes(preset.category), `${name} uses a known category`);
    assert.ok(Array.isArray(preset.colors), `${name} has colors`);
    assert.deepEqual(PALETTE_PRESETS[name], preset.colors, `${name} flat colors derive from catalog`);
  }
});
