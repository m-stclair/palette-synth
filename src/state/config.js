import {
  DEFAULT_HUE_SPREAD_BONUS,
  HARMONY_REGION_CONTRASTS,
  HARMONY_RELATIONSHIPS,
  COSINE_PALETTE_PRESETS,
  PALETTE_PRESETS
} from "../constants.js";
import {
  clamp,
  clamp01,
  normalizeHexColor,
  normalizeOptionalHexColor,
  normalizeManualLab,
  hexToLab,
  labToHex
} from "../color-utils.js";
import { manualCycleKeyForId, uniqueManualSwatchId } from "../manual/ids.js";

export const DEFAULT_COSINE_CUSTOM_VECTORS = {
  a: [0.58, 0.62, 0.50],
  b: [0.22, 0.24, 0.50],
  c: [1.00, 1.00, 1.00],
  d: [0.00, 0.33, 0.67]
};

export const COSINE_VECTOR_KEYS = ["a", "b", "c", "d"];
export const PALETTE_SWATCH_SCALES = [1, 2, 3];

export function isPixelArtEnabled(config = {}) {
  return config?.pixelArtEnabled === true;
}

export function effectivePixelBlockSize(config = {}) {
  if (!isPixelArtEnabled(config)) return 1;
  return clamp(Math.round(Number(config.pixelBlockSize) || DEFAULT_CONFIG.pixelBlockSize), 1, 16);
}

export function pixelBlockSliderValue(config = {}) {
  return isPixelArtEnabled(config) ? effectivePixelBlockSize(config) : 0;
}

export function normalizePaletteSwatchScale(value) {
  const number = Number(value);
  return PALETTE_SWATCH_SCALES.includes(number) ? number : 1;
}

export function nextPaletteSwatchScale(value) {
  const current = normalizePaletteSwatchScale(value);
  const index = PALETTE_SWATCH_SCALES.indexOf(current);
  return PALETTE_SWATCH_SCALES[(index + 1) % PALETTE_SWATCH_SCALES.length];
}

export const DEFAULT_CONFIG = {
  paletteMode: "generated",
  presetName: "amigaWorkbench",
  manualPalette: [
    {id: "manual-default-1", hex: "#000000", aliasHex: null, muted: false},
    {id: "manual-default-2", hex: "#ffffff", aliasHex: null, muted: false},
  ],
  manualMatchAliases: [],
  paletteRegionRect: null,
  showPaletteRegion: false,
  paletteSwatchScale: 1,
  paletteSize: 15,
  seedSwatch: "#735747",
  harmonyRelationship: "splitComplement",
  harmonyRegionContrast: "triadicRegions",
  harmonyRampSteepness: 1.5,
  cosinePreset: "sinebow",
  cosineCustomVectors: DEFAULT_COSINE_CUSTOM_VECTORS,
  deltaL: 30,
  paletteGamma: 1,
  gammaC: 1,
  paletteHue: 0,
  aliasAllSources: false,
  cycleOffset: 0,
  softness: 1,
  blendK: 2,
  lumaWeight: 1,
  chromaWeight: 1,
  hueWeight: 1,
  neutralIsCategory: false,
  monotoneBlendDither: true,
  blendPairRescue: true,
  maxDistanceEnabled: false,
  maxDistance: 30,
  // Generated-image candidate appeal nudges. These are independent, secondary
  // inputs to the preliminary appeal score; spacing, tonal-zone pressure,
  // range/novelty, and hue spread now carry most selection behavior.
  selectionMidtoneWeight: 0,
  selectionOutlierWeight: 0,
  selectionChromaWeight: 0,
  tonalZoneWeight: 1,
  widthBonus: 1,
  hueSpread: DEFAULT_HUE_SPREAD_BONUS,
  minDistance: 9,
  assignMode: "blend",
  outputMode: "fullReplace",
  shadowCutoff: 30,
  highlightCutoff: 70,
  blendAmount: 1,
  showPalette: "none",
  sortMode: "lightness",
  blockSize: 3,
  seed: 2,
  samplingMode: "stratified",
  CYCLE_MODE: 0,
  cycleManualKeys: [],
  cyclePreviewSpeed: 4,
  ditherPattern: "ordered4",
  ditherAngle: 45,
  ditherLumaAmount: 1,
  ditherScale: 1,
  generatedAssist: 0,
  generatedTintShadeFamilies: false,
  cosineCustomTintShadeFamilies: true,
  levelsExposure: 0,
  levelsGamma: 1,
  levelsShoulder: 2.5,
  levelsCenter: -1,
  levelsCurveAmount: 0,
  clarityAmount: 0,
  generatedLocks: [],
  pixelPerfect: false,
  dynamicSkin: false,
  pixelArtEnabled: false,
  pixelBlockSize: 1,
  pixelBlockSampleMode: "center",
  despeckleEnabled: false,
  despeckleStrength: 1,
  ditherProtectionEnabled: true,
  edgeTightenEnabled: false,
  edgeTightenStrength: 1,
  compareEnabled: false,
  compareSplit: 0.5
};

export const OUTPUT_MODE = {
  fullReplace: 0,
  preserveLuma: 1,
  preserveChroma: 2,
  hueWash: 3,
  shadowHighlight: 4
};

export const ASSIGN_MODE = {nearest: 0, blend: 1, dither: 2};
export const DITHER_PATTERN = {
  ordered2: 0,
  ordered4: 1,
  ordered8: 2,
  hash: 3,
  lines: 4,
  halftone: 5,
  crosshatch: 6,
  stipple: 7,
  weave: 8,
  contour: 9
};

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function cloneDefaultConfig() {
  return cloneJson(DEFAULT_CONFIG);
}

export function cloneConfigSnapshot(config) {
  return cloneJson(config);
}

export const TRANSIENT_CONFIG_KEYS = ["paletteSwatchScale", "compareEnabled", "compareSplit"];

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function stripTransientConfigState(snapshot = {}) {
  const clean = cloneJson(snapshot && typeof snapshot === "object" ? snapshot : {});
  for (const key of TRANSIENT_CONFIG_KEYS) delete clean[key];
  return clean;
}

export function cloneStoredConfigSnapshot(config) {
  return stripTransientConfigState(cloneConfigSnapshot(config));
}

export function preserveMissingTransientConfigState(snapshot = {}, current = {}) {
  const clean = cloneJson(snapshot && typeof snapshot === "object" ? snapshot : {});
  const source = current && typeof current === "object" ? current : {};
  for (const key of TRANSIENT_CONFIG_KEYS) {
    if (!hasOwn(clean, key) && hasOwn(source, key)) {
      clean[key] = cloneJson(source[key]);
    }
  }
  return clean;
}

export function normalizeManualSwatches(value, legacyAliases = []) {
  const raw = Array.isArray(value) && value.length ? value.slice(0, 42) : DEFAULT_CONFIG.manualPalette;
  const aliases = Array.isArray(legacyAliases) ? legacyAliases : [];
  const used = new Set();
  const out = [];

  raw.forEach((entry, index) => {
    const objectEntry = entry && typeof entry === "object" && !Array.isArray(entry);
    const rawHex = objectEntry ? (entry.hex ?? entry.color ?? entry.value) : entry;
    const hex = normalizeHexColor(rawHex, "#111111");
    const fallbackId = `manual-${index + 1}-${hex.slice(1)}`;
    const id = uniqueManualSwatchId(objectEntry ? (entry.id ?? fallbackId) : fallbackId, used);
    const aliasCandidate = objectEntry
      ? (entry.aliasHex ?? entry.matchAliasHex ?? entry.matchAlias ?? entry.alias ?? aliases[index])
      : aliases[index];
    const exactLab = objectEntry ? normalizeManualLab(entry.lab ?? entry.sourceLab) : null;
    const swatch = {
      id,
      hex,
      aliasHex: normalizeOptionalHexColor(aliasCandidate),
      locked: objectEntry ? !!entry.locked : false,
      muted: objectEntry ? !!entry.muted : false
    };
    if (exactLab && normalizeHexColor(labToHex(exactLab), "") === hex) {
      swatch.lab = exactLab;
      swatch.colorSpace = "oklab-scaled";
    }
    out.push(swatch);
  });

  if (!out.length) return normalizeManualSwatches(DEFAULT_CONFIG.manualPalette, []);
  if (out.every(swatch => swatch.muted)) out[0].muted = false;
  return out;
}

export function normalizeCycleManualKeys(value = [], swatches = []) {
  const raw = Array.isArray(value) ? value : [];
  const safeSwatches = Array.isArray(swatches) ? swatches.filter(swatch => swatch?.id) : [];
  const ids = new Set(safeSwatches.map(swatch => swatch.id));
  const manualIdByCycleKey = new Map(safeSwatches.map(swatch => [manualCycleKeyForId(swatch.id), swatch.id]));
  const byLegacyIndex = new Map(safeSwatches.map((swatch, index) => [index, swatch.id]));
  const seen = new Set();
  const out = [];

  const pushKey = key => {
    if (typeof key !== "string" || !key || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };

  const pushManualId = id => {
    if (!ids.has(id)) return false;
    pushKey(manualCycleKeyForId(id));
    return true;
  };

  const pushManualCycleKey = key => {
    const id = manualIdByCycleKey.get(key);
    return id ? pushManualId(id) : false;
  };

  for (const value of raw) {
    if (typeof value !== "string" || !value) continue;
    if (pushManualId(value)) continue;
    if (pushManualCycleKey(value)) continue;

    const legacy = value.match(/^manual:manual-(\d+):single:0$/);
    if (legacy) {
      const legacyIndex = Number(legacy[1]);
      if (byLegacyIndex.has(legacyIndex)) pushManualId(byLegacyIndex.get(legacyIndex));
      continue;
    }

    const direct = value.match(/^manual:(.+)$/)?.[1];
    if (direct) {
      pushManualId(direct);
      continue;
    }

    // Manual cycle tagging is not limited to manual palettes. Generated-mode
    // swatches still use their record cycle keys, so preserve those verbatim.
    pushKey(value);
  }

  return out.slice(0, 42);
}

export function normalizePaletteRegionSnapshot(value) {
  if (!value || typeof value !== "object") return null;
  const x = Math.max(0, Math.round(Number(value.x) || 0));
  const y = Math.max(0, Math.round(Number(value.y) || 0));
  const width = Math.max(1, Math.round(Number(value.width) || 0));
  const height = Math.max(1, Math.round(Number(value.height) || 0));
  if (!Number.isFinite(x + y + width + height)) return null;
  return {x, y, width, height};
}

function defaultPresetExists(name) {
  return Object.prototype.hasOwnProperty.call(PALETTE_PRESETS, name);
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function clampPaletteSize(value, {min = 2} = {}) {
  return clamp(Math.round(Number(value) || DEFAULT_CONFIG.paletteSize), min, 42);
}

export function snapPaletteSizeToFamilyMultiple(value) {
  return Math.max(3, Math.round(clampPaletteSize(value, {min: 3}) / 3) * 3);
}

export function sanitizePaletteSize(value, {tintShadeFamilies = true, min = 2} = {}) {
  if (tintShadeFamilies) return snapPaletteSizeToFamilyMultiple(value);
  return clampPaletteSize(value, {min});
}

function generatedPaletteUsesFamilySizes(config) {
  return ["generated", "generatedReference"].includes(config?.paletteMode)
    && config?.generatedTintShadeFamilies !== false;
}

function paletteSizeMinimum(config) {
  return generatedPaletteUsesFamilySizes(config) || ["harmony", "cosine"].includes(config?.paletteMode) ? 3 : 2;
}

export function normalizeCosineCustomVectors(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(COSINE_VECTOR_KEYS.map(key => {
    const fallback = DEFAULT_COSINE_CUSTOM_VECTORS[key];
    const rawVector = Array.isArray(source[key]) ? source[key] : fallback;
    return [key, [0, 1, 2].map(index => finiteNumber(rawVector[index], fallback[index]))];
  }));
}

export function sanitizeConfigSnapshot(raw = {}, options = {}) {
  const presetExists = typeof options.presetExists === "function" ? options.presetExists : defaultPresetExists;
  const base = cloneDefaultConfig();
  const source = raw && typeof raw === "object" ? raw : {};
  for (const key of Object.keys(base)) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      base[key] = cloneJson(source[key]);
    }
  }
  if (!Object.prototype.hasOwnProperty.call(source, "tonalZoneWeight")
      && Object.prototype.hasOwnProperty.call(source, "tonalNeedBonusWeight")) {
    base.tonalZoneWeight = cloneJson(source.tonalNeedBonusWeight);
  }

  base.paletteMode = ["generated", "generatedReference", "harmony", "cosine", "manual"].includes(base.paletteMode) ? base.paletteMode : DEFAULT_CONFIG.paletteMode;
  if (!presetExists(base.presetName)) base.presetName = DEFAULT_CONFIG.presetName;
  base.manualPalette = normalizeManualSwatches(base.manualPalette, base.manualMatchAliases);
  base.manualMatchAliases = [];
  base.paletteRegionRect = normalizePaletteRegionSnapshot(base.paletteRegionRect);
  base.showPaletteRegion = !!base.showPaletteRegion;
  base.paletteSwatchScale = normalizePaletteSwatchScale(base.paletteSwatchScale);
  base.generatedTintShadeFamilies = base.generatedTintShadeFamilies !== false;
  base.cosineCustomTintShadeFamilies = base.cosineCustomTintShadeFamilies !== false;
  base.paletteSize = sanitizePaletteSize(base.paletteSize, {
    tintShadeFamilies: generatedPaletteUsesFamilySizes(base),
    min: paletteSizeMinimum(base)
  });
  base.seedSwatch = normalizeHexColor(base.seedSwatch, DEFAULT_CONFIG.seedSwatch);
  base.harmonyRelationship = Object.prototype.hasOwnProperty.call(HARMONY_RELATIONSHIPS, base.harmonyRelationship) ? base.harmonyRelationship : DEFAULT_CONFIG.harmonyRelationship;
  base.harmonyRegionContrast = Object.prototype.hasOwnProperty.call(HARMONY_REGION_CONTRASTS, base.harmonyRegionContrast) ? base.harmonyRegionContrast : DEFAULT_CONFIG.harmonyRegionContrast;
  {
    const harmonyRampSteepness = Number(base.harmonyRampSteepness);
    base.harmonyRampSteepness = clamp(Number.isFinite(harmonyRampSteepness) ? harmonyRampSteepness : DEFAULT_CONFIG.harmonyRampSteepness, 0, 2.5);
  }
  base.cosinePreset = base.cosinePreset === "custom" || Object.prototype.hasOwnProperty.call(COSINE_PALETTE_PRESETS, base.cosinePreset) ? base.cosinePreset : DEFAULT_CONFIG.cosinePreset;
  base.cosineCustomVectors = normalizeCosineCustomVectors(base.cosineCustomVectors);
  base.deltaL = clamp(Number(base.deltaL) || DEFAULT_CONFIG.deltaL, 1, 60);
  {
    const paletteGamma = Number(base.paletteGamma);
    const chromaGamma = Number(base.gammaC);
    const paletteHue = Number(base.paletteHue);
    base.paletteGamma = clamp(Number.isFinite(paletteGamma) ? paletteGamma : DEFAULT_CONFIG.paletteGamma, 0.2, 4);
    base.gammaC = clamp(Number.isFinite(chromaGamma) ? chromaGamma : DEFAULT_CONFIG.gammaC, 0.1, 2);
    base.paletteHue = clamp(Number.isFinite(paletteHue) ? paletteHue : DEFAULT_CONFIG.paletteHue, -180, 180);
  }
  base.aliasAllSources = !!base.aliasAllSources;
  base.cycleOffset = Math.max(0, Math.round(Number(base.cycleOffset) || 0));
  base.softness = clamp(Number(base.softness) || DEFAULT_CONFIG.softness, 0.5, 4);
  base.blendK = clamp(Math.round(Number(base.blendK) || DEFAULT_CONFIG.blendK), 1, 5);
  base.lumaWeight = clamp(Number(base.lumaWeight) || 0, 0, 3);
  base.chromaWeight = clamp(Number(base.chromaWeight) || 0, 0, 3);
  base.hueWeight = clamp(Number(base.hueWeight) || 0, 0, 3);
  base.neutralIsCategory = !!base.neutralIsCategory;
  base.monotoneBlendDither = !!base.monotoneBlendDither;
  base.blendPairRescue = base.blendPairRescue !== false;
  base.maxDistanceEnabled = !!base.maxDistanceEnabled;
  {
    const maxDistance = Number(base.maxDistance);
    base.maxDistance = clamp(Number.isFinite(maxDistance) ? maxDistance : DEFAULT_CONFIG.maxDistance, 0, 100);
  }
  for (const key of ["selectionMidtoneWeight", "selectionOutlierWeight", "selectionChromaWeight"]) {
    const value = Number(base[key]);
    base[key] = clamp(Number.isFinite(value) ? value : DEFAULT_CONFIG[key], -1, 1);
  }
  {
    const tonalZoneWeight = Number(base.tonalZoneWeight);
    base.tonalZoneWeight = clamp(Number.isFinite(tonalZoneWeight) ? tonalZoneWeight : DEFAULT_CONFIG.tonalZoneWeight, 0, 2);
  }
  {
    const widthBonus = Number(base.widthBonus);
    base.widthBonus = clamp(Number.isFinite(widthBonus) ? widthBonus : DEFAULT_CONFIG.widthBonus, 0, 2);
  }
  base.hueSpread = clamp(Number(base.hueSpread ?? DEFAULT_CONFIG.hueSpread) || 0, 0, 0.5);
  base.minDistance = clamp(Math.round(Number(base.minDistance) || DEFAULT_CONFIG.minDistance), 1, 30);
  base.assignMode = Object.prototype.hasOwnProperty.call(ASSIGN_MODE, base.assignMode) ? base.assignMode : DEFAULT_CONFIG.assignMode;
  base.outputMode = Object.prototype.hasOwnProperty.call(OUTPUT_MODE, base.outputMode) ? base.outputMode : DEFAULT_CONFIG.outputMode;
  base.shadowCutoff = clamp(Number(base.shadowCutoff) || DEFAULT_CONFIG.shadowCutoff, 0, 100);
  base.highlightCutoff = clamp(Number(base.highlightCutoff) || DEFAULT_CONFIG.highlightCutoff, 0, 100);
  base.blendAmount = clamp(Number(base.blendAmount) || 0, 0, 1);
  base.sortMode = ["lightness", "variantBands", "hueFamilies", "labWalk"].includes(base.sortMode) ? base.sortMode : DEFAULT_CONFIG.sortMode;
  base.blockSize = clamp(Math.round(Number(base.blockSize) || DEFAULT_CONFIG.blockSize), 1, 5);
  base.seed = clamp(Math.round(Number(base.seed) || DEFAULT_CONFIG.seed), 1, 500);
  base.samplingMode = ["random", "stratified"].includes(base.samplingMode) ? base.samplingMode : DEFAULT_CONFIG.samplingMode;
  if (base.CYCLE_MODE === "manual") {
    base.CYCLE_MODE = "manual";
  } else {
    const cycleMode = Number(base.CYCLE_MODE);
    base.CYCLE_MODE = [0, 1, 2, 3, 4].includes(cycleMode) ? cycleMode : DEFAULT_CONFIG.CYCLE_MODE;
  }
  base.cycleManualKeys = normalizeCycleManualKeys(base.cycleManualKeys, base.manualPalette);
  base.cyclePreviewSpeed = clamp(Number(base.cyclePreviewSpeed) || DEFAULT_CONFIG.cyclePreviewSpeed, 0.5, 12);
  base.ditherPattern = Object.prototype.hasOwnProperty.call(DITHER_PATTERN, base.ditherPattern) ? base.ditherPattern : DEFAULT_CONFIG.ditherPattern;
  base.ditherAngle = clamp(Number(base.ditherAngle) || 0, -180, 180);
  base.ditherLumaAmount = clamp(Number(base.ditherLumaAmount) || 0, 0, 1);
  base.ditherScale = clamp(Math.round(Number(base.ditherScale) || DEFAULT_CONFIG.ditherScale), 1, 12);
  base.generatedAssist = clamp(Math.round(Number(base.generatedAssist) || 0), 0, 100);
  {
    const exposure = Number(base.levelsExposure);
    const gamma = Number(base.levelsGamma);
    const shoulder = Number(base.levelsShoulder);
    const center = Number(base.levelsCenter);
    const curveAmount = Number(base.levelsCurveAmount);
    const clarityAmount = Number(base.clarityAmount);
    base.levelsExposure = clamp(Number.isFinite(exposure) ? exposure : DEFAULT_CONFIG.levelsExposure, -4, 4);
    base.levelsGamma = clamp(Number.isFinite(gamma) ? gamma : DEFAULT_CONFIG.levelsGamma, 0.2, 4);
    base.levelsShoulder = clamp(Number.isFinite(shoulder) ? shoulder : DEFAULT_CONFIG.levelsShoulder, 0.1, 16);
    base.levelsCenter = clamp(Number.isFinite(center) ? center : DEFAULT_CONFIG.levelsCenter, -8, 0);
    base.levelsCurveAmount = clamp(Number.isFinite(curveAmount) ? curveAmount : DEFAULT_CONFIG.levelsCurveAmount, 0, 1);
    base.clarityAmount = clamp(Number.isFinite(clarityAmount) ? clarityAmount : DEFAULT_CONFIG.clarityAmount, 0, 1);
  }
  base.generatedLocks = Array.isArray(base.generatedLocks) ? base.generatedLocks.slice(0, 42).map((entry, index) => {
    const hex = normalizeHexColor(entry?.hex, "#111111");
    const lab = entry?.colorSpace === "oklab-scaled" && Array.isArray(entry?.lab) && entry.lab.length >= 3
      ? entry.lab.slice(0, 3).map(Number)
      : hexToLab(hex);
    return {
      id: String(entry?.id || `lock-imported-${index}`),
      hex,
      lab,
      colorSpace: "oklab-scaled"
    };
  }) : [];
  base.pixelPerfect = !!base.pixelPerfect;
  base.dynamicSkin = !!base.dynamicSkin;
  const hasExplicitPixelArtEnabled = hasOwn(source, "pixelArtEnabled");
  base.pixelBlockSize = clamp(Math.round(Number(base.pixelBlockSize) || DEFAULT_CONFIG.pixelBlockSize), 1, 16);
  base.pixelBlockSampleMode = ["center", "mean", "representative"].includes(base.pixelBlockSampleMode) ? base.pixelBlockSampleMode : DEFAULT_CONFIG.pixelBlockSampleMode;
  base.despeckleEnabled = !!base.despeckleEnabled;
  base.despeckleStrength = clamp(Math.round(Number(base.despeckleStrength) || DEFAULT_CONFIG.despeckleStrength), 1, 4);
  base.ditherProtectionEnabled = hasOwn(base, "ditherProtectionEnabled")
    ? !!base.ditherProtectionEnabled
    : DEFAULT_CONFIG.ditherProtectionEnabled;
  base.edgeTightenEnabled = !!base.edgeTightenEnabled;
  base.edgeTightenStrength = clamp(Math.round(Number(base.edgeTightenStrength) || DEFAULT_CONFIG.edgeTightenStrength), 1, 2);
  base.pixelArtEnabled = hasExplicitPixelArtEnabled
    ? !!base.pixelArtEnabled
    : base.pixelBlockSize > 1
      || base.pixelBlockSampleMode !== DEFAULT_CONFIG.pixelBlockSampleMode
      || base.despeckleEnabled
      || base.edgeTightenEnabled;
  if (!base.pixelArtEnabled) base.pixelBlockSize = DEFAULT_CONFIG.pixelBlockSize;
  base.compareEnabled = !!base.compareEnabled;
  base.compareSplit = clamp01(Number.isFinite(Number(base.compareSplit)) ? Number(base.compareSplit) : DEFAULT_CONFIG.compareSplit);
  return base;
}
