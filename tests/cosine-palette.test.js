import test from "node:test";
import assert from "node:assert/strict";
import { cloneDefaultConfig } from "../src/state/config.js";
import { createCosinePalette } from "../src/palette/generation.js";

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
