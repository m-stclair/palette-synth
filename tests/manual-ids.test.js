import test from "node:test";
import assert from "node:assert/strict";
import {
  createManualSwatchId,
  manualCycleKeyForId,
  sanitizeManualSwatchId,
  uniqueManualSwatchId
} from "../src/manual/ids.js";

test("manual cycle IDs keep the legacy lowercase sanitizer", () => {
  assert.equal(sanitizeManualSwatchId("  Manual Swatch #1!  "), "manual-swatch-1");
  assert.equal(manualCycleKeyForId("Manual Swatch #1!"), "manual:manual-swatch-1");
  assert.equal(sanitizeManualSwatchId("!!!", "fallback-id"), "fallback-id");
});

test("unique manual swatch IDs preserve saved-ID casing and de-dupe deterministically", () => {
  const used = new Set(["My-Swatch"]);
  assert.equal(uniqueManualSwatchId(" My Swatch ", used), "My-Swatch-2");
  assert.equal(uniqueManualSwatchId(" My Swatch ", used), "My-Swatch-3");
  assert.deepEqual([...used], ["My-Swatch", "My-Swatch-2", "My-Swatch-3"]);
});

test("created manual swatch IDs are sanitized but keep the seed shape", () => {
  const id = createManualSwatchId(" My Fancy Swatch! ");
  assert.match(id, /^manual-My-Fancy-Swatch-/);
  assert.doesNotMatch(id, /\s/);
  assert.ok(id.length <= 72);
});
