import test from "node:test";
import assert from "node:assert/strict";
import { createRandomizedConfigSnapshot, createRandomizerController } from "../src/app/randomizer.js";
import { cloneDefaultConfig, sanitizeConfigSnapshot } from "../src/state/config.js";

function sequenceRng(values) {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}

function indexedRng(overrides = {}, fallback = 0.5) {
  let index = 0;
  return () => {
    const value = Object.prototype.hasOwnProperty.call(overrides, index) ? overrides[index] : fallback;
    index += 1;
    return value;
  };
}

test("randomized snapshots stay inside the sanitized config surface", () => {
  const rng = sequenceRng([0.1, 0.7, 0.25, 0.9, 0.4, 0.6, 0.05, 0.8]);
  const current = cloneDefaultConfig();
  current.paletteMode = "harmony";

  const next = createRandomizedConfigSnapshot(current, {rng});
  const clean = sanitizeConfigSnapshot(next, {presetExists: name => name === "amigaWorkbench"});

  assert.equal(clean.paletteMode, "harmony");
  assert.equal(clean.paletteSize % 3, 0);
  assert.ok(clean.paletteSize >= 3 && clean.paletteSize <= 42);
  assert.ok(clean.paletteHue >= -5 && clean.paletteHue <= 5);
  assert.match(clean.seedSwatch, /^#[0-9a-f]{6}$/);
  assert.ok(clean.seed >= 1 && clean.seed <= 500);
  assert.ok(clean.paletteGamma >= 0.2 && clean.paletteGamma <= 4);
  assert.equal(clean.manualPalette.length, current.manualPalette.length);
});

test("manual mode randomizes swatches without alias carryover", () => {
  const rng = sequenceRng([0.2, 0.35, 0.5, 0.65, 0.8, 0.95, 0.1, 0.45]);
  const current = cloneDefaultConfig();
  current.paletteMode = "manual";
  current.manualPalette = [{id: "old", hex: "#111111", aliasHex: "#eeeeee"}];

  const next = createRandomizedConfigSnapshot(current, {rng});

  assert.equal(next.paletteMode, "manual");
  assert.ok(next.manualPalette.length >= 3);
  assert.ok(next.manualPalette.every(swatch => /^manual-random-/.test(swatch.id)));
  assert.ok(next.manualPalette.every(swatch => /^#[0-9a-f]{6}$/.test(swatch.hex)));
  assert.ok(next.manualPalette.every(swatch => swatch.aliasHex === null));
  assert.deepEqual(next.manualMatchAliases, []);
});

test("randomizer controller writes through history-friendly replacement", () => {
  const config = cloneDefaultConfig();
  const calls = [];
  const controller = createRandomizerController({
    config,
    cloneConfigSnapshot: () => ({...config, paletteMode: "cosine"}),
    replaceConfigSnapshot: (snapshot, options) => calls.push({snapshot, options}),
    withHistory: (label, mutator) => {
      calls.push({label});
      return mutator();
    },
    setStatus: text => calls.push({status: text}),
    rng: sequenceRng([0.1, 0.2, 0.3, 0.4, 0.5])
  });

  const next = controller.randomizePalette();

  assert.equal(calls[0].label, "Randomize palette");
  assert.equal(calls[1].options.cancelPendingHistory, false);
  assert.equal(calls.at(-1).status, "Randomized palette settings.");
  assert.equal(next.paletteMode, "cosine");
});

test("palette size favors compact palettes but still allows larger runs", () => {
  const compact = createRandomizedConfigSnapshot(cloneDefaultConfig(), {rng: sequenceRng([0.84, 0.99, 0.5])});
  const large = createRandomizedConfigSnapshot(cloneDefaultConfig(), {rng: sequenceRng([0.85, 0, 0.5])});

  assert.equal(compact.paletteSize, 18);
  assert.equal(large.paletteSize, 21);
});

test("randomizer leaves wet/dry mix alone", () => {
  const current = cloneDefaultConfig();
  current.blendAmount = 0.37;

  const next = createRandomizedConfigSnapshot(current, {rng: sequenceRng([0.5])});

  assert.equal(next.blendAmount, 0.37);
});
