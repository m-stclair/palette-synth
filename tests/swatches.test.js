import test from "node:test";
import assert from "node:assert/strict";
import { cloneDefaultConfig } from "../src/state/config.js";
import {
  activeManualMatchAliasCount,
  createManualSwatch,
  createManualSwatchModel,
  insertManualSwatchAfter,
  manualMatchAliasHex,
  manualSourceHex,
  manualSwatchAt,
  manualSwatchEditable,
  manualSwatchIndex,
  manualSwatchesFromColors,
  normalizeCapturedPaletteEntry,
  removeManualSwatchAt,
  setManualMatchAlias,
  syncManualSwatches
} from "../src/manual/swatches.js";

function configWithSwatches(swatches) {
  return {
    ...cloneDefaultConfig(),
    paletteMode: "manual",
    manualPalette: swatches,
    manualMatchAliases: [],
    cycleManualKeys: []
  };
}

test("captured palette entries preserve exact lab only when it matches the hex", () => {
  const exact = normalizeCapturedPaletteEntry({lab: [0, 0, 0]});
  assert.equal(exact.hex, "#000000");
  assert.deepEqual(exact.lab, [0, 0, 0]);

  const mismatched = normalizeCapturedPaletteEntry({hex: "#ffffff", lab: [0, 0, 0]});
  assert.equal(mismatched.hex, "#ffffff");
  assert.equal(mismatched.lab, null);

  assert.equal(normalizeCapturedPaletteEntry("not-a-color"), null);
});

test("manual swatches create, normalize, index by id, and expose source hex", () => {
  const first = createManualSwatch("#123456", "#abcdef", "seed");
  const second = createManualSwatch("#654321", null, "seed");
  const config = configWithSwatches([first, second]);

  assert.equal(syncManualSwatches(config).length, 2);
  assert.equal(manualSwatchIndex(config, first.id), 0);
  assert.equal(manualSwatchIndex(config, `manual:${first.id.toLowerCase()}`), 0);
  assert.equal(manualSwatchAt(config, 1).id, second.id);
  assert.equal(manualSourceHex(config, first.id), "#123456");
  assert.equal(manualMatchAliasHex(config, first.id), "#abcdef");
});

test("manual swatches from colors cap to the manual palette limit and ignore invalid colors", () => {
  const colors = Array.from({length: 50}, (_, index) => index === 3 ? "not-a-color" : `#${index.toString(16).padStart(6, "0")}`);
  const swatches = manualSwatchesFromColors(colors, "batch");

  assert.equal(swatches.length, 41);
  assert.ok(swatches.every(swatch => swatch.id.startsWith("manual-batch-")));
});

test("alias, insert, remove, and editable helpers mutate only the manual model", () => {
  const first = createManualSwatch("#111111", null, "one");
  const second = createManualSwatch("#222222", null, "two");
  const config = configWithSwatches([first, second]);
  config.cycleManualKeys = [`manual:${first.id.toLowerCase()}`, `manual:${second.id.toLowerCase()}`];

  setManualMatchAlias(config, first.id, "#333333");
  assert.equal(manualMatchAliasHex(config, first.id), "#333333");

  const inserted = insertManualSwatchAfter(config, 0, "#444444", "#555555", "copy");
  assert.equal(manualSwatchIndex(config, inserted.id), 1);
  assert.equal(manualMatchAliasHex(config, inserted.id), "#555555");

  const next = removeManualSwatchAt(config, 0);
  assert.equal(next.id, inserted.id);
  assert.deepEqual(config.cycleManualKeys, [`manual:${second.id.toLowerCase()}`]);

  const records = [
    {source: "manual", swatchId: inserted.id, sourceIndex: 0},
    {source: "manual", swatchId: second.id, sourceIndex: 1},
    {source: "generated", swatchId: second.id, sourceIndex: 1}
  ];
  assert.equal(manualSwatchEditable(config, records[0]), true);
  assert.equal(manualSwatchEditable(config, records[2]), false);
  assert.equal(activeManualMatchAliasCount(config, records), 1);
});

test("manual swatch model preserves runtime-style calls and alias side effects", () => {
  const swatch = createManualSwatch("#111111", null, "one");
  const config = configWithSwatches([swatch]);
  let aliasChanges = 0;
  const model = createManualSwatchModel({
    getConfig: () => config,
    getRecords: () => [{source: "manual", swatchId: swatch.id}],
    onAliasChange: () => { aliasChanges += 1; }
  });

  assert.equal(model.manualSourceHex(swatch.id), "#111111");
  model.setManualMatchAlias(swatch.id, "#222222");
  assert.equal(model.manualMatchAliasHex(swatch.id), "#222222");
  assert.equal(aliasChanges, 1);
  assert.equal(model.paletteRecordForManualSwatchId(swatch.id)?.source, "manual");
});
