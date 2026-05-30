import { HUE_DISTANCE_SCALE, MAX_PALETTE_SIZE, NEUTRAL_CHROMA_EPSILON } from "../constants.js";
import {
  byteRgbToHex,
  clamp,
  clamp01,
  hasReliableHue,
  hueGateForPair,
  hueReliabilityForLightnessAndChroma,
  labDistanceComponents,
  labToHex,
  paletteHue,
  rgb8ToLab
} from "../color-utils.js";
import { applyOutputModeCpu, finalOutputLabForLab } from "./output-color.js";

/** @typedef {import("../types.d.ts").AppConfig} AppConfig */
/** @typedef {import("../types.d.ts").DistanceBreakdown} DistanceBreakdown */
/** @typedef {import("../types.d.ts").ImageDataSource} ImageDataSource */
/** @typedef {import("../types.d.ts").Lab} Lab */
/** @typedef {import("../types.d.ts").PaletteDiagnostics} PaletteDiagnostics */
/** @typedef {import("../types.d.ts").PaletteMatch} PaletteMatch */
/** @typedef {import("../types.d.ts").PaletteRecord} PaletteRecord */
/** @typedef {import("../types.d.ts").PaletteUniformEntry} PaletteUniformEntry */

// All tunable diagnostic thresholds live here so the sampler, renderers, and
// pixel inspector agree on what counts as underused, overused, ambiguous,
// or colliding. Anything that was previously a magic number elsewhere in
// the diagnostics module should be sourced from this block.
export const DIAGNOSTIC = {
  // Stratified-grid sample budget for the image audit.
  targetSamples: 5200,
  // Top-k matches retained per pixel; bounded by blendK for blend mode.
  matchLimit: 5,
  // Source/output distribution views: deliberately computed only when the
  // top-level Histogram inspector tab is selected. Contribution diagnostics
  // stay focused on
  // palette assignment instead of also paying a histogram tax.
  histogramBins: 80,
  // Underused: contribution below this fraction of the uniform baseline 1/N.
  // Scales with palette size so a 50-swatch palette is judged proportionally.
  underusedBaselineFraction: 0.10,
  // Overused: contribution above this fraction of the uniform baseline 1/N.
  overusedBaselineFraction: 3.0,
  // Ambiguous pixel: best-vs-second gap below max(abs, rel * second.distance).
  ambiguousAbsoluteGap: 1.25,
  ambiguousRelativeGap: 0.10,
  // Palette collision threshold (weighted distance). Anchored to the user's
  // minDistance preference but clamped so it's always principled in absolute
  // OKLab-scaled units regardless of slider extremes.
  collisionAnchorFraction: 0.32,
  collisionAnchorMin: 3.5,
  collisionAnchorMax: 8.0,
  // Minimum dither second-share before we count the second swatch as
  // actually contributing to the pixel.
  ditherMinShare: 0.0625
};

function safeScaledHue(hue) {
  return Array.isArray(hue) && hue.length >= 2
    ? [Number(hue[0]) || 0, Number(hue[1]) || 0]
    : [0, 0];
}

function recordDistanceComponents(record) {
  if (Number.isFinite(Number(record?.lightness)) && Number.isFinite(Number(record?.chroma)) && Array.isArray(record?.scaledHue)) {
    return {
      lightness: Number(record.lightness),
      chroma: Math.max(0, Number(record.chroma) || 0),
      scaledHue: safeScaledHue(record.scaledHue)
    };
  }
  return labDistanceComponents(record?.lab);
}

/**
 * @param {number} labLightness
 * @param {number} labChroma
 * @param {import("../types.d.ts").ScaledHue} labHue
 * @param {number} featureLightness
 * @param {number} featureChroma
 * @param {import("../types.d.ts").ScaledHue} featureHue
 * @param {AppConfig|Object} [config]
 * @returns {DistanceBreakdown}
 */
export function cpuDistanceBreakdown(labLightness, labChroma, labHue, featureLightness, featureChroma, featureHue, config = {}) {
  const dL = labLightness - featureLightness;
  const dC = labChroma - featureChroma;

  // Continuous mode suppresses hue when either side is neutral. The neutral
  // tube widens near black and white, where small a/b offsets are mostly glare,
  // quantization, or display behavior rather than a stable perceived hue.
  // Categorical neutral mode still lifts the achromatic axis off the hue plane,
  // but the lift is gated by the colored side's lightness-aware hue reliability.
  const labHasHue = hasReliableHue(labLightness, labChroma);
  const featureHasHue = hasReliableHue(featureLightness, featureChroma);
  const hueSuppressed = !(labHasHue && featureHasHue) && !(config.neutralIsCategory && labHasHue !== featureHasHue);
  let hueBias = 0;
  if (labHasHue && featureHasHue) {
    const theta = clamp(labHue[0] * featureHue[0] + labHue[1] * featureHue[1], -1, 1);
    const hueGate = hueGateForPair(labLightness, labChroma, featureLightness, featureChroma);
    const hueSeparation = Math.sqrt(Math.max(0, 2 - 2 * theta));
    hueBias = HUE_DISTANCE_SCALE * hueGate * hueSeparation;
  } else if (config.neutralIsCategory && labHasHue !== featureHasHue) {
    const hueGate = labHasHue
      ? hueReliabilityForLightnessAndChroma(labLightness, labChroma)
      : hueReliabilityForLightnessAndChroma(featureLightness, featureChroma);
    hueBias = HUE_DISTANCE_SCALE * hueGate * Math.SQRT2;
  }

  const luma = Math.max(0, Number(config.lumaWeight) || 0) * Math.abs(dL);
  const chroma = Math.max(0, Number(config.chromaWeight) || 0) * Math.abs(dC);
  const hue = Math.max(0, Number(config.hueWeight) || 0) * Math.abs(hueBias);
  return {luma, chroma, hue, hueSuppressed, total: luma + chroma + hue, raw: {dL, dC, hueBias, hueSuppressed}};
}

export function maxDistanceRejectsMatch(match, config = {}) {
  if (!config.maxDistanceEnabled || !match) return false;
  const maxDistance = Number(config.maxDistance);
  return Number.isFinite(maxDistance) && match.distance > Math.max(0, maxDistance);
}

function comparePaletteMatchKeys(distance, displayIndex, entryIndex, match) {
  return distance - match.distance || displayIndex - match.displayIndex || entryIndex - match.entryIndex;
}

function comparePaletteMatches(a, b) {
  return comparePaletteMatchKeys(a.distance, a.displayIndex, a.entryIndex, b);
}

function insertTopPaletteMatch(matches, match, limit) {
  let insertAt = matches.length;
  while (insertAt > 0 && comparePaletteMatches(match, matches[insertAt - 1]) < 0) insertAt--;
  if (insertAt >= limit) return;
  matches.splice(insertAt, 0, match);
  if (matches.length > limit) matches.pop();
}

// Match objects are report rows, not swatches. `featureLab` explains why a
// pixel matched; `renderLab` explains what color the output estimator/shader will
// blend; `record.hex`/`record.displayIndex` explain which visible swatch gets
// credited. Keeping all three is noisy, but collapsing them loses real state.
/**
 * @param {Lab} lab
 * @param {PaletteUniformEntry[]} entries
 * @param {{config?: AppConfig|Object, records?: PaletteRecord[], limit?: number, maxPaletteSize?: number}} [options]
 * @returns {PaletteMatch[]}
 */
export function topPaletteMatches(lab, entries, {config = {}, records = [], limit = DIAGNOSTIC.matchLimit, maxPaletteSize = MAX_PALETTE_SIZE} = {}) {
  const requestedLimit = Math.max(1, limit);
  const matchLimit = requestedLimit === Infinity ? Infinity : Math.trunc(requestedLimit);
  if (!(matchLimit > 0)) return [];

  const matches = [];
  const safeEntries = Array.isArray(entries) ? entries : [];
  const safeRecords = Array.isArray(records) ? records : [];
  const labParts = labDistanceComponents(lab);
  for (let i = 0; i < safeEntries.length; i++) {
    const entry = safeEntries[i];
    const parts = cpuDistanceBreakdown(
      labParts.lightness,
      labParts.chroma,
      labParts.scaledHue,
      entry.featureLightness,
      entry.featureChroma,
      entry.featureHue,
      config
    );
    const record = entry.sourceRecord || safeRecords[i] || null;
    const displayIndex = Number.isInteger(record?.displayIndex) ? record.displayIndex : Math.min(i, maxPaletteSize - 1);
    if (matches.length >= matchLimit && comparePaletteMatchKeys(parts.total, displayIndex, i, matches[matches.length - 1]) >= 0) continue;
    insertTopPaletteMatch(matches, {
      entryIndex: i,
      displayIndex,
      record,
      alias: !!entry.alias,
      featureLab: entry.featureLab,
      renderLab: entry.renderLab,
      hex: entry.renderHex,
      featureHex: entry.featureHex,
      distance: parts.total,
      parts
    }, matchLimit);
  }
  return matches;
}

export function diagnosticsSignature({imageData, records = [], entries = [], config = {}, includeCycleOffset = false} = {}) {
  const recordKey = (records || []).map(record => [
    record.id,
    record.hex,
    record.locked ? 1 : 0,
    record.variant,
    record.displayIndex,
    record.swatchId || ""
  ].join(":")) .join("|");
  const entryKey = (entries || []).map(entry => `${entry.alias ? "a" : "n"}:${labToHex(entry.featureLab)}>${labToHex(entry.renderLab)}:${entry.sourceRecord?.displayIndex ?? ""}`).join("|");
  return [
    imageData?.width || 0,
    imageData?.height || 0,
    imageData?.version ?? "",
    Number(config.lumaWeight).toFixed(3),
    Number(config.chromaWeight).toFixed(3),
    Number(config.hueWeight).toFixed(3),
    config.paletteMode,
    config.assignMode,
    config.outputMode,
    config.neutralIsCategory ? 1 : 0,
    config.monotoneBlendDither ? 1 : 0,
    config.blendK,
    config.softness,
    config.ditherLumaAmount,
    config.blendAmount,
    config.maxDistanceEnabled ? 1 : 0,
    Number(config.maxDistance || 0).toFixed(3),
    includeCycleOffset ? config.cycleOffset : 0,
    recordKey,
    entryKey
  ].join("~");
}

function addMatchContribution(counts, aliasCounts, match, amount, recordCount) {
  if (!match || !(amount > 0)) return;
  const displayIndex = clamp(match.displayIndex, 0, Math.max(0, recordCount - 1));
  counts[displayIndex] += amount;
  if (match.alias) aliasCounts[displayIndex] += amount;
}

export function ditherSecondShare(best, second, labL, config = {}) {
  if (!best || !second || (Number(config.blendK) || 1) <= 1) return 0;
  const softness = Math.max(0.001, Number(config.softness) || 1);
  const bestWeight = 1 / Math.pow(best.distance + 1e-5, softness);
  const secondWeight = 1 / Math.pow(second.distance + 1e-5, softness);
  let chooseSecond = secondWeight / Math.max(bestWeight + secondWeight, 1e-5);
  const luma01 = clamp(labL / 100, 0, 1);
  const midtone = 1 - Math.abs(luma01 * 2 - 1);
  const scale = 1 + (midtone - 1) * clamp(Number(config.ditherLumaAmount) || 0, 0, 1);
  chooseSecond = clamp01(chooseSecond * scale);
  return chooseSecond >= DIAGNOSTIC.ditherMinShare ? chooseSecond : 0;
}

const MONOTONE_GUARD_EPSILON = 1e-4;

function renderLabForMatch(match) {
  if (Array.isArray(match?.renderLab)) return match.renderLab;
  if (Array.isArray(match?.featureLab)) return match.featureLab;
  if (Array.isArray(match?.record?.lab)) return match.record.lab;
  return [0, 0, 0];
}

function assignmentDistanceBetweenLabs(sourceLab, candidateLab, config = {}) {
  const source = labDistanceComponents(sourceLab);
  const candidate = labDistanceComponents(candidateLab);
  return cpuDistanceBreakdown(
    source.lightness,
    source.chroma,
    source.scaledHue,
    candidate.lightness,
    candidate.chroma,
    candidate.scaledHue,
    config
  ).total;
}

function guardedOutputDistance(sourceLab, candidateLab, config = {}) {
  return assignmentDistanceBetweenLabs(sourceLab, applyOutputModeCpu(sourceLab, candidateLab, config), config);
}

function monotoneOutputGuardRejects(sourceLab, candidateOutputLab, nearestOutputLab, config = {}) {
  return assignmentDistanceBetweenLabs(sourceLab, candidateOutputLab, config) > assignmentDistanceBetweenLabs(sourceLab, nearestOutputLab, config) + MONOTONE_GUARD_EPSILON;
}

function monotoneGuardRejects(sourceLab, candidateLab, nearestLab, config = {}) {
  return guardedOutputDistance(sourceLab, candidateLab, config) > guardedOutputDistance(sourceLab, nearestLab, config) + MONOTONE_GUARD_EPSILON;
}

function mixLabs(a, b, amount) {
  const t = clamp01(amount);
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}

function monotoneGuardEnabled(config = {}) {
  return !!config.monotoneBlendDither && (config.assignMode === "blend" || config.assignMode === "dither");
}

function nearestOnlyWeights(length) {
  const weights = Array.from({length}, () => 0);
  if (length > 0) weights[0] = 1;
  return weights;
}

function weightedMappedLab(matches, weights) {
  const mappedLab = [0, 0, 0];
  let totalWeight = 0;
  for (let i = 0; i < matches.length; i++) {
    const weight = weights[i];
    if (!(weight > 0)) continue;
    const lab = renderLabForMatch(matches[i]);
    totalWeight += weight;
    mappedLab[0] += lab[0] * weight;
    mappedLab[1] += lab[1] * weight;
    mappedLab[2] += lab[2] * weight;
  }
  if (totalWeight <= 0) return null;
  return mappedLab.map(channel => channel / totalWeight);
}

// Single source of truth for how the current assign mode distributes a
// pixel across its top palette matches. Returns one weight per entry in
// `matches`, summing to ~1, in the same order as `matches`.
//
//  - nearest: [1, 0, 0, ...]
//  - blend:   normalized inverse-distance weights over the top-k matches
//  - dither:  [1 - share, share, 0, ...] using the dither second-share
//
// The diagnostics sampler and the pixel inspector both consume these so
// their reported contribution numbers and per-row mix percentages stay
// consistent with each other and with the actual shader behavior.
export function assignmentWeights(matches, lab, config = {}) {
  const safeMatches = Array.isArray(matches) ? matches : [];
  const sourceLab = Array.isArray(lab) ? lab : [0, 0, 0];
  const weights = safeMatches.map(() => 0);
  if (!safeMatches.length) return weights;
  if (maxDistanceRejectsMatch(safeMatches[0], config)) return weights;

  if (config.assignMode === "blend") {
    const k = Math.min(Math.max(Math.round(Number(config.blendK) || 1), 1), safeMatches.length, DIAGNOSTIC.matchLimit);
    const softness = Math.max(0.001, Number(config.softness) || 1);
    let total = 0;
    const raw = new Array(k);
    for (let i = 0; i < k; i++) {
      raw[i] = 1 / Math.pow(safeMatches[i].distance + 1e-5, softness);
      total += raw[i];
    }
    for (let i = 0; i < k; i++) weights[i] = raw[i] / Math.max(total, 1e-5);

    if (monotoneGuardEnabled(config)) {
      const mappedLab = weightedMappedLab(safeMatches, weights);
      const nearestLab = renderLabForMatch(safeMatches[0]);
      if (mappedLab && monotoneGuardRejects(sourceLab, mappedLab, nearestLab, config)) {
        return nearestOnlyWeights(safeMatches.length);
      }
    }

    return weights;
  }

  if (config.assignMode === "dither") {
    let share = ditherSecondShare(safeMatches[0], safeMatches[1] || null, sourceLab[0], config);
    if (share > 0 && monotoneGuardEnabled(config)) {
      const nearestLab = renderLabForMatch(safeMatches[0]);
      const secondLab = renderLabForMatch(safeMatches[1]);
      const nearestOutputLab = applyOutputModeCpu(sourceLab, nearestLab, config);
      const secondOutputLab = applyOutputModeCpu(sourceLab, secondLab, config);
      const averageOutputLab = mixLabs(nearestOutputLab, secondOutputLab, share);
      if (monotoneOutputGuardRejects(sourceLab, averageOutputLab, nearestOutputLab, config)) {
        share = 0;
      }
    }
    weights[0] = 1 - share;
    if (safeMatches.length > 1) weights[1] = share;
    return weights;
  }

  weights[0] = 1;
  return weights;
}

export function applyAssignmentContributions(matches, lab, contributionCounts, aliasContributionCounts, {config = {}, recordCount = 0} = {}) {
  const weights = assignmentWeights(matches, lab, config);
  for (let i = 0; i < matches.length; i++) {
    if (weights[i] > 0) addMatchContribution(contributionCounts, aliasContributionCounts, matches[i], weights[i], recordCount);
  }
}

export function sampleImageDiagnostics(imageData, entries, records, config = {}) {
  if (!imageData) return null;
  const safeRecords = Array.isArray(records) ? records : [];
  const recordCount = safeRecords.length;
  const territoryCounts = Array.from({length: recordCount}, () => 0);
  const aliasTerritoryCounts = Array.from({length: recordCount}, () => 0);
  const contributionCounts = Array.from({length: recordCount}, () => 0);
  const aliasContributionCounts = Array.from({length: recordCount}, () => 0);
  const distances = [];
  const step = Math.max(1, Math.ceil(Math.sqrt((imageData.width * imageData.height) / DIAGNOSTIC.targetSamples)));
  const startX = Math.floor(step / 2);
  const startY = Math.floor(step / 2);
  const matchLimit = config.assignMode === "blend"
    ? Math.min(Math.max(Math.round(Number(config.blendK) || 1), 1), DIAGNOSTIC.matchLimit)
    : 2;
  let sampleCount = 0;
  let totalDistance = 0;
  let totalLuma = 0;
  let totalChroma = 0;
  let totalHue = 0;
  let ambiguousCount = 0;
  let worst = null;

  for (let y = startY; y < imageData.height; y += step) {
    for (let x = startX; x < imageData.width; x += step) {
      const px = (y * imageData.width + x) * 4;
      const alpha = imageData.data[px + 3];
      if (alpha <= 4) continue;
      const lab = rgb8ToLab(imageData.data[px], imageData.data[px + 1], imageData.data[px + 2]);
      const matches = topPaletteMatches(lab, entries, {config, records: safeRecords, limit: matchLimit});
      const best = matches[0];
      const second = matches[1] || null;
      const rejectedByMaxDistance = maxDistanceRejectsMatch(best, config);
      if (!rejectedByMaxDistance) {
        const displayIndex = clamp(best.displayIndex, 0, Math.max(0, recordCount - 1));
        territoryCounts[displayIndex] += 1;
        if (best.alias) aliasTerritoryCounts[displayIndex] += 1;
        applyAssignmentContributions(matches, lab, contributionCounts, aliasContributionCounts, {config, recordCount});
      }
      totalDistance += best.distance;
      totalLuma += best.parts.luma;
      totalChroma += best.parts.chroma;
      totalHue += best.parts.hue;
      distances.push(best.distance);
      sampleCount += 1;
      if (second) {
        const gap = second.distance - best.distance;
        if (gap <= Math.max(DIAGNOSTIC.ambiguousAbsoluteGap, second.distance * DIAGNOSTIC.ambiguousRelativeGap)) {
          ambiguousCount += 1;
        }
      }
      if (!worst || best.distance > worst.distance) {
        worst = {
          x, y,
          distance: best.distance,
          parts: best.parts,
          lab,
          sourceHex: byteRgbToHex(imageData.data[px], imageData.data[px + 1], imageData.data[px + 2]),
          match: best
        };
      }
    }
  }

  distances.sort((a, b) => a - b);
  const meanDistance = sampleCount ? totalDistance / sampleCount : 0;
  const meanLuma = sampleCount ? totalLuma / sampleCount : 0;
  const meanChroma = sampleCount ? totalChroma / sampleCount : 0;
  const meanHue = sampleCount ? totalHue / sampleCount : 0;
  const p95Distance = distances.length
    ? distances[Math.min(distances.length - 1, Math.floor(distances.length * 0.95))]
    : 0;
  // Uniform baseline: a perfectly even palette contributes 1/N per swatch.
  // Under- and over-used flags are anchored to fractions of that baseline
  // so they stay meaningful regardless of palette size.
  const baseline = recordCount ? 1 / recordCount : 0;
  const underusedThreshold = baseline * DIAGNOSTIC.underusedBaselineFraction;
  const overusedThreshold = baseline * DIAGNOSTIC.overusedBaselineFraction;

  const usage = safeRecords.map((record, index) => {
    const contribution = contributionCounts[index] || 0;
    const aliasContribution = aliasContributionCounts[index] || 0;
    const territoryCount = territoryCounts[index] || 0;
    const aliasTerritoryCount = aliasTerritoryCounts[index] || 0;
    const percent = sampleCount ? contribution / sampleCount : 0;
    const territoryPercent = sampleCount ? territoryCount / sampleCount : 0;
    let load = "balanced";
    if (percent <= underusedThreshold) load = "underused";
    else if (percent >= overusedThreshold) load = "overused";
    return {
      index,
      record,
      hex: record.hex || labToHex(record.lab),
      contribution,
      aliasContribution,
      percent,
      aliasPercent: contribution ? aliasContribution / contribution : 0,
      territoryCount,
      aliasTerritoryCount,
      territoryPercent,
      aliasTerritoryPercent: territoryCount ? aliasTerritoryCount / territoryCount : 0,
      load
    };
  });

  // Normalized contribution entropy: 1.0 means usage is perfectly even, 0.0
  // means a single swatch dominates. Single principled scalar for "is the
  // palette being used as a palette?".
  let entropy = 0;
  for (const item of usage) {
    const p = item.percent;
    if (p > 0) entropy -= p * Math.log(p);
  }
  const coverageEntropy = recordCount > 1 ? entropy / Math.log(recordCount) : 1;

  return {
    sampleCount,
    step,
    meanDistance,
    meanLuma,
    meanChroma,
    meanHue,
    p95Distance,
    coverageEntropy,
    ambiguousCount,
    ambiguousPercent: sampleCount ? ambiguousCount / sampleCount : 0,
    baseline,
    underusedThreshold,
    overusedThreshold,
    worst,
    usage
  };
}


function sortedQuantile(sortedValues, q) {
  if (!sortedValues.length) return 0;
  const index = clamp(Math.round((sortedValues.length - 1) * q), 0, sortedValues.length - 1);
  return sortedValues[index];
}

function resolvedHistogramChannel(channel) {
  if (channel === "chroma" || channel === "hue") return channel;
  return "luma";
}

function channelDisplayName(channel) {
  if (channel === "chroma") return "chroma";
  if (channel === "hue") return "hue";
  return "luma";
}

function histogramKind(scope, channel) {
  const scopePrefix = scope === "output" ? "output" : "source";
  const channelName = channel === "chroma" ? "Chroma" : (channel === "hue" ? "Hue" : "Luma");
  return `${scopePrefix}${channelName}Detail`;
}

function suggestedHistogramDomainMax(values = [], channel = "luma") {
  const resolvedChannel = resolvedHistogramChannel(channel);
  if (resolvedChannel === "hue") return 360;
  if (resolvedChannel !== "chroma") return 100;
  const safeValues = Array.isArray(values)
    ? values.map(value => Math.max(0, Number(value) || 0)).sort((a, b) => a - b)
    : [];
  const p90Value = sortedQuantile(safeValues, 0.90);
  const p99Value = sortedQuantile(safeValues, 0.99);
  return Math.max(16, Math.ceil(Math.max(p90Value * 1.35, p99Value, 16) / 4) * 4);
}

function histogramSampleFromLab(lab) {
  const parts = labDistanceComponents(lab);
  const lightness = clamp(parts.lightness, 0, 100);
  const chroma = Math.max(0, parts.chroma || 0);
  const hue = hasReliableHue(lightness, chroma) ? paletteHue(lab) * 180 / Math.PI : null;
  return {lightness, chroma, hue, lab};
}

function withCachedImageSample(imageData, cacheKey, producer) {
  if (typeof imageData?.getCachedSample === "function") {
    return imageData.getCachedSample(cacheKey, producer);
  }
  return producer();
}

function sourceHistogramSampleCacheKey(imageData) {
  return [
    "source-histogram-samples-v1",
    imageData?.width || 0,
    imageData?.height || 0,
    imageData?.version ?? "",
    DIAGNOSTIC.targetSamples
  ].join(":");
}

function outputHistogramSampleCacheKey({imageData, records, entries, config}) {
  return `${diagnosticsSignature({imageData, records, entries, config, includeCycleOffset: false})}~output-histogram-samples-v1~${histogramConfigSignature(config)}`;
}

function collectSourceHistogramSamples(imageData) {
  if (!imageData?.width || !imageData.height) return null;
  return withCachedImageSample(imageData, sourceHistogramSampleCacheKey(imageData), () => {
    const data = imageData.data;
    if (!data) return null;
    const step = Math.max(1, Math.ceil(Math.sqrt((imageData.width * imageData.height) / DIAGNOSTIC.targetSamples)));
    const startX = Math.floor(step / 2);
    const startY = Math.floor(step / 2);
    const samples = [];

    for (let y = startY; y < imageData.height; y += step) {
      for (let x = startX; x < imageData.width; x += step) {
        const px = (y * imageData.width + x) * 4;
        if (data[px + 3] <= 4) continue;
        const sourceRgb = [data[px], data[px + 1], data[px + 2]];
        const lab = rgb8ToLab(sourceRgb[0], sourceRgb[1], sourceRgb[2]);
        samples.push({...histogramSampleFromLab(lab), x, y, sourceRgb});
      }
    }

    return {samples, step};
  });
}

function mappedPaletteLabForSample(sourceLab, sourceRgb, entries, records, config = {}) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  if (!safeEntries.length) return sourceLab;
  const matchLimit = config.assignMode === "blend"
    ? Math.min(Math.max(Math.round(Number(config.blendK) || 1), 1), DIAGNOSTIC.matchLimit)
    : 2;
  const matches = topPaletteMatches(sourceLab, safeEntries, {config, records, limit: matchLimit});
  const weights = assignmentWeights(matches, sourceLab, config);
  let mappedLab = [0, 0, 0];
  let totalWeight = 0;
  for (let i = 0; i < matches.length; i++) {
    const weight = weights[i];
    if (!(weight > 0)) continue;
    totalWeight += weight;
    mappedLab[0] += matches[i].renderLab[0] * weight;
    mappedLab[1] += matches[i].renderLab[1] * weight;
    mappedLab[2] += matches[i].renderLab[2] * weight;
  }
  if (totalWeight <= 0) return sourceLab;
  return mappedLab;
}

function outputHistogramSampleForSourceSample(sample, entries, records, config = {}) {
  const sourceLab = Array.isArray(sample?.lab) ? sample.lab : [sample.lightness || 0, 0, 0];
  const sourceRgb = Array.isArray(sample?.sourceRgb) ? sample.sourceRgb : [0, 0, 0];
  const mappedLab = mappedPaletteLabForSample(sourceLab, sourceRgb, entries, records, config);
  const fxLab = applyOutputModeCpu(sourceLab, mappedLab, config);
  const finalLab = finalOutputLabForLab(sourceRgb, fxLab, config.blendAmount);
  return {...histogramSampleFromLab(finalLab), x: sample.x, y: sample.y, sourceRgb};
}

export function computeHistogramFromSamples({samples = [], records = [], channel = "luma", scope = "source", step = 1, signature = "", now = () => Date.now(), domainMaxOverride = undefined} = {}) {
  const safeRecords = Array.isArray(records) ? records : [];
  const safeSamples = Array.isArray(samples) ? samples : [];
  const resolvedChannel = resolvedHistogramChannel(channel);
  const resolvedScope = scope === "output" ? "output" : "source";
  const binCount = resolvedChannel === "hue"
    ? 72
    : Math.max(12, Math.round(Number(DIAGNOSTIC.histogramBins) || 80));

  let sumL = 0;
  let sumC = 0;
  let sumHueX = 0;
  let sumHueY = 0;
  let maxC = 0;
  let neutralHueCount = 0;

  for (const sample of safeSamples) {
    const lightness = clamp(Number(sample?.lightness) || 0, 0, 100);
    const chroma = Math.max(0, Number(sample?.chroma) || 0);
    sumL += lightness;
    sumC += chroma;
    if (chroma > maxC) maxC = chroma;
    if (resolvedChannel === "hue" && sample?.hue === null) neutralHueCount += 1;
  }

  const channelSamples = resolvedChannel === "hue"
    ? safeSamples.filter(sample => sample?.hue !== null)
    : safeSamples;
  const values = channelSamples.map(sample => {
    if (resolvedChannel === "chroma") return Math.max(0, Number(sample?.chroma) || 0);
    if (resolvedChannel === "hue") return Number(sample?.hue) || 0;
    return clamp(Number(sample?.lightness) || 0, 0, 100);
  }).sort((a, b) => a - b);
  const sampleCount = values.length;
  const p10Value = sortedQuantile(values, 0.10);
  const medianValue = sortedQuantile(values, 0.50);
  const p90Value = sortedQuantile(values, 0.90);
  const p99Value = sortedQuantile(values, 0.99);
  const meanValue = sampleCount ? values.reduce((sum, value) => sum + value, 0) / sampleCount : 0;
  const domainMax = Number.isFinite(Number(domainMaxOverride)) && Number(domainMaxOverride) > 0
    ? Number(domainMaxOverride)
    : suggestedHistogramDomainMax(values, resolvedChannel);
  const bins = new Uint32Array(binCount);
  const segmentA = new Uint32Array(binCount);
  const segmentB = new Uint32Array(binCount);
  const segmentC = new Uint32Array(binCount);
  let max = 0;
  let overflowCount = 0;

  for (const sample of channelSamples) {
    const lightness = clamp(Number(sample?.lightness) || 0, 0, 100);
    const chroma = Math.max(0, Number(sample?.chroma) || 0);
    const value = resolvedChannel === "chroma" ? chroma : (resolvedChannel === "hue" ? Number(sample?.hue) || 0 : lightness);
    if (resolvedChannel === "chroma" && value > domainMax) overflowCount += 1;
    if (resolvedChannel === "hue") {
      const radians = (value / 360) * Math.PI * 2;
      sumHueX += Math.cos(radians);
      sumHueY += Math.sin(radians);
    }
    const normalized = domainMax > 0 ? clamp(value / domainMax, 0, 1) : 0;
    const bin = clamp(Math.floor(normalized * binCount), 0, binCount - 1);
    bins[bin] += 1;
    if (resolvedChannel === "chroma" || resolvedChannel === "hue") {
      if (lightness < 35) segmentA[bin] += 1;
      else if (lightness < 70) segmentB[bin] += 1;
      else segmentC[bin] += 1;
    } else {
      if (chroma < 4) segmentA[bin] += 1;
      else if (chroma < 10) segmentB[bin] += 1;
      else segmentC[bin] += 1;
    }
    if (bins[bin] > max) max = bins[bin];
  }

  let modeBin = 0;
  for (let i = 1; i < bins.length; i++) {
    if (bins[i] > bins[modeBin]) modeBin = i;
  }
  const modeValue = ((modeBin + 0.5) / binCount) * domainMax;
  const saturatedCount = safeSamples.reduce((sum, sample) => sum + ((Number(sample?.chroma) || 0) >= 10 ? 1 : 0), 0);
  const shadowCount = safeSamples.reduce((sum, sample) => sum + ((Number(sample?.lightness) || 0) < 35 ? 1 : 0), 0);
  const highlightCount = safeSamples.reduce((sum, sample) => sum + ((Number(sample?.lightness) || 0) >= 70 ? 1 : 0), 0);
  const segmentNames = resolvedChannel === "chroma" || resolvedChannel === "hue"
    ? ["shadow", "midtone", "highlight"]
    : ["neutral", "muted", "vivid"];
  const circularMean = sampleCount
    ? ((Math.atan2(sumHueY, sumHueX) * 180 / Math.PI) + 360) % 360
    : 0;

  return {
    signature,
    generatedAt: now(),
    records: safeRecords,
    histogram: {
      kind: histogramKind(resolvedScope, resolvedChannel),
      scope: resolvedScope,
      channel: resolvedChannel,
      label: `${resolvedScope} ${channelDisplayName(resolvedChannel)}`,
      axisLabel: resolvedChannel === "chroma" ? "C" : (resolvedChannel === "hue" ? "H°" : "L"),
      bins: Array.from(bins),
      segments: {
        [segmentNames[0]]: Array.from(segmentA),
        [segmentNames[1]]: Array.from(segmentB),
        [segmentNames[2]]: Array.from(segmentC)
      },
      segmentNames,
      binCount,
      max,
      total: sampleCount,
      step,
      domain: {min: 0, max: domainMax},
      overflowCount,
      omittedLowChromaCount: resolvedChannel === "hue" ? neutralHueCount : 0,
      lowChromaThreshold: resolvedChannel === "hue" ? NEUTRAL_CHROMA_EPSILON : undefined,
      stats: {
        p10: p10Value,
        median: medianValue,
        p90: p90Value,
        p99: p99Value,
        mean: resolvedChannel === "hue" ? circularMean : meanValue,
        linearMean: meanValue,
        mode: modeValue,
        max: resolvedChannel === "chroma" ? maxC : (values[values.length - 1] || 0),
        meanLightness: safeSamples.length ? sumL / safeSamples.length : 0,
        meanChroma: safeSamples.length ? sumC / safeSamples.length : 0,
        saturatedPercent: safeSamples.length ? saturatedCount / safeSamples.length : 0,
        shadowPercent: safeSamples.length ? shadowCount / safeSamples.length : 0,
        highlightPercent: safeSamples.length ? highlightCount / safeSamples.length : 0
      }
    }
  };
}

export function computeImageHistogramDiagnostics({imageData, samples = null, records = [], channel = "luma", scope = "source", step = undefined, signature = "", now = () => Date.now()} = {}) {
  const collected = Array.isArray(samples) ? {samples, step: Math.max(1, Math.round(Number(step) || 1))} : collectSourceHistogramSamples(imageData);
  if (!collected) return null;
  return computeHistogramFromSamples({
    samples: collected.samples,
    records,
    channel,
    scope,
    step: collected.step,
    signature,
    now
  });
}

export function computeSourceHistogramDiagnostics(options = {}) {
  return computeImageHistogramDiagnostics({...options, scope: "source"});
}

function collectOutputHistogramSamples({imageData, records = [], entries = [], config = {}} = {}) {
  const collected = collectSourceHistogramSamples(imageData);
  if (!collected) return null;
  return withCachedImageSample(imageData, outputHistogramSampleCacheKey({imageData, records, entries, config}), () => ({
    samples: collected.samples.map(sample => outputHistogramSampleForSourceSample(sample, entries, records, config)),
    step: collected.step
  }));
}

export function computeOutputHistogramDiagnostics({imageData, records = [], entries = [], config = {}, channel = "luma", signature = "", now = () => Date.now()} = {}) {
  const collected = collectOutputHistogramSamples({imageData, records, entries, config});
  if (!collected) return null;
  return computeHistogramFromSamples({
    samples: collected.samples,
    records,
    channel,
    scope: "output",
    step: collected.step,
    signature,
    now
  });
}

export function computePairedHistogramDiagnostics({imageData, records = [], entries = [], config = {}, channel = "luma", sourceSignature = "", outputSignature = "", now = () => Date.now()} = {}) {
  const collected = collectSourceHistogramSamples(imageData);
  if (!collected) return {source: null, output: null};
  const resolvedChannel = resolvedHistogramChannel(channel);
  const outputCollected = collectOutputHistogramSamples({imageData, records, entries, config});
  const outputSamples = outputCollected?.samples || [];
  const domainMaxOverride = resolvedChannel === "chroma"
    ? Math.max(
      suggestedHistogramDomainMax(collected.samples.map(sample => sample?.chroma), resolvedChannel),
      suggestedHistogramDomainMax(outputSamples.map(sample => sample?.chroma), resolvedChannel)
    )
    : undefined;
  return {
    source: computeHistogramFromSamples({
      samples: collected.samples,
      records,
      channel: resolvedChannel,
      scope: "source",
      step: collected.step,
      signature: sourceSignature,
      now,
      domainMaxOverride
    }),
    output: computeHistogramFromSamples({
      samples: outputSamples,
      records,
      channel: resolvedChannel,
      scope: "output",
      step: collected.step,
      signature: outputSignature,
      now,
      domainMaxOverride
    })
  };
}

export function computePaletteCollisions(records, config = {}) {
  // Threshold is anchored to the user's minDistance preference but bounded
  // by absolute OKLab-scaled units so the "too close" judgement stays
  // principled at slider extremes.
  const safeRecords = Array.isArray(records) ? records : [];
  const minDistance = Number(config.minDistance) || 18;
  const threshold = clamp(
    minDistance * DIAGNOSTIC.collisionAnchorFraction,
    DIAGNOSTIC.collisionAnchorMin,
    DIAGNOSTIC.collisionAnchorMax
  );
  let closest = null;
  let closeCount = 0;
  for (let i = 0; i < safeRecords.length; i++) {
    for (let j = i + 1; j < safeRecords.length; j++) {
      const aParts = recordDistanceComponents(safeRecords[i]);
      const bParts = recordDistanceComponents(safeRecords[j]);
      const parts = cpuDistanceBreakdown(
        aParts.lightness,
        aParts.chroma,
        aParts.scaledHue,
        bParts.lightness,
        bParts.chroma,
        bParts.scaledHue,
        config
      );
      const pair = {i, j, distance: parts.total, a: safeRecords[i], b: safeRecords[j]};
      if (!closest || pair.distance < closest.distance) closest = pair;
      if (pair.distance <= threshold) closeCount += 1;
    }
  }
  return {threshold, closest, closeCount};
}

/**
 * @param {{imageData?: ImageDataSource|null, records?: PaletteRecord[], entries?: PaletteUniformEntry[], config?: AppConfig|Object, includeCycleOffset?: boolean, now?: () => number}} [options]
 * @returns {PaletteDiagnostics|null}
 */
export function computeDiagnostics({imageData, records = [], entries = [], config = {}, includeCycleOffset = false, now = () => Date.now()} = {}) {
  if (!imageData || !records.length || !entries.length) return null;
  const sample = sampleImageDiagnostics(imageData, entries, records, config);
  const collisions = computePaletteCollisions(records, config);
  const signature = diagnosticsSignature({imageData, records, entries, config, includeCycleOffset});
  return {signature, records, entries, sample, collisions, generatedAt: now()};
}

function histogramConfigSignature(config = {}) {
  return Object.keys(config || {})
    .sort()
    .map(key => {
      const value = config[key];
      if (value === null || value === undefined) return `${key}:`;
      if (["string", "number", "boolean"].includes(typeof value)) return `${key}:${value}`;
      if (Array.isArray(value)) return `${key}:${value.join(",")}`;
      return "";
    })
    .filter(Boolean)
    .join("|");
}

export function createDiagnosticMetrics({getConfig, getImageData, getRecords, getEntries, includeCycleOffset = () => false, now = () => Date.now()} = {}) {
  const config = () => getConfig?.() || {};
  const imageData = () => getImageData?.() || null;
  const records = fallback => fallback === undefined ? (getRecords?.() ?? []) : fallback;
  const entriesFor = inputRecords => getEntries?.(inputRecords) ?? [];
  const histogramPairCache = new Map();

  function histogramBaseSignature({inputRecords, entries, scope, safeConfig}) {
    return `${diagnosticsSignature({
      imageData: imageData(),
      records: inputRecords,
      entries,
      config: safeConfig,
      includeCycleOffset: includeCycleOffset()
    })}~${scope}-histogram-v4-cpu~${histogramConfigSignature(safeConfig)}`;
  }

  function pairedHistogramFor({inputRecords, entries, channel, safeConfig}) {
    const resolvedChannel = resolvedHistogramChannel(channel);
    const sourceBaseSignature = histogramBaseSignature({inputRecords, entries, scope: "source", safeConfig});
    const outputBaseSignature = histogramBaseSignature({inputRecords, entries, scope: "output", safeConfig});
    const sourceSignature = `${sourceBaseSignature}~${resolvedChannel}`;
    const outputSignature = `${outputBaseSignature}~${resolvedChannel}`;
    const cacheKey = `${sourceSignature}::${outputSignature}`;
    if (!histogramPairCache.has(cacheKey)) {
      histogramPairCache.clear();
      histogramPairCache.set(cacheKey, computePairedHistogramDiagnostics({
        imageData: imageData(),
        records: inputRecords,
        entries,
        config: safeConfig,
        channel: resolvedChannel,
        sourceSignature,
        outputSignature,
        now
      }));
    }
    return histogramPairCache.get(cacheKey) || {source: null, output: null};
  }

  return {
    topPaletteMatches: (lab, entries, limit = DIAGNOSTIC.matchLimit) => topPaletteMatches(lab, entries, {config: config(), records: records(), limit}),
    diagnosticsSignature: (inputRecords = records(), entries = entriesFor(inputRecords)) => diagnosticsSignature({
      imageData: imageData(),
      records: inputRecords,
      entries,
      config: config(),
      includeCycleOffset: includeCycleOffset()
    }),
    assignmentWeights: (matches, lab) => assignmentWeights(matches, lab, config()),
    computeDiagnostics: (inputRecords = records()) => {
      const safeRecords = Array.isArray(inputRecords) ? inputRecords : [];
      const entries = entriesFor(safeRecords);
      return computeDiagnostics({
        imageData: imageData(),
        records: safeRecords,
        entries,
        config: config(),
        includeCycleOffset: includeCycleOffset(),
        now
      });
    },
    sourceHistogramSignature: (inputRecords = records(), entries = entriesFor(inputRecords), channel = "luma") => {
      const safeConfig = config();
      return `${histogramBaseSignature({inputRecords, entries, scope: "source", safeConfig})}~${resolvedHistogramChannel(channel)}`;
    },
    outputHistogramSignature: (inputRecords = records(), entries = entriesFor(inputRecords), channel = "luma") => {
      const safeConfig = config();
      return `${histogramBaseSignature({inputRecords, entries, scope: "output", safeConfig})}~${resolvedHistogramChannel(channel)}`;
    },
    computeSourceHistogramDiagnostics: (inputRecords = records(), channel = "luma") => {
      const safeRecords = Array.isArray(inputRecords) ? inputRecords : [];
      const entries = entriesFor(safeRecords);
      const safeConfig = config();
      return pairedHistogramFor({inputRecords: safeRecords, entries, channel, safeConfig}).source;
    },
    computeOutputHistogramDiagnostics: (inputRecords = records(), channel = "luma") => {
      const safeRecords = Array.isArray(inputRecords) ? inputRecords : [];
      const entries = entriesFor(safeRecords);
      const safeConfig = config();
      return pairedHistogramFor({inputRecords: safeRecords, entries, channel, safeConfig}).output;
    }
  };
}
