import { MAX_PALETTE_SIZE, NEUTRAL_CHROMA_EPSILON } from "../constants.js";
import {
  byteRgbToHex,
  clamp,
  clamp01,
  labDistanceComponents,
  labToHex,
  rgb8ToLab
} from "../color-utils.js";

// All tunable diagnostic thresholds live here so the sampler, renderers, and
// pixel inspector agree on what counts as underused, overused, ambiguous,
// or colliding. Anything that was previously a magic number elsewhere in
// the diagnostics module should be sourced from this block.
export const DIAGNOSTIC = {
  // Stratified-grid sample budget for the image audit.
  targetSamples: 5200,
  // Top-k matches retained per pixel; bounded by blendK for blend mode.
  matchLimit: 5,
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

function entryFeatureDistanceComponents(entry) {
  if (Number.isFinite(Number(entry?.featureLightness)) && Number.isFinite(Number(entry?.featureChroma)) && Array.isArray(entry?.featureHue)) {
    return {
      lightness: Number(entry.featureLightness),
      chroma: Math.max(0, Number(entry.featureChroma) || 0),
      scaledHue: safeScaledHue(entry.featureHue)
    };
  }
  if (!entry?.alias && entry?.sourceRecord && entry.featureLab === entry.sourceRecord.lab) {
    return recordDistanceComponents(entry.sourceRecord);
  }
  return labDistanceComponents(entry?.featureLab);
}

export function cpuDistanceBreakdown(labLightness, labChroma, labHue, featureLightness, featureChroma, featureHue, config = {}) {
  const dL = labLightness - featureLightness;
  const dC = labChroma - featureChroma;

  // Hue is undefined for neutral / near-neutral colors. By contract callers
  // pass already-normalized hue vectors, and this function does not inspect
  // those vectors unless both chroma values are meaningful. That keeps neutral
  // colors from inventing a fake hue and keeps the hot path free of duplicate
  // hue normalization work.
  const hueSuppressed = labChroma < NEUTRAL_CHROMA_EPSILON || featureChroma < NEUTRAL_CHROMA_EPSILON;
  let hueBias = 0;
  if (!hueSuppressed) {
    const theta = clamp(labHue[0] * featureHue[0] + labHue[1] * featureHue[1], -1, 1);
    hueBias = 0.5 * (labChroma + featureChroma) * (1 - theta);
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

export function topPaletteMatches(lab, entries, {config = {}, records = [], limit = DIAGNOSTIC.matchLimit, maxPaletteSize = MAX_PALETTE_SIZE} = {}) {
  const matches = [];
  const safeEntries = Array.isArray(entries) ? entries : [];
  const safeRecords = Array.isArray(records) ? records : [];
  const labParts = labDistanceComponents(lab);
  for (let i = 0; i < safeEntries.length; i++) {
    const entry = safeEntries[i];
    const featureParts = entryFeatureDistanceComponents(entry);
    const parts = cpuDistanceBreakdown(
      labParts.lightness,
      labParts.chroma,
      labParts.scaledHue,
      featureParts.lightness,
      featureParts.chroma,
      featureParts.scaledHue,
      config
    );
    const record = entry.sourceRecord || safeRecords[i] || null;
    const displayIndex = Number.isInteger(record?.displayIndex) ? record.displayIndex : Math.min(i, maxPaletteSize - 1);
    matches.push({
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
    });
  }
  matches.sort((a, b) => a.distance - b.distance || a.displayIndex - b.displayIndex || a.entryIndex - b.entryIndex);
  return matches.slice(0, Math.max(1, limit));
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
    Number(config.lumaWeight).toFixed(3),
    Number(config.chromaWeight).toFixed(3),
    Number(config.hueWeight).toFixed(3),
    config.paletteMode,
    config.assignMode,
    config.outputMode,
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
    return weights;
  }

  if (config.assignMode === "dither") {
    const share = ditherSecondShare(safeMatches[0], safeMatches[1] || null, lab[0], config);
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

export function computeDiagnostics({imageData, records = [], entries = [], config = {}, includeCycleOffset = false, now = () => Date.now()} = {}) {
  if (!imageData || !records.length || !entries.length) return null;
  const sample = sampleImageDiagnostics(imageData, entries, records, config);
  const collisions = computePaletteCollisions(records, config);
  const signature = diagnosticsSignature({imageData, records, entries, config, includeCycleOffset});
  return {signature, records, entries, sample, collisions, generatedAt: now()};
}

export function createDiagnosticMetrics({getConfig, getImageData, getRecords, getEntries, includeCycleOffset = () => false, now = () => Date.now()} = {}) {
  const config = () => getConfig?.() || {};
  const imageData = () => getImageData?.() || null;
  const records = fallback => fallback === undefined ? (getRecords?.() ?? []) : fallback;
  const entriesFor = inputRecords => getEntries?.(inputRecords) ?? [];

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
    }
  };
}
