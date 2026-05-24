import {
  CANDIDATE_SAMPLE_COUNT,
  COSINE_PALETTE_PRESETS,
  HARMONY_REGION_CONTRASTS,
  HARMONY_RELATIONSHIPS,
  NEUTRAL_CHROMA_EPSILON,
  OKLCH_PROCEDURAL_CHROMA_MAX,
  TAU
} from "../constants.js";
import {
  clamp,
  clamp01,
  expandSwatchVariants,
  fitLabToSrgb,
  hexToLab,
  labToOklch,
  makePaletteRecord,
  normalizeHexColor,
  oklchToLab,
  paletteLabs,
  sortPaletteRecords
} from "../color-utils.js";
import { DEFAULT_COSINE_CUSTOM_VECTORS, normalizeCosineCustomVectors } from "../state/config.js";
import { buildPatchOrigins, paletteSampleCacheKey, samplePaletteLabs } from "./sampling.js";
import { selectTopNScoredSwatches } from "./selection.js";

/** @typedef {import("../types.d.ts").AppConfig} AppConfig */
/** @typedef {import("../types.d.ts").GeneratedLock} GeneratedLock */
/** @typedef {import("../types.d.ts").HexColor} HexColor */
/** @typedef {import("../types.d.ts").ImageDataSource} ImageDataSource */
/** @typedef {import("../types.d.ts").Lab} Lab */
/** @typedef {import("../types.d.ts").ManualSwatch} ManualSwatch */
/** @typedef {import("../types.d.ts").PaletteRecord} PaletteRecord */
/** @typedef {import("../types.d.ts").PaletteMode} PaletteMode */
/** @typedef {import("../types.d.ts").PaletteSelectionTrace} PaletteSelectionTrace */

const DEFAULT_HARMONY_RELATIONSHIP = "monochrome";
const DEFAULT_HARMONY_REGION_CONTRAST = "triadicRegions";
const DEFAULT_COSINE_PRESET = "sinebow";

const FAMILY_VARIANTS = [
  {variant: "base", lightnessDirection: 0},
  {variant: "tint", lightnessDirection: 1},
  {variant: "shade", lightnessDirection: -1}
];

export function generatedFamilyCount(config) {
  const requestedSize = Math.max(3, Math.min(42, Math.round(config.paletteSize / 3) * 3));
  return Math.max(1, Math.round(requestedSize / 3));
}

export function imagePaletteUsesTintShadeFamilies(config) {
  return config?.generatedTintShadeFamilies !== false;
}

export function requestedGeneratedImagePaletteSize(config) {
  const rawSize = Math.max(2, Math.min(42, Math.round(Number(config?.paletteSize) || 2)));
  return imagePaletteUsesTintShadeFamilies(config)
    ? Math.max(3, Math.round(rawSize / 3) * 3)
    : rawSize;
}

export function generatedImageSelectionCount(config) {
  const requestedSize = requestedGeneratedImagePaletteSize(config);
  return imagePaletteUsesTintShadeFamilies(config)
    ? Math.max(1, Math.round(requestedSize / 3))
    : requestedSize;
}

/**
 * @param {GeneratedLock|HexColor|string|null|undefined} entry
 * @param {number} [index]
 * @returns {GeneratedLock|null}
 */
export function normalizeGeneratedLockEntry(entry, index = 0) {
  if (!entry) return null;
  if (typeof entry === "string") {
    const hex = normalizeHexColor(entry, "");
    return hex ? {id: `lock-${index}-${hex.slice(1)}`, hex, lab: hexToLab(hex), colorSpace: "oklab-scaled"} : null;
  }
  const hex = normalizeHexColor(entry.hex ?? entry.color ?? "", "");
  if (!hex) return null;
  const lab = entry.colorSpace === "oklab-scaled" && Array.isArray(entry.lab) && entry.lab.length >= 3
    ? [Number(entry.lab[0]), Number(entry.lab[1]), Number(entry.lab[2])]
    : hexToLab(hex);
  if (!lab.every(Number.isFinite)) return null;
  return {
    id: String(entry.id ?? `lock-${index}-${hex.slice(1)}`),
    hex,
    lab,
    colorSpace: "oklab-scaled"
  };
}

function generatedLockLab(entry) {
  return Array.isArray(entry?.lab) && entry.lab.length >= 3 ? [...entry.lab] : hexToLab(entry.hex);
}

export function syncGeneratedLocks(config) {
  const raw = Array.isArray(config.generatedLocks) ? config.generatedLocks : [];
  const seen = new Set();
  const normalized = [];
  raw.forEach((entry, index) => {
    const safe = normalizeGeneratedLockEntry(entry, index);
    if (!safe || seen.has(safe.hex)) return;
    seen.add(safe.hex);
    normalized.push(safe);
  });
  config.generatedLocks = normalized;
  return normalized;
}

export function activeGeneratedLocks(config, baseCount = generatedFamilyCount(config)) {
  return syncGeneratedLocks(config).slice(0, Math.max(0, baseCount));
}

function harmonyRegionContrastForConfig(config) {
  const key = config?.harmonyRegionContrast ?? DEFAULT_HARMONY_REGION_CONTRAST;
  return HARMONY_REGION_CONTRASTS[key] ?? HARMONY_REGION_CONTRASTS[DEFAULT_HARMONY_REGION_CONTRAST];
}

function regionContrastFamilyVariants(seedLab, config) {
  if ((config?.harmonyRegionContrast ?? DEFAULT_HARMONY_REGION_CONTRAST) === DEFAULT_HARMONY_REGION_CONTRAST) {
    return expandSwatchVariants(seedLab, config.deltaL, 1);
  }
  const mode = harmonyRegionContrastForConfig(config);
  const [seedL, seedC, seedH] = labToOklch(seedLab);
  return FAMILY_VARIANTS.map(({variant, lightnessDirection}) => {
    const L = clamp(seedL + config.deltaL * lightnessDirection, 0, 100);
    const offset = Number(mode.offsets?.[variant]) || 0;
    const chromaScale = Number(mode.chromaScale?.[variant] ?? 1) || 1;
    const chromaBias = Number(mode.chromaBias?.[variant]) || 0;
    const C = clamp(seedC * chromaScale + chromaBias, 0, OKLCH_PROCEDURAL_CHROMA_MAX);
    return fitLabToSrgb(oklchToLab([L, C, seedH + offset * Math.PI / 180]));
  });
}

function buildFamilyRecords(seedLab, familyIndex, config, source = "generated", sourceIndex = familyIndex, options = {}) {
  const variants = typeof options.variantBuilder === "function"
    ? options.variantBuilder(seedLab, config)
    : expandSwatchVariants(seedLab, config.deltaL, 1);
  const familyId = options.familyId ?? `${source}-${familyIndex}`;
  return variants.map((lab, variantIndex) => makePaletteRecord({
    lab,
    source,
    familyId,
    familyIndex,
    variant: FAMILY_VARIANTS[variantIndex]?.variant ?? "variant",
    variantIndex,
    sourceIndex,
    seedLab,
    sourceLab: seedLab,
    locked: options.locked ?? false,
    lockId: options.lockId ?? null,
    role: options.role ?? "family-member"
  }));
}

function positiveFraction(value) {
  const n = Number(value) || 0;
  return n - Math.floor(n);
}

function harmonyRampSteepnessForConfig(config) {
  const value = Number(config?.harmonyRampSteepness);
  return clamp(Number.isFinite(value) ? value : 1, 0, 2.5);
}

function harmonyLightnessRampOffset(familyIndex, familyCount, relationship, config, rampSteepness) {
  if (familyCount <= 1 || rampSteepness <= 0) return 0;
  const baseGroupCount = Math.max(1, relationship.offsets.length);
  if (baseGroupCount === 1) {
    const monoT = (familyIndex / (familyCount - 1)) - 0.5;
    return monoT * config.deltaL * 1.4 * rampSteepness;
  }
  if (familyIndex === 0) return 0;
  const direction = familyIndex % 2 === 1 ? 1 : -1;
  const magnitude = Math.ceil(familyIndex / 2);
  const perFamilyStep = 3 / baseGroupCount;
  return direction * magnitude * perFamilyStep * rampSteepness;
}

function relationshipOffsetsForCount(relationshipKey, count, seed = 0) {
  const relationship = HARMONY_RELATIONSHIPS[relationshipKey] ?? HARMONY_RELATIONSHIPS[DEFAULT_HARMONY_RELATIONSHIP];
  const baseOffsets = relationship.offsets.length ? relationship.offsets : [0];
  const spread = Number(relationship.spread) || 0;
  const out = [];
  for (let i = 0; i < count; i++) {
    const groupIndex = i % baseOffsets.length;
    const ring = Math.floor(i / baseOffsets.length);
    const side = ring % 2 === 0 ? -1 : 1;
    const step = Math.ceil(ring / 2);
    const seedNudge = ((seed % 17) - 8) * 4;
    const clusterOffset = ring === 0 ? 0 : side * step * spread + seedNudge;
    out.push(baseOffsets[groupIndex] + clusterOffset);
  }
  return out;
}

export function createHarmonyPalette(config) {
  const baseLab = hexToLab(config.seedSwatch);
  const [baseL, baseC, baseH] = labToOklch(baseLab);
  const relationship = HARMONY_RELATIONSHIPS[config.harmonyRelationship] ?? HARMONY_RELATIONSHIPS[DEFAULT_HARMONY_RELATIONSHIP];
  const familyCount = generatedFamilyCount(config);
  const offsets = relationshipOffsetsForCount(config.harmonyRelationship, familyCount, config.seed);
  const usableC = Math.max(baseC, baseC < NEUTRAL_CHROMA_EPSILON ? 24 : baseC);
  const rampSteepness = harmonyRampSteepnessForConfig(config);
  const records = offsets.flatMap((offset, familyIndex) => {
    const baseGroupCount = Math.max(1, relationship.offsets.length);
    const ring = Math.floor(familyIndex / baseGroupCount);
    const monoT = familyCount <= 1 ? 0 : (familyIndex / (familyCount - 1)) - 0.5;
    const lightnessOffset = harmonyLightnessRampOffset(familyIndex, familyCount, relationship, config, rampSteepness);
    const seedL = clamp(baseL + lightnessOffset, 4, 96);
    const seedC = relationship.offsets.length === 1
      ? clamp(usableC * (1 + monoT * 0.55), 0, OKLCH_PROCEDURAL_CHROMA_MAX)
      : clamp(usableC * Math.max(0.55, 1 - ring * 0.08), 0, OKLCH_PROCEDURAL_CHROMA_MAX);
    const hue = baseH + offset * Math.PI / 180;
    const seedLab = fitLabToSrgb(oklchToLab([seedL, seedC, hue]));
    return buildFamilyRecords(seedLab, familyIndex, config, "harmony", familyIndex, {
      familyId: `harmony-${config.harmonyRelationship}-${familyIndex}`,
      variantBuilder: regionContrastFamilyVariants,
      role: "harmony-family-member"
    });
  });
  return sortPaletteRecords(records, config.sortMode);
}

function cosinePresetVector(key) {
  return COSINE_PALETTE_PRESETS[key] ?? COSINE_PALETTE_PRESETS[DEFAULT_COSINE_PRESET];
}

function cosineVectorConfig(config) {
  return config.cosinePreset === "custom"
    ? normalizeCosineCustomVectors(config.cosineCustomVectors ?? DEFAULT_COSINE_CUSTOM_VECTORS)
    : cosinePresetVector(config.cosinePreset);
}

function cosineChannel(preset, channel, t, phaseOffset = 0) {
  const a = Number(preset.a[channel]) || 0;
  const b = Number(preset.b[channel]) || 0;
  const c = Number(preset.c[channel]) || 1;
  const d = Number(preset.d[channel]) || 0;
  return a + b * Math.cos(TAU * (c * t + d + phaseOffset));
}

const COSINE_SEED_PERIOD = 500;
const COSINE_SEED_CYCLES = 1;

function cosineSeedPhase(seed) {
  const safeSeed = Math.max(1, Math.min(COSINE_SEED_PERIOD, Math.round(Number(seed) || 1)));
  return ((safeSeed - 1) / COSINE_SEED_PERIOD) * COSINE_SEED_CYCLES;
}

export function createCosinePalette(config) {
  const preset = cosineVectorConfig(config);
  const familyCount = generatedFamilyCount(config);
  const seedPhase = cosineSeedPhase(config.seed);
  const records = [];

  for (let familyIndex = 0; familyIndex < familyCount; familyIndex++) {
    const t = familyCount <= 1 ? 0 : familyIndex / familyCount;

    const L = clamp(
      cosineChannel(preset, 0, t, seedPhase) * 100,
      6,
      94
    );
    const C = clamp(
      cosineChannel(preset, 1, t, seedPhase) * OKLCH_PROCEDURAL_CHROMA_MAX,
      0,
      OKLCH_PROCEDURAL_CHROMA_MAX
    );
    const h = TAU * positiveFraction(
      cosineChannel(preset, 2, t, seedPhase)
    );
    const seedLab = fitLabToSrgb(oklchToLab([L, C, h]));

    records.push(...buildFamilyRecords(seedLab, familyIndex, config, "cosine", familyIndex, {
      familyId: `cosine-${config.cosinePreset === "custom" ? "custom" : config.cosinePreset}-${familyIndex}`,
      role: "cosine-family-member"
    }));
  }

  return sortPaletteRecords(records, config.sortMode);
}

export function createPresetPalette(config, colors, size) {
  const records = colors.slice(0, size).map((color, sourceIndex) => makePaletteRecord({
    lab: hexToLab(color),
    source: "preset",
    familyId: `preset-${config.presetName}-${sourceIndex}`,
    familyIndex: sourceIndex,
    variant: "single",
    variantIndex: 0,
    sourceIndex,
    role: "preset-swatch"
  }));
  return sortPaletteRecords(records, config.sortMode);
}

function fallbackManualRecords(swatches, sortMode) {
  return sortPaletteRecords(swatches.map((swatch, sourceIndex) => makePaletteRecord({
    lab: hexToLab(swatch.hex),
    source: "fallback-manual",
    familyId: `fallback-${sourceIndex}`,
    familyIndex: sourceIndex,
    variant: "single",
    variantIndex: 0,
    sourceIndex,
    role: "fallback-swatch"
  })), sortMode);
}

/**
 * @param {Object} options
 * @param {AppConfig} options.config
 * @param {PaletteMode} options.mode
 * @param {ImageDataSource|null} options.imageData
 * @param {import("../types.d.ts").Rect|null} [options.sampleRegion]
 * @param {string} [options.sourceKey]
 * @param {string} [options.sourceLabel]
 * @param {ManualSwatch[]} [options.fallbackSwatches]
 * @param {boolean} [options.captureTrace]
 * @returns {{records: PaletteRecord[], trace: PaletteSelectionTrace|null}}
 */
export function createGeneratedPalette({
  config,
  mode,
  imageData,
  sampleRegion = null,
  sourceKey = "generated",
  sourceLabel = "image",
  fallbackSwatches = [],
  captureTrace = false
}) {
  if (!imageData) {
    return {
      records: fallbackManualRecords(fallbackSwatches, config.sortMode),
      trace: null
    };
  }

  const tintShadeFamilies = imagePaletteUsesTintShadeFamilies(config);
  const requestedSize = requestedGeneratedImagePaletteSize(config);
  const selectionCount = generatedImageSelectionCount(config);
  const lockedEntries = activeGeneratedLocks(config, selectionCount);
  const lockedSeeds = lockedEntries.map(entry => ({
    entry,
    seedLab: generatedLockLab(entry)
  }));
  const origins = buildPatchOrigins(CANDIDATE_SAMPLE_COUNT, imageData.width, imageData.height, config.seed, config.samplingMode, sampleRegion);
  const candidates = samplePaletteLabs(imageData, imageData.width, imageData.height, origins, config.blockSize, paletteSampleCacheKey({
    sampleCount: CANDIDATE_SAMPLE_COUNT,
    width: imageData.width,
    height: imageData.height,
    seed: config.seed,
    samplingMode: config.samplingMode,
    region: sampleRegion,
    blockSize: config.blockSize
  }));
  const weights = {
    midtone: config.selectWeights[0],
    outlier: config.selectWeights[1],
    chroma: config.selectWeights[2]
  };
  const selectionTrace = [];
  const selected = selectTopNScoredSwatches(candidates, weights, selectionCount, config.minDistance, config.seed, {
    deltaL: config.deltaL,
    chromaExp: 1,
    familySpacing: tintShadeFamilies,
    hueSpread: config.hueSpread,
    directColorTargets: !tintShadeFamilies,
    initialSelected: lockedSeeds.map(lock => lock.seedLab),
    trace: captureTrace ? selectionTrace : null
  });

  const traceRoot = captureTrace ? selectionTrace[0] || null : null;
  const trace = traceRoot ? {
    ...traceRoot,
    mode,
    sourceLabel,
    requestedSize,
    selectionCount,
    tintShadeFamilies,
    finalPaletteSize: requestedSize,
    sample: {
      count: candidates.length,
      blockSize: config.blockSize,
      samplingMode: config.samplingMode,
      region: sampleRegion ? {...sampleRegion} : null
    }
  } : null;

  const slots = selected.map((seedLab, familyIndex) => {
    const lockedSeed = lockedSeeds[familyIndex] ?? null;
    return {
      seedLab,
      familyIndex,
      locked: !!lockedSeed,
      lockId: lockedSeed?.entry.id ?? null
    };
  });

  const records = tintShadeFamilies
    ? slots.flatMap(slot => buildFamilyRecords(slot.seedLab, slot.familyIndex, config, sourceKey, slot.familyIndex, {
      familyId: slot.locked ? `${sourceKey}-lock-${slot.lockId}` : `${sourceKey}-${slot.familyIndex}`,
      locked: slot.locked,
      lockId: slot.lockId,
      role: slot.locked ? "locked-family" : (sourceKey === "reference" ? "reference-family-member" : "family-member")
    }))
    : slots.map(slot => makePaletteRecord({
      lab: slot.seedLab,
      source: sourceKey,
      familyId: slot.locked ? `${sourceKey}-lock-${slot.lockId}` : `${sourceKey}-${slot.familyIndex}`,
      familyIndex: slot.familyIndex,
      variant: "single",
      variantIndex: 0,
      sourceIndex: slot.familyIndex,
      seedLab: slot.seedLab,
      sourceLab: slot.seedLab,
      locked: slot.locked,
      lockId: slot.lockId,
      role: slot.locked ? "locked-color" : (sourceKey === "reference" ? "reference-color" : "generated-color")
    }));
  return {
    records: sortPaletteRecords(records, config.sortMode),
    trace
  };
}

function mixLab(a, b, amount) {
  return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount];
}

export function resampleLabPalette(palette, size) {
  if (!palette.length || size <= 0) return [];
  if (palette.length === size) return palette.map(p => [...p]);
  if (size === 1) return [palette[0]];
  const out = [];
  const maxSource = palette.length - 1;
  for (let i = 0; i < size; i++) {
    const sourceIndex = Math.round((i / (size - 1)) * maxSource);
    out.push([...palette[sourceIndex]]);
  }
  return out;
}

export function createManualPalette({
  config,
  swatches,
  manualSwatchLab,
  assistRecords = null,
  imageDataAvailable = false
}) {
  let labs = swatches.map(swatch => manualSwatchLab(swatch)).slice(0, 42);
  const sourceLabs = labs.map(lab => [...lab]);
  const assist = clamp01(config.generatedAssist / 100);
  if (assist > 0 && imageDataAvailable && Array.isArray(assistRecords)) {
    const generated = resampleLabPalette(paletteLabs(assistRecords), labs.length);
    labs = labs.map((lab, i) => mixLab(lab, generated[i], assist));
  }
  const records = labs.map((lab, sourceIndex) => {
    const swatch = swatches[sourceIndex];
    return makePaletteRecord({
      lab,
      source: "manual",
      familyId: swatch.id,
      familyIndex: sourceIndex,
      variant: "single",
      variantIndex: 0,
      sourceIndex,
      swatchId: swatch.id,
      sourceLab: sourceLabs[sourceIndex],
      muted: !!swatch.muted,
      role: assist > 0 && imageDataAvailable ? "manual-assisted-swatch" : "manual-swatch"
    });
  });
  return sortPaletteRecords(records, config.sortMode);
}
