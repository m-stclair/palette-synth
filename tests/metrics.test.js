import test from "node:test";
import assert from "node:assert/strict";
import {
  assignmentWeights,
  cpuDistanceBreakdown,
  computeDiagnostics,
  computePaletteCollisions,
  computeOutputHistogramDiagnostics,
  computeSourceHistogramDiagnostics,
  createDiagnosticMetrics,
  diagnosticsSignature,
  sampleImageDiagnostics,
  topPaletteMatches
} from "../src/diagnostics/metrics.js";
import { labDistanceComponents } from "../src/color-utils.js";

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
  monotoneBlendDither: false,
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
  const featureLab = extra.featureLab || sourceRecord.lab;
  const {lightness, chroma, scaledHue} = labDistanceComponents(featureLab);
  return {
    featureLab,
    featureLightness: lightness,
    featureChroma: chroma,
    featureHue: scaledHue,
    renderLab: sourceRecord.lab,
    sourceRecord,
    alias: false,
    ...extra
  };
}

function assertApproximatelyEqual(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be within ${epsilon} of ${expected}`);
}

function distanceBreakdownForLabs(sourceLab, targetLab, config) {
  const source = labDistanceComponents(sourceLab);
  const target = labDistanceComponents(targetLab);
  return cpuDistanceBreakdown(
    source.lightness,
    source.chroma,
    source.scaledHue,
    target.lightness,
    target.chroma,
    target.scaledHue,
    config
  );
}

test("categorical neutral mode gives neutral-vs-chromatic matches hue distance", () => {
  const continuous = distanceBreakdownForLabs([50, 10, 0], [50, 0, 0], {...baseConfig, hueWeight: 1});
  const categorical = distanceBreakdownForLabs([50, 10, 0], [50, 0, 0], {...baseConfig, hueWeight: 1, neutralIsCategory: true});

  assert.equal(continuous.hue, 0);
  assert.equal(continuous.raw.hueSuppressed, true);
  assert.ok(categorical.hue > 0);
  assert.equal(categorical.raw.hueSuppressed, false);
});

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

test("monotone blend/dither collapses same-side assignments that worsen fidelity", () => {
  const matches = [
    {distance: 10, displayIndex: 0, renderLab: [90, 0, 0]},
    {distance: 20, displayIndex: 1, renderLab: [80, 0, 0]}
  ];

  const unguardedBlend = assignmentWeights(matches, [100, 0, 0], {...baseConfig, assignMode: "blend", blendK: 2});
  assert.ok(unguardedBlend[0] > 0);
  assert.ok(unguardedBlend[1] > 0);

  assert.deepEqual(assignmentWeights(matches, [100, 0, 0], {
    ...baseConfig,
    assignMode: "blend",
    blendK: 2,
    monotoneBlendDither: true
  }), [1, 0]);

  assert.deepEqual(assignmentWeights(matches, [100, 0, 0], {
    ...baseConfig,
    assignMode: "dither",
    blendK: 2,
    monotoneBlendDither: true
  }), [1, 0]);
});

test("monotone dither checks the implied average instead of each chosen pixel", () => {
  const matches = [
    {distance: 1, displayIndex: 0, renderLab: [49, 0, 0]},
    {distance: 10, displayIndex: 1, renderLab: [60, 0, 0]}
  ];

  const guardedDither = assignmentWeights(matches, [50, 0, 0], {
    ...baseConfig,
    assignMode: "dither",
    blendK: 2,
    monotoneBlendDither: true
  });

  assert.ok(guardedDither[1] > 0.08);
  assert.ok(guardedDither[1] < 0.10);
});

test("monotone blend/dither keeps assignments that do not worsen fidelity", () => {
  const blendMatches = [
    {distance: 10, displayIndex: 0, renderLab: [40, 0, 0]},
    {distance: 10, displayIndex: 1, renderLab: [60, 0, 0]}
  ];

  const guardedBlend = assignmentWeights(blendMatches, [50, 0, 0], {
    ...baseConfig,
    assignMode: "blend",
    blendK: 2,
    monotoneBlendDither: true
  });
  assertApproximatelyEqual(guardedBlend[0], 0.5, 1e-4);
  assertApproximatelyEqual(guardedBlend[1], 0.5, 1e-4);

  const ditherMatches = [
    {distance: 1, displayIndex: 0, renderLab: [49, 0, 0]},
    {distance: 1, displayIndex: 1, renderLab: [51, 0, 0]}
  ];

  const guardedDither = assignmentWeights(ditherMatches, [50, 0, 0], {
    ...baseConfig,
    assignMode: "dither",
    blendK: 2,
    monotoneBlendDither: true
  });
  assertApproximatelyEqual(guardedDither[0], 0.5, 1e-4);
  assertApproximatelyEqual(guardedDither[1], 0.5, 1e-4);
});

test("monotone blend/dither compares after output mode", () => {
  const matches = [
    {distance: 10, displayIndex: 0, renderLab: [90, 0, 0]},
    {distance: 20, displayIndex: 1, renderLab: [80, 0, 0]}
  ];

  const guardedBlend = assignmentWeights(matches, [100, 0, 0], {
    ...baseConfig,
    assignMode: "blend",
    outputMode: "preserveLuma",
    blendK: 2,
    monotoneBlendDither: true
  });

  assert.ok(guardedBlend[0] > 0);
  assert.ok(guardedBlend[1] > 0);
});

test("near-neutral source colors do not invent hue pressure", () => {
  const source = [95, 1e-8, 3.5e-6];
  const red = record([95, 3, 0], 0);
  const blue = record([95, 0, 3], 1);
  const config = {...baseConfig, lumaWeight: 0, chromaWeight: 0, hueWeight: 1};

  const redParts = distanceBreakdownForLabs(source, red.lab, config);
  const blueParts = distanceBreakdownForLabs(source, blue.lab, config);
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
  const parts = distanceBreakdownForLabs(source, candidate, {...baseConfig, lumaWeight: 0, chromaWeight: 0, hueWeight: 1});
  assert.ok(parts.hue > 0);
  assert.equal(parts.hueSuppressed, false);
});

test("hue pressure gates on chroma but does not amplify saturated colors", () => {
  const clearMuted = distanceBreakdownForLabs([50, 8, 0], [50, 0, 8], {...baseConfig, lumaWeight: 0, chromaWeight: 0, hueWeight: 1});
  const saturated = distanceBreakdownForLabs([50, 30, 0], [50, 0, 30], {...baseConfig, lumaWeight: 0, chromaWeight: 0, hueWeight: 1});

  assertApproximatelyEqual(clearMuted.hue, saturated.hue);
  assertApproximatelyEqual(saturated.hue, 10 * Math.sqrt(2));
});

test("neutral colors suppress hue without inspecting unsafe hue vectors", () => {
  const parts = cpuDistanceBreakdown(50, 0, null, 50, 3, [1, 0], {...baseConfig, lumaWeight: 0, chromaWeight: 0, hueWeight: 1});

  assert.equal(parts.hue, 0);
  assert.equal(parts.hueSuppressed, true);
});

test("achromatic hue width expands near black and white", () => {
  const config = {...baseConfig, lumaWeight: 0, chromaWeight: 0, hueWeight: 1};
  const midtone = distanceBreakdownForLabs([50, 4, 0], [50, 0, 4], config);
  const nearBlack = distanceBreakdownForLabs([5, 4, 0], [5, 0, 4], config);

  assert.ok(midtone.hue > 0);
  assert.equal(midtone.hueSuppressed, false);
  assert.equal(nearBlack.hue, 0);
  assert.equal(nearBlack.hueSuppressed, true);
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
  assert.equal(sample.histogram, undefined);
});

test("source histogram diagnostics sample only the histogram view payload", () => {
  const records = [record([50, 0, 0], 0)];
  const imageData = {
    width: 4,
    height: 1,
    data: new Uint8ClampedArray([
      0, 0, 0, 255,
      0, 0, 0, 255,
      255, 255, 255, 255,
      255, 255, 255, 255
    ])
  };

  const stats = computeSourceHistogramDiagnostics({imageData, records, config: baseConfig, signature: "hist", now: () => 99});

  assert.equal(stats.signature, "hist");
  assert.equal(stats.generatedAt, 99);
  assert.equal(stats.histogram.kind, "sourceLumaDetail");
  assert.equal(stats.histogram.channel, "luma");
  assert.equal(stats.histogram.bins.length, 80);
  assert.equal(stats.histogram.segments.neutral.length, 80);
  assert.equal(stats.histogram.total, 4);
  assert.equal(stats.histogram.bins.reduce((sum, count) => sum + count, 0), 4);
  assert.ok(Number.isFinite(stats.histogram.stats.median));
  assert.equal(stats.histogram.widestGap, undefined);
});

test("source chroma histogram uses chroma bins with tonal stacks", () => {
  const records = [record([50, 0, 0], 0)];
  const imageData = {
    width: 3,
    height: 1,
    data: new Uint8ClampedArray([
      255, 0, 0, 255,
      128, 128, 128, 255,
      0, 0, 255, 255
    ])
  };

  const stats = computeSourceHistogramDiagnostics({imageData, records, channel: "chroma", signature: "hist-c", now: () => 100});

  assert.equal(stats.signature, "hist-c");
  assert.equal(stats.histogram.kind, "sourceChromaDetail");
  assert.equal(stats.histogram.channel, "chroma");
  assert.equal(stats.histogram.segments.shadow.length, 80);
  assert.ok(stats.histogram.domain.max >= 16);
  assert.ok(Number.isFinite(stats.histogram.stats.mean));
});

test("source hue histogram omits near-neutral pixels and bins chromatic hue", () => {
  const records = [record([50, 0, 0], 0)];
  const imageData = {
    width: 4,
    height: 1,
    data: new Uint8ClampedArray([
      255, 0, 0, 255,
      128, 128, 128, 255,
      0, 255, 0, 255,
      0, 0, 255, 255
    ])
  };

  const stats = computeSourceHistogramDiagnostics({imageData, records, channel: "hue", signature: "hist-h", now: () => 101});

  assert.equal(stats.signature, "hist-h");
  assert.equal(stats.histogram.kind, "sourceHueDetail");
  assert.equal(stats.histogram.channel, "hue");
  assert.equal(stats.histogram.axisLabel, "H°");
  assert.equal(stats.histogram.bins.length, 72);
  assert.equal(stats.histogram.total, 3);
  assert.equal(stats.histogram.omittedLowChromaCount, 1);
  assert.equal(stats.histogram.lowChromaThreshold, 2);
  assert.equal(stats.histogram.segments.midtone.length, 72);
  assert.ok(Number.isFinite(stats.histogram.stats.mean));
});

test("output histogram diagnostics estimate output from source samples without GPU readback", () => {
  const records = [record([50, 0, 0], 0)];
  const imageData = {width: 1, height: 1, data: new Uint8ClampedArray([128, 128, 128, 255])};
  let readbacks = 0;
  const metrics = createDiagnosticMetrics({
    getConfig: () => baseConfig,
    getImageData: () => imageData,
    getOutputImageData: () => {
      readbacks += 1;
      return imageData;
    },
    getRecords: () => records,
    getEntries: inputRecords => inputRecords.map(entry)
  });

  const source = metrics.computeSourceHistogramDiagnostics(records, "luma");
  const output = metrics.computeOutputHistogramDiagnostics(records, "luma");
  const chroma = metrics.computeOutputHistogramDiagnostics(records, "chroma");
  const hue = metrics.computeOutputHistogramDiagnostics(records, "hue");

  assert.equal(readbacks, 0);
  assert.equal(source.histogram.kind, "sourceLumaDetail");
  assert.equal(output.histogram.kind, "outputLumaDetail");
  assert.equal(chroma.histogram.kind, "outputChromaDetail");
  assert.equal(hue.histogram.kind, "outputHueDetail");
  assert.ok(output.histogram.stats.mean < source.histogram.stats.mean);
});

test("paired chroma histograms share a single comparison axis", () => {
  const records = [record([50, 0, 0], 0)];
  const imageData = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 0, 255, 255
    ])
  };
  const metrics = createDiagnosticMetrics({
    getConfig: () => baseConfig,
    getImageData: () => imageData,
    getRecords: () => records,
    getEntries: inputRecords => inputRecords.map(entry)
  });

  const source = metrics.computeSourceHistogramDiagnostics(records, "chroma");
  const output = metrics.computeOutputHistogramDiagnostics(records, "chroma");

  assert.equal(source.histogram.domain.max, output.histogram.domain.max);
  assert.ok(source.histogram.stats.max > output.histogram.stats.max);
  assert.ok(source.histogram.domain.max >= source.histogram.stats.max);
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

test("histogram diagnostics cache source and output samples on capable image sources", () => {
  const records = [record([50, 0, 0], 0)];
  const entries = records.map(entry);
  const data = new Uint8ClampedArray([
    0, 0, 0, 255,
    255, 255, 255, 255
  ]);
  const cache = new Map();
  const cacheMisses = [];
  let dataReads = 0;
  const imageData = {
    width: 2,
    height: 1,
    version: 11,
    get data() {
      dataReads += 1;
      return data;
    },
    getCachedSample(key, producer) {
      if (!cache.has(key)) {
        cacheMisses.push(key);
        cache.set(key, producer());
      }
      return cache.get(key);
    }
  };

  const sourceLuma = computeSourceHistogramDiagnostics({imageData, records, entries, config: baseConfig, channel: "luma"});
  const sourceChroma = computeSourceHistogramDiagnostics({imageData, records, entries, config: baseConfig, channel: "chroma"});
  const outputLuma = createDiagnosticMetrics({
    getConfig: () => baseConfig,
    getImageData: () => imageData,
    getRecords: () => records,
    getEntries: () => entries
  }).computeOutputHistogramDiagnostics(records, "luma");
  const outputHue = computeOutputHistogramDiagnostics({imageData, records, entries, config: baseConfig, channel: "hue"});

  assert.equal(sourceLuma.histogram.total, 2);
  assert.equal(sourceChroma.histogram.total, 2);
  assert.equal(outputLuma.histogram.total, 2);
  assert.equal(outputHue.histogram.total, 0);
  assert.equal(dataReads, 1);
  assert.equal(cacheMisses.filter(key => key.startsWith("source-histogram-samples-v1")).length, 1);
  assert.equal(cacheMisses.filter(key => key.includes("output-histogram-samples-v1")).length, 1);
});
