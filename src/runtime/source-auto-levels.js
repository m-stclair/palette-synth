import { clamp, clamp01, rgb8ToLab } from "../color-utils.js";

const DEFAULT_LOW_PERCENTILE = 0.10;
const DEFAULT_HIGH_PERCENTILE = 0.90;
const DEFAULT_MIN_LOW_TARGET = 0.08;
const DEFAULT_MAX_LOW_DARKEN = 0.06;
const DEFAULT_LOW_LIFT = 0.015;
const DEFAULT_HIGH_TARGET = 0.92;
const DEFAULT_MAX_HIGH_LIFT = 0.16;
const DEFAULT_MAX_SAMPLES = 16384;
const EPSILON = 1e-4;

function roundToStep(value, step) {
  const safeStep = Number(step) || 1;
  return Math.round(value / safeStep) * safeStep;
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) return NaN;
  const t = clamp01(Number(p));
  const index = (sortedValues.length - 1) * t;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sortedValues[lo];
  const mix = index - lo;
  return sortedValues[lo] * (1 - mix) + sortedValues[hi] * mix;
}

function chooseLowTarget(pLow, options = {}) {
  const minLowTarget = clamp(Number(options.minLowTarget ?? DEFAULT_MIN_LOW_TARGET), EPSILON, 1 - EPSILON);
  const maxLowDarken = Math.max(0, Number(options.maxLowDarken ?? DEFAULT_MAX_LOW_DARKEN));
  const lowLift = Math.max(0, Number(options.lowLift ?? DEFAULT_LOW_LIFT));

  if (pLow < minLowTarget) {
    return clamp(pLow + lowLift, EPSILON, minLowTarget);
  }
  return clamp(pLow - maxLowDarken, minLowTarget, pLow);
}

function chooseHighTarget(pHigh, lowTarget, options = {}) {
  const desiredHigh = clamp(Number(options.highTarget ?? DEFAULT_HIGH_TARGET), lowTarget + EPSILON, 1 - EPSILON);
  const maxHighLift = Math.max(0, Number(options.maxHighLift ?? DEFAULT_MAX_HIGH_LIFT));
  if (pHigh >= desiredHigh) return clamp(pHigh, lowTarget + EPSILON, 1 - EPSILON);
  return clamp(Math.min(desiredHigh, pHigh + maxHighLift), lowTarget + EPSILON, 1 - EPSILON);
}

export function sampleOklabLightness(imageData, {maxSamples = DEFAULT_MAX_SAMPLES} = {}) {
  const width = Math.max(0, Math.round(Number(imageData?.width) || 0));
  const height = Math.max(0, Math.round(Number(imageData?.height) || 0));
  const data = imageData?.data;
  if (!width || !height || !data?.length) return [];

  const pixelCount = width * height;
  const stride = Math.max(1, Math.floor(pixelCount / Math.max(1, Math.round(Number(maxSamples) || DEFAULT_MAX_SAMPLES))));
  const start = Math.floor(stride / 2);
  const values = [];
  for (let pixel = start; pixel < pixelCount; pixel += stride) {
    const offset = pixel * 4;
    if ((data[offset + 3] ?? 255) <= 0) continue;
    const lab = rgb8ToLab(data[offset], data[offset + 1], data[offset + 2]);
    values.push(clamp01(lab[0] / 100));
  }
  values.sort((a, b) => a - b);
  return values;
}

export function calculateAutoSourceLevels(imageData, options = {}) {
  const values = sampleOklabLightness(imageData, options);
  if (values.length < 2) return null;

  const lowPercentile = options.lowPercentile ?? DEFAULT_LOW_PERCENTILE;
  const highPercentile = options.highPercentile ?? DEFAULT_HIGH_PERCENTILE;
  const pLow = percentile(values, lowPercentile);
  const pHigh = percentile(values, highPercentile);
  if (!Number.isFinite(pLow) || !Number.isFinite(pHigh) || pHigh - pLow < EPSILON) return null;

  const lowTarget = chooseLowTarget(pLow, options);
  const highTarget = chooseHighTarget(pHigh, lowTarget, options);

  const x1 = clamp(pLow, EPSILON, 1);
  const x2 = clamp(pHigh, EPSILON, 1);
  const logX1 = Math.log2(x1);
  const logX2 = Math.log2(x2);
  const logY1 = Math.log2(lowTarget);
  const logY2 = Math.log2(highTarget);
  const gamma = (logX2 - logX1) / (logY2 - logY1);
  const exposure = gamma * logY1 - logX1;

  if (!Number.isFinite(gamma) || !Number.isFinite(exposure)) return null;

  return {
    levelsExposure: clamp(roundToStep(exposure, options.exposureStep ?? 0.05), -4, 4),
    levelsGamma: clamp(roundToStep(gamma, options.gammaStep ?? 0.01), 0.2, 4),
    pLow,
    pHigh,
    lowTarget,
    highTarget,
    lowPercentile,
    highPercentile,
    sampleCount: values.length
  };
}

export function calculateAutoSourceLevelsFromCanvas(canvas, ctx = null, options = {}) {
  const width = Math.max(0, Math.round(Number(canvas?.width) || 0));
  const height = Math.max(0, Math.round(Number(canvas?.height) || 0));
  if (!width || !height) return null;
  const sourceCtx = ctx || canvas.getContext?.("2d", {willReadFrequently: true});
  if (typeof sourceCtx?.getImageData !== "function") return null;
  return calculateAutoSourceLevels(sourceCtx.getImageData(0, 0, width, height), options);
}
