import test from "node:test";
import assert from "node:assert/strict";
import {
  applyManualCycle,
  automaticCyclePeriod,
  createPaletteCycle,
  cyclePeriod,
  cycleTagged,
  manualCycleIndices,
  normalizedCycleOffset,
  renderPaletteLabs,
  syncCycleManualKeys
} from "../src/palette/cycle.js";

function record(lab, cycleKey = null) {
  return cycleKey ? {lab, cycleKey} : {lab};
}

test("automatic cycle periods match shader regions", () => {
  const records = Array.from({length: 10}, (_, i) => record([i, 0, 0]));
  assert.equal(cyclePeriod({CYCLE_MODE: 0}, records), 10);
  assert.equal(cyclePeriod({CYCLE_MODE: 1}, records), 12);
  assert.equal(cyclePeriod({CYCLE_MODE: 2}, records), 3);
  assert.equal(cyclePeriod({CYCLE_MODE: 3}, records), 4);
  assert.equal(cyclePeriod({CYCLE_MODE: 4}, records), 3);
  assert.equal(automaticCyclePeriod({CYCLE_MODE: 0}, 1), 1);
});

test("cycle offsets normalize against the active period", () => {
  const records = Array.from({length: 10}, (_, i) => record([i, 0, 0]));
  assert.equal(normalizedCycleOffset({CYCLE_MODE: 0, cycleOffset: -1}, undefined, records), 9);
  assert.equal(normalizedCycleOffset({CYCLE_MODE: 3, cycleOffset: 8}, undefined, records), 0);
});

test("manual cycle keys normalize and tag only selected records", () => {
  const config = {
    CYCLE_MODE: "manual",
    cycleManualKeys: ["manual-one", "manual:missing", "manual-three"],
    manualPalette: [{id: "manual-one"}, {id: "manual-three"}]
  };
  const records = [
    record([1, 0, 0], "manual:manual-one"),
    record([2, 0, 0], "manual:manual-two"),
    record([3, 0, 0], "manual:manual-three")
  ];

  assert.deepEqual(syncCycleManualKeys(config, config.manualPalette), ["manual:manual-one", "manual:manual-three"]);
  assert.deepEqual(manualCycleIndices(config, records), [0, 2]);
  assert.equal(cycleTagged(config, records[0]), true);
  assert.equal(cycleTagged(config, records[1]), false);
});


test("manual cycle ignores muted records", () => {
  const config = {
    CYCLE_MODE: "manual",
    cycleOffset: 1,
    cycleManualKeys: ["manual-one", "manual-two", "manual-three"],
    manualPalette: [{id: "manual-one"}, {id: "manual-two"}, {id: "manual-three"}]
  };
  const records = [
    record([1, 0, 0], "manual:manual-one"),
    {...record([2, 0, 0], "manual:manual-two"), muted: true},
    record([3, 0, 0], "manual:manual-three")
  ];

  assert.deepEqual(manualCycleIndices(config, records), [0, 2]);
  assert.equal(cycleTagged(config, records[1]), false);
  assert.deepEqual(applyManualCycle(config, records), [[3, 0, 0], [2, 0, 0], [1, 0, 0]]);
});

test("manual cycle rotates only tagged render labs", () => {
  const config = {
    CYCLE_MODE: "manual",
    cycleOffset: 1,
    cycleManualKeys: ["manual-one", "manual-three"],
    manualPalette: [{id: "manual-one"}, {id: "manual-three"}]
  };
  const records = [
    record([1, 0, 0], "manual:manual-one"),
    record([2, 0, 0], "manual:manual-two"),
    record([3, 0, 0], "manual:manual-three")
  ];

  assert.deepEqual(applyManualCycle(config, records), [[3, 0, 0], [2, 0, 0], [1, 0, 0]]);
  assert.deepEqual(renderPaletteLabs(config, records), [[3, 0, 0], [2, 0, 0], [1, 0, 0]]);
});

test("cycle controller preserves the runtime call shape", () => {
  const config = {
    CYCLE_MODE: "manual",
    cycleOffset: 2,
    cycleManualKeys: ["manual-one", "manual-two"],
    manualPalette: [{id: "manual-one"}, {id: "manual-two"}]
  };
  const records = [
    record([1, 0, 0], "manual:manual-one"),
    record([2, 0, 0], "manual:manual-two")
  ];
  let syncCount = 0;
  const cycle = createPaletteCycle({
    getConfig: () => config,
    getRecords: () => records,
    syncManualSwatches: () => {
      syncCount += 1;
      return config.manualPalette;
    }
  });

  assert.equal(cycle.cyclePeriod(), 2);
  assert.equal(cycle.normalizedCycleOffset(), 0);
  assert.deepEqual(cycle.renderPaletteLabs(), [[1, 0, 0], [2, 0, 0]]);
  assert.ok(syncCount > 0);
});
