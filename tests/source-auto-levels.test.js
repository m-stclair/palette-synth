import test from "node:test";
import assert from "node:assert/strict";
import { calculateAutoSourceLevels, calculateAutoSourceLevelsFromCanvas, sampleOklabLightness } from "../src/runtime/source-auto-levels.js";

function imageDataFromGrays(values) {
  const data = new Uint8ClampedArray(values.length * 4);
  values.forEach((v, i) => {
    const o = i * 4;
    data[o] = v;
    data[o + 1] = v;
    data[o + 2] = v;
    data[o + 3] = 255;
  });
  return {width: values.length, height: 1, data};
}

function applyLightnessLevels(l, result) {
  return Math.pow(Math.max(0, l * Math.pow(2, result.levelsExposure)), 1 / result.levelsGamma);
}

test("source auto levels samples visible Oklab lightness and ignores transparent pixels", () => {
  const data = new Uint8ClampedArray([
    0, 0, 0, 0,
    128, 128, 128, 255,
    255, 255, 255, 255
  ]);
  const values = sampleOklabLightness({width: 3, height: 1, data});
  assert.equal(values.length, 2);
  assert.ok(values[0] > 0 && values[0] < values[1]);
  assert.ok(Math.abs(values[1] - 1) < 1e-6);
});

test("source auto levels solves conservative exposure and gamma for scene anchors", () => {
  const imageData = imageDataFromGrays(Array.from({length: 256}, (_, i) => i));
  const result = calculateAutoSourceLevels(imageData, {maxSamples: 256});
  assert.ok(result);
  assert.equal(typeof result.levelsExposure, "number");
  assert.equal(typeof result.levelsGamma, "number");
  assert.ok(result.levelsExposure >= -4 && result.levelsExposure <= 4);
  assert.ok(result.levelsGamma >= 0.2 && result.levelsGamma <= 4);
  assert.equal(result.lowPercentile, 0.10);
  assert.equal(result.highPercentile, 0.90);
  assert.ok(result.lowTarget >= 0.08);
  assert.ok(result.highTarget <= Math.max(0.92, result.pHigh));
});

test("source auto levels preserves natural-scene shadows instead of forcing them to black", () => {
  const result = calculateAutoSourceLevels(imageDataFromGrays([77, 133, 199]), {
    maxSamples: 3,
    lowPercentile: 0,
    highPercentile: 1,
    exposureStep: 0.0001,
    gammaStep: 0.0001
  });
  assert.ok(result);
  assert.ok(result.lowTarget >= 0.22);
  assert.ok(result.highTarget <= 0.93);
  assert.ok(applyLightnessLevels(0.30, result) > 0.20);
  assert.ok(applyLightnessLevels(0.52, result) > 0.45);
});

test("source auto levels returns null for flat or unavailable source data", () => {
  assert.equal(calculateAutoSourceLevels(imageDataFromGrays([120, 120, 120, 120])), null);
  assert.equal(calculateAutoSourceLevelsFromCanvas({width: 0, height: 10}), null);
});

test("source auto levels can read from a canvas context", () => {
  const imageData = imageDataFromGrays([0, 64, 128, 192, 255]);
  const canvas = {width: 5, height: 1};
  const ctx = {getImageData: (x, y, width, height) => ({...imageData, width, height})};
  const result = calculateAutoSourceLevelsFromCanvas(canvas, ctx, {maxSamples: 5});
  assert.ok(result);
  assert.equal(result.sampleCount, 5);
});
