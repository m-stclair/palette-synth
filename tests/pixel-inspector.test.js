import test from "node:test";
import assert from "node:assert/strict";
import { analyzePixelAtImagePoint, applyOutputModeCpu, blendHexes, samplePixelBlockColor, snapPixelBlockPoint } from "../src/diagnostics/pixel-inspector.js";
import { assignmentWeights, topPaletteMatches } from "../src/diagnostics/metrics.js";
import { labDistanceComponents } from "../src/color-utils.js";

function assertApproximatelyEqual(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be within ${epsilon} of ${expected}`);
}

function assertLabApproximatelyEqual(actual, expected, epsilon = 1e-6) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < expected.length; i++) assertApproximatelyEqual(actual[i], expected[i], epsilon);
}

test("snapPixelBlockPoint samples the same source texel for a whole pixel-art block", () => {
  assert.deepEqual(snapPixelBlockPoint(0, 0, 10, 10, 4), {x: 2, y: 2});
  assert.deepEqual(snapPixelBlockPoint(3, 3, 10, 10, 4), {x: 2, y: 2});
  assert.deepEqual(snapPixelBlockPoint(9, 9, 10, 10, 4), {x: 9, y: 9});
  assert.deepEqual(snapPixelBlockPoint(-10, 20, 10, 10, 1), {x: 0, y: 9});
});

test("applyOutputModeCpu mirrors preserve luma/chroma/hue-wash modes", () => {
  const sourceLab = [20, 3, 4];
  const paletteLab = [60, 0, 10];

  assert.deepEqual(applyOutputModeCpu(sourceLab, paletteLab, {outputMode: "preserveLuma"}), [20, 0, 10]);
  assertLabApproximatelyEqual(applyOutputModeCpu(sourceLab, paletteLab, {outputMode: "preserveChroma"}), [60, 0, 5]);
  assertLabApproximatelyEqual(applyOutputModeCpu(sourceLab, paletteLab, {outputMode: "hueWash"}), [20, 0, 5]);
  assert.equal(applyOutputModeCpu(sourceLab, paletteLab, {outputMode: "quantized"}), paletteLab);
});

test("categorical neutral hue-wash turns neutral palette matches into neutral output", () => {
  const sourceLab = [42, 8, 6];
  const grayPaletteLab = [60, 0.6, 0.6];

  assertLabApproximatelyEqual(applyOutputModeCpu(sourceLab, grayPaletteLab, {outputMode: "hueWash"}), [42, 8, 6]);
  assert.deepEqual(applyOutputModeCpu(sourceLab, grayPaletteLab, {outputMode: "hueWash", neutralIsCategory: true}), [42, 0, 0]);
});

test("applyOutputModeCpu keeps neutral source chroma neutral in chroma-preserving modes", () => {
  const nearGraySourceLab = [50, 0.6, 0.6];
  const yellowPaletteLab = [70, 0, 40];

  assert.deepEqual(applyOutputModeCpu(nearGraySourceLab, yellowPaletteLab, {outputMode: "preserveChroma"}), [70, 0, 0]);
  assert.deepEqual(applyOutputModeCpu(nearGraySourceLab, yellowPaletteLab, {outputMode: "hueWash"}), [50, 0, 0]);
});

test("applyOutputModeCpu uses source color inside shadow/highlight band", () => {
  const sourceLab = [50, 3, 4];
  const paletteLab = [60, 0, 10];

  assert.equal(applyOutputModeCpu(sourceLab, paletteLab, {outputMode: "shadowHighlight", shadowCutoff: 20, highlightCutoff: 80}), sourceLab);
  assert.equal(applyOutputModeCpu([10, 3, 4], paletteLab, {outputMode: "shadowHighlight", shadowCutoff: 20, highlightCutoff: 80}), paletteLab);
  assert.equal(applyOutputModeCpu([90, 3, 4], paletteLab, {outputMode: "shadowHighlight", shadowCutoff: 80, highlightCutoff: 20}), paletteLab);
});

test("blendHexes clamps and interpolates byte colors", () => {
  assert.equal(blendHexes("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(blendHexes("#000000", "#ffffff", 2), "#ffffff");
  assert.equal(blendHexes("#000000", "#ffffff", -1), "#000000");
});

test("analyzePixelAtImagePoint clamps coordinates and reports weighted mapped color", () => {
  let ensured = 0;
  const records = [{id: "a"}, {id: "b"}];
  const matches = [
    {renderLab: [50, 10, 0], displayIndex: 0},
    {renderLab: [30, -10, 0], displayIndex: 1}
  ];
  const result = analyzePixelAtImagePoint({
    x: 99,
    y: 3,
    imageData: {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([
        10, 20, 30, 255,
        200, 100, 50, 255
      ])
    },
    paletteRecords: records,
    config: {outputMode: "quantized", blendAmount: 1},
    ensurePalette: () => { ensured++; },
    renderPaletteLabs: inputRecords => inputRecords.map((_, index) => [index, 0, 0]),
    paletteUniformEntries: (inputRecords, labs) => inputRecords.map((record, index) => ({sourceRecord: record, renderLab: labs[index], featureLab: labs[index]})),
    topPaletteMatches: () => matches,
    assignmentWeights: () => [0.25, 0.75]
  });

  assert.equal(ensured, 1);
  assert.equal(result.x, 1);
  assert.equal(result.y, 0);
  assert.equal(result.sourceHex, "#c86432");
  assertLabApproximatelyEqual(result.mappedLab, [35, -5, 0]);
  assert.equal(result.outputLab, result.mappedLab);
  assert.equal(result.finalHex, result.fxHex);
  assert.ok(Number.isFinite(result.fxDelta.luma));
  assert.ok(Number.isFinite(result.blendDelta.luma));
  assert.deepEqual(result.finalDelta, result.blendDelta);
  assert.deepEqual(result.outputDelta, result.blendDelta);
  assert.equal(result.assigned, matches[0]);
});

test("analyzePixelAtImagePoint reads palette records after ensurePalette refreshes them", () => {
  const staleRecords = [{id: "stale", lab: [0, 0, 0]}];
  const freshRecords = [{id: "fresh", lab: [80, 0, 0]}];
  let currentRecords = staleRecords;
  let seenRecords = null;

  const result = analyzePixelAtImagePoint({
    x: 0,
    y: 0,
    imageData: {width: 1, height: 1, data: new Uint8ClampedArray([240, 240, 240, 255])},
    paletteRecords: () => currentRecords,
    config: {outputMode: "quantized", blendAmount: 1},
    ensurePalette: () => { currentRecords = freshRecords; },
    renderPaletteLabs: inputRecords => { seenRecords = inputRecords; return inputRecords.map(record => record.lab); },
    paletteUniformEntries: (inputRecords, labs) => inputRecords.map((record, index) => ({
      sourceRecord: record,
      featureLab: record.lab,
      renderLab: labs[index]
    })),
    topPaletteMatches: (sourceLab, entries) => [{...entries[0], distance: 0, parts: {luma: 0, chroma: 0, hue: 0}, displayIndex: 0}],
    assignmentWeights: () => [1]
  });

  assert.equal(seenRecords, freshRecords);
  assert.equal(result.matches[0].sourceRecord.id, "fresh");
});

test("samplePixelBlockColor can report linear-light mean block color", () => {
  const imageData = {
    width: 2,
    height: 2,
    data: new Uint8ClampedArray([
      0, 0, 0, 255,       255, 255, 255, 255,
      0, 0, 0, 255,       255, 255, 255, 255
    ])
  };

  const center = samplePixelBlockColor(imageData, 0, 0, 2, "center");
  const mean = samplePixelBlockColor(imageData, 0, 0, 2, "mean");

  assert.equal(byteHex(center), "#ffffff");
  assert.equal(byteHex(mean), "#bcbcbc");
});

test("samplePixelBlockColor can report a real representative block pixel", () => {
  const imageData = {
    width: 2,
    height: 2,
    data: new Uint8ClampedArray([
      0, 0, 0, 255,       128, 128, 128, 255,
      128, 128, 128, 255, 255, 255, 255, 255
    ])
  };

  const representative = samplePixelBlockColor(imageData, 0, 0, 2, "representative");

  assert.deepEqual({x: representative.x, y: representative.y}, {x: 1, y: 0});
  assert.equal(byteHex(representative), "#808080");
});

function byteHex(color) {
  return "#" + [color.r, color.g, color.b].map(value => Math.round(value).toString(16).padStart(2, "0")).join("");
}

test("analyzePixelAtImagePoint reports the snapped source color when pixel blocks are enabled", () => {
  const result = analyzePixelAtImagePoint({
    x: 0,
    y: 0,
    imageData: {
      width: 3,
      height: 3,
      data: new Uint8ClampedArray([
        1, 1, 1, 255,     2, 2, 2, 255,     3, 3, 3, 255,
        4, 4, 4, 255,     9, 8, 7, 255,     6, 6, 6, 255,
        7, 7, 7, 255,     8, 8, 8, 255,     9, 9, 9, 255
      ])
    },
    paletteRecords: [],
    config: {outputMode: "quantized", blendAmount: 0, pixelArtEnabled: true, pixelBlockSize: 3}
  });

  assert.equal(result.x, 1);
  assert.equal(result.y, 1);
  assert.equal(result.sourceHex, "#090807");
});

test("analyzePixelAtImagePoint keeps source color when max-distance gate rejects assignment", () => {
  const sourceLab = [50, 0, 0];
  const matches = [{renderLab: [80, 20, 0], distance: 40, displayIndex: 0}];
  const result = analyzePixelAtImagePoint({
    x: 0,
    y: 0,
    imageData: {width: 1, height: 1, data: new Uint8ClampedArray([128, 128, 128, 255])},
    paletteRecords: [{}],
    config: {outputMode: "quantized", blendAmount: 1, maxDistanceEnabled: true, maxDistance: 10},
    ensurePalette: () => {},
    renderPaletteLabs: () => [[80, 20, 0]],
    paletteUniformEntries: () => [{renderLab: [80, 20, 0], featureLab: [80, 20, 0]}],
    topPaletteMatches: () => matches,
    assignmentWeights: () => [0]
  });

  assertLabApproximatelyEqual(result.mappedLab, result.sourceLab);
  assert.equal(result.finalHex, result.sourceHex);
  assert.equal(result.assigned, null);
});

test("analyzePixelAtImagePoint reports fx delta in the same weighted metric as the winning nearest swatch", () => {
  const records = [
    {lab: [35, 22, -18], displayIndex: 0},
    {lab: [80, -10, 20], displayIndex: 1}
  ];
  const config = {
    outputMode: "quantized",
    assignMode: "nearest",
    blendAmount: 1,
    lumaWeight: 0.75,
    chromaWeight: 0.5,
    hueWeight: 0.5
  };
  const result = analyzePixelAtImagePoint({
    x: 0,
    y: 0,
    imageData: {width: 1, height: 1, data: new Uint8ClampedArray([45, 26, 75, 255])},
    paletteRecords: records,
    config,
    ensurePalette: () => {},
    renderPaletteLabs: inputRecords => inputRecords.map(record => record.lab),
    paletteUniformEntries: (inputRecords, labs) => inputRecords.map((record, index) => {
      const featureParts = labDistanceComponents(record.lab);
      return {
        sourceRecord: record,
        featureLab: record.lab,
        featureLightness: featureParts.lightness,
        featureChroma: featureParts.chroma,
        featureHue: featureParts.scaledHue,
        renderLab: labs[index],
        featureHex: `feature-${index}`,
        renderHex: `render-${index}`,
        alias: false
      };
    }),
    topPaletteMatches: (sourceLab, entries, limit) => topPaletteMatches(sourceLab, entries, {config, records, limit}),
    assignmentWeights: matches => assignmentWeights(matches, null, config)
  });

  assert.equal(result.finalHex, result.fxHex);
  assert.equal(result.weights[0], 1);
  assertApproximatelyEqual(result.fxDelta.luma, result.matches[0].parts.luma);
  assertApproximatelyEqual(result.fxDelta.chroma, result.matches[0].parts.chroma);
  assertApproximatelyEqual(result.fxDelta.hue, result.matches[0].parts.hue);
});
