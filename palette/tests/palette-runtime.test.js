import test from "node:test";
import assert from "node:assert/strict";
import { hexToLab, labDistanceComponents } from "../src/color-utils.js";
import { createPaletteRuntime, manualPresetIdFromName, manualPresetName } from "../src/palette/runtime.js";

function makeRuntime(overrides = {}) {
  const config = {
    paletteMode: "manual",
    presetName: "amigaWorkbench",
    sortMode: "lightness",
    generatedAssist: 0,
    generatedLocks: [],
    paletteRegionRect: null,
    paletteSize: 6,
    deltaL: 30,
    paletteGamma: 1,
    gammaC: 1,
    paletteHue: 0,
    aliasAllSources: false,
    ...overrides.config
  };
  const state = {
    imageData: null,
    referenceImageData: null,
    manualPresets: [],
    paletteSelectionTrace: {stale: true},
    ...overrides.state
  };
  const swatches = overrides.swatches ?? [];
  const runtime = createPaletteRuntime({
    config,
    state,
    syncManualSwatches: () => swatches,
    manualSwatchLab: swatch => swatch.lab ?? hexToLab(swatch.hex),
    manualSwatchEditable: record => record.editable !== false,
    manualMatchAliasHex: id => overrides.aliases?.[id] ?? null
  });
  return {runtime, config, state, swatches};
}

test("manual preset names round-trip and preset lookup includes captured presets", () => {
  assert.equal(manualPresetName("abc"), "manualPreset:abc");
  assert.equal(manualPresetIdFromName("manualPreset:abc"), "abc");
  assert.equal(manualPresetIdFromName("amigaWorkbench"), "");

  const {runtime} = makeRuntime({
    state: {
      manualPresets: [{id: "sunset", name: "Sunset", colors: ["#111111", "#eeeeee", "#cc5500"]}]
    }
  });

  assert.equal(runtime.presetExists("manualPreset:sunset"), true);
  assert.equal(runtime.presetExists("missing"), false);
  assert.deepEqual(runtime.presetColors("manualPreset:sunset"), ["#111111", "#eeeeee", "#cc5500"]);
  assert.equal(runtime.presetSize("manualPreset:sunset"), 3);
});

test("palette runtime selects the active generated image source and normalized region", () => {
  const main = {width: 100, height: 80};
  const reference = {width: 20, height: 10};
  const {runtime, config} = makeRuntime({
    config: {
      paletteMode: "generated",
      paletteRegionRect: {x: -10, y: 20, width: 130, height: 30}
    },
    state: {imageData: main, referenceImageData: reference}
  });

  assert.equal(runtime.isGeneratedPaletteMode(), true);
  assert.equal(runtime.activePaletteImageData(), main);
  assert.deepEqual(runtime.activePaletteRegionRect(), {x: 0, y: 20, width: 100, height: 30});
  assert.equal(runtime.activePaletteImageLabel(), "selected region");

  config.paletteMode = "generatedReference";
  assert.equal(runtime.activePaletteImageData(), reference);
  assert.equal(runtime.activePaletteRegionRect(), null);
  assert.equal(runtime.activePaletteImageLabel(), "reference image");
  assert.equal(runtime.generatedSourceKey(), "reference");
});

test("manual palette uniform entries append match aliases without changing render labs", () => {
  const sourceLab = hexToLab("#ffffff");
  const renderLab = [50, 1, 2];
  const {runtime} = makeRuntime({
    config: {paletteMode: "manual"},
    aliases: {swatchA: "#000000"}
  });
  const record = {lab: sourceLab, swatchId: "swatchA", sourceIndex: 0};

  const entries = runtime.paletteUniformEntries([record], [renderLab]);

  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], {
    featureLab: sourceLab,
    renderLab,
    featureHex: "#ffffff",
    renderHex: "#6d6156",
    sourceRecord: record,
    alias: false
  });
  assert.equal(entries[1].alias, true);
  assert.deepEqual(entries[1].renderLab, renderLab);
  assert.deepEqual(entries[1].sourceRecord, record);
});


test("manual palette uniform entries omit muted swatches but keep visible records", () => {
  const {runtime} = makeRuntime({
    config: {paletteMode: "manual"},
    aliases: {muted: "#ffffff"},
    swatches: [
      {id: "active", hex: "#000000", muted: false},
      {id: "muted", hex: "#ffffff", muted: true}
    ]
  });

  const records = runtime.getPaletteRecords();
  assert.equal(records.length, 2);
  assert.equal(records.some(record => record.swatchId === "muted" && record.muted), true);

  const entries = runtime.paletteUniformEntries(records);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].sourceRecord.swatchId, "active");
});

test("getPaletteRecords clears stale generated traces outside generated modes and falls back safely", () => {
  const {runtime, state} = makeRuntime({
    config: {paletteMode: "manual", generatedAssist: 0},
    swatches: []
  });

  const records = runtime.getPaletteRecords();

  assert.equal(state.paletteSelectionTrace, null);
  assert.equal(records.length, 2);
  assert.deepEqual(records.map(record => record.source), ["fallback", "fallback"]);
  assert.deepEqual(runtime.getPalette(), records.map(record => record.lab));
});

function assertLabClose(actual, expected, epsilon = 1e-6) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => {
    assert.ok(Math.abs(value - expected[index]) <= epsilon, `channel ${index}: expected ${expected[index]}, received ${value}`);
  });
}

test("palette adjustments change manual effective labs while preserving source labs", () => {
  const sourceLab = [25, 50, 0];
  const {runtime} = makeRuntime({
    config: {paletteMode: "manual", paletteGamma: 2, gammaC: 2, paletteHue: 90},
    swatches: [{id: "swatchA", hex: "#ff0000", lab: sourceLab}]
  });

  const [record] = runtime.getPaletteRecords();
  const adjustedParts = labDistanceComponents(record.lab);

  assertLabClose(record.sourceLab, sourceLab);
  assertLabClose(record.lab, [50, 0, 25], 1e-5);
  assert.equal(record.lightness, adjustedParts.lightness);
  assert.equal(record.chroma, adjustedParts.chroma);
  assert.deepEqual(record.scaledHue, adjustedParts.scaledHue);
  assertLabClose(record.unadjustedLab, sourceLab);

  const [entry] = runtime.paletteUniformEntries([record]);
  assert.equal(entry.featureLightness, adjustedParts.lightness);
  assert.equal(entry.featureChroma, adjustedParts.chroma);
  assert.deepEqual(entry.featureHue, adjustedParts.scaledHue);
});

test("alias all source colors adds source matches without changing adjusted render labs", () => {
  const sourceLab = [25, 0, 0];
  const {runtime} = makeRuntime({
    config: {paletteMode: "manual", paletteGamma: 2, aliasAllSources: true},
    swatches: [{id: "swatchA", hex: "#444444", lab: sourceLab}]
  });
  const [record] = runtime.getPaletteRecords();
  const entries = runtime.paletteUniformEntries([record], [record.lab]);

  assert.equal(entries.length, 2);
  assert.equal(entries[1].alias, true);
  assertLabClose(entries[1].featureLab, sourceLab);
  assertLabClose(entries[1].renderLab, record.lab);
});
