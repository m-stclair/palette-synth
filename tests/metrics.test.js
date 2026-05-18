import test from "node:test";
import assert from "node:assert/strict";
import {
  assignmentWeights,
  cpuDistanceBreakdown,
  computeDiagnostics,
  computePaletteCollisions,
  diagnosticsSignature,
  sampleImageDiagnostics,
  topPaletteMatches
} from "../src/diagnostics/metrics.js";

const baseConfig = {
  lumaWeight: 1,
  chromaWeight: 0,
  hueWeight: 0,
  paletteMode: "manual",
  assignMode: "nearest",
  outputMode: "quantized",
  blendK: 2,
  softness: 1,
  ditherLumaAmount: 0,
  blendAmount: 1,
  maxDistanceEnabled: false,
  maxDistance: 30,
  minDistance: 18,
  cycleOffset: 0
};

function record(lab, index, extra = {}) {
  return {
    id: `record-${index}`,
    lab,
    hex: extra.hex,
    displayIndex: index,
    ...extra
  };
}

function entry(sourceRecord, extra = {}) {
  return {
    featureLab: sourceRecord.lab,
    renderLab: sourceRecord.lab,
    sourceRecord,
    alias: false,
    ...extra
  };
}

function assertApproximatelyEqual(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be within ${epsilon} of ${expected}`);
}

test("topPaletteMatches sorts by weighted distance and carries display metadata", () => {
  const records = [record([50, 0, 0], 0), record([10, 0, 0], 1), record([20, 0, 0], 2)];
  const matches = topPaletteMatches([18, 0, 0], records.map(entry), {config: baseConfig, records, limit: 2});

  assert.deepEqual(matches.map(match => match.displayIndex), [2, 1]);
  assert.equal(matches[0].record, records[2]);
  assert.equal(matches[0].parts.total, 2);
});

test("assignmentWeights follows nearest, blend, and dither contribution rules", () => {
  const matches = [
    {distance: 1, displayIndex: 0},
    {distance: 3, displayIndex: 1},
    {distance: 9, displayIndex: 2}
  ];

  assert.deepEqual(assignmentWeights(matches, [50, 0, 0], {...baseConfig, assignMode: "nearest"}), [1, 0, 0]);

  const blend = assignmentWeights(matches, [50, 0, 0], {...baseConfig, assignMode: "blend", blendK: 2});
  assertApproximatelyEqual(blend[0] + blend[1] + blend[2], 1);
  assert.equal(blend[2], 0);
  assert.ok(blend[0] > blend[1]);

  const dither = assignmentWeights([
    {distance: 2, displayIndex: 0},
    {distance: 2, displayIndex: 1}
  ], [50, 0, 0], {...baseConfig, assignMode: "dither", blendK: 2});
  assertApproximatelyEqual(dither[0], 0.5, 1e-4);
  assertApproximatelyEqual(dither[1], 0.5, 1e-4);
});


test("near-neutral source colors do not invent hue pressure", () => {
  const source = [95, 1e-8, 3.5e-6];
  const red = record([95, 3, 0], 0);
  const blue = record([95, 0, 3], 1);
  const config = {...baseConfig, lumaWeight: 0, chromaWeight: 0, hueWeight: 1};

  const redParts = cpuDistanceBreakdown(source, red.lab, config);
  const blueParts = cpuDistanceBreakdown(source, blue.lab, config);
  assert.equal(redParts.hue, 0);
  assert.equal(blueParts.hue, 0);
  assert.equal(redParts.hueSuppressed, true);
  assert.equal(blueParts.hueSuppressed, true);

  const matches = topPaletteMatches(source, [entry(red), entry(blue)], {config, records: [red, blue], limit: 2});
  assert.deepEqual(matches.map(match => match.displayIndex), [0, 1]);
});

test("non-neutral colors still carry hue pressure", () => {
  const source = [50, 3, 0];
  const candidate = [50, 0, 3];
  const parts = cpuDistanceBreakdown(source, candidate, {...baseConfig, lumaWeight: 0, chromaWeight: 0, hueWeight: 1});
  assert.ok(parts.hue > 0);
  assert.equal(parts.hueSuppressed, false);
});

test("max-distance gate leaves far pixels unassigned", () => {
  const matches = [
    {distance: 12, displayIndex: 0},
    {distance: 20, displayIndex: 1}
  ];
  assert.deepEqual(assignmentWeights(matches, [50, 0, 0], {...baseConfig, maxDistanceEnabled: true, maxDistance: 10}), [0, 0]);
  assert.deepEqual(assignmentWeights(matches, [50, 0, 0], {...baseConfig, maxDistanceEnabled: true, maxDistance: 12}), [1, 0]);
});

test("sampleImageDiagnostics measures usage and normalizes contribution entropy", () => {
  const records = [record([0, 0, 0], 0), record([100, 0, 0], 1)];
  const entries = records.map(entry);
  const imageData = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([
      0, 0, 0, 255,
      255, 255, 255, 255
    ])
  };

  const sample = sampleImageDiagnostics(imageData, entries, records, baseConfig);

  assert.equal(sample.sampleCount, 2);
  assert.equal(sample.usage.length, 2);
  assertApproximatelyEqual(sample.usage.reduce((sum, item) => sum + item.percent, 0), 1);
  assert.ok(sample.coverageEntropy > 0);
  assert.ok(sample.worst?.sourceHex);
});

test("computePaletteCollisions anchors threshold to config and reports close pairs", () => {
  const records = [record([0, 0, 0], 0), record([1, 0, 0], 1), record([30, 0, 0], 2)];
  const collisions = computePaletteCollisions(records, {...baseConfig, minDistance: 18});

  assert.equal(collisions.threshold, 5.76);
  assert.equal(collisions.closeCount, 1);
  assert.deepEqual([collisions.closest.i, collisions.closest.j], [0, 1]);
});

test("computeDiagnostics returns a stable signature and includes cycle offset only when requested", () => {
  const records = [record([0, 0, 0], 0), record([100, 0, 0], 1)];
  const entries = records.map(entry);
  const imageData = {
    width: 1,
    height: 1,
    data: new Uint8ClampedArray([0, 0, 0, 255])
  };
  const config = {...baseConfig, cycleOffset: 3};

  const withoutCycle = diagnosticsSignature({imageData, records, entries, config, includeCycleOffset: false});
  const withCycle = diagnosticsSignature({imageData, records, entries, config, includeCycleOffset: true});
  assert.notEqual(withoutCycle, withCycle);

  const stats = computeDiagnostics({imageData, records, entries, config, includeCycleOffset: true, now: () => 123});
  assert.equal(stats.signature, withCycle);
  assert.equal(stats.generatedAt, 123);
  assert.equal(stats.records, records);
  assert.equal(stats.entries, entries);
});
