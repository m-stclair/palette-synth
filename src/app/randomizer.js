import {
  COSINE_PALETTE_PRESETS,
  HARMONY_REGION_CONTRASTS,
  HARMONY_RELATIONSHIPS,
  OKLCH_PROCEDURAL_CHROMA_MAX,
  TAU
} from "../constants.js";
import { ASSIGN_MODE, DEFAULT_CONFIG, DITHER_PATTERN, normalizeCosineCustomVectors, OUTPUT_MODE } from "../state/config.js";
import { fitLabToSrgb, labToHex, oklchToLab } from "../color-utils.js";

const PALETTE_MODES = ["generated", "harmony", "cosine", "manual"];
const IMAGE_PALETTE_MODES = new Set(["generated", "generatedReference"]);
const SORT_MODES = ["lightness", "variantBands", "hueFamilies", "labWalk"];
const SAMPLING_MODES = ["random", "stratified"];
const PIXEL_BLOCK_SAMPLE_MODES = ["center", "mean", "representative"];
const COMMON_PALETTE_SIZES = [6, 9, 12, 15, 18];
const LARGE_PALETTE_SIZES = [21, 24, 27, 30, 33, 36, 39, 42];

function randomSource(source) {
  return typeof source === "function" ? source : Math.random;
}

function unit(rng) {
  const value = Number(rng());
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(0.999999999999, value));
}

function rand(rng, min = 0, max = 1) {
  return min + (max - min) * unit(rng);
}

function randInt(rng, min, max) {
  return Math.floor(rand(rng, min, max + 1));
}

function randStep(rng, min, max, step = 1) {
  const slots = Math.round((max - min) / step);
  return +(min + randInt(rng, 0, slots) * step).toFixed(6);
}

function pick(rng, values, fallback = null) {
  const list = Array.isArray(values) ? values.filter(value => value !== undefined && value !== null) : [];
  if (!list.length) return fallback;
  return list[Math.floor(unit(rng) * list.length) % list.length];
}

function objectKeys(object) {
  return Object.keys(object || {});
}

function randomHex(rng, {minLightness = 14, maxLightness = 90, minChroma = 4, maxChroma = OKLCH_PROCEDURAL_CHROMA_MAX} = {}) {
  const L = rand(rng, minLightness, maxLightness);
  const C = rand(rng, minChroma, maxChroma);
  const h = rand(rng, 0, TAU);
  return labToHex(fitLabToSrgb(oklchToLab([L, C, h])));
}

function randomManualPalette(rng, size) {
  const token = randInt(rng, 0x1000, 0xfffff).toString(36);
  const startHue = rand(rng, 0, TAU);
  const spread = rand(rng, 0.45, 1.25);
  const count = Math.max(3, Math.min(42, Math.round(size)));
  return Array.from({length: count}, (_unused, index) => {
    const t = count <= 1 ? 0 : index / (count - 1);
    const L = rand(rng, 18, 88);
    const C = rand(rng, 6, OKLCH_PROCEDURAL_CHROMA_MAX);
    const h = startHue + t * TAU * spread + rand(rng, -0.18, 0.18);
    return {
      id: `manual-random-${token}-${index + 1}`,
      hex: labToHex(fitLabToSrgb(oklchToLab([L, C, h]))),
      aliasHex: null
    };
  });
}

function randomCosineVectors(rng) {
  return normalizeCosineCustomVectors({
    a: [randStep(rng, 0.42, 0.72, 0.01), randStep(rng, 0.22, 0.72, 0.01), randStep(rng, 0.05, 0.95, 0.01)],
    b: [randStep(rng, 0.08, 0.30, 0.01), randStep(rng, 0.08, 0.34, 0.01), randStep(rng, 0.16, 0.50, 0.01)],
    c: [randStep(rng, 0.45, 1.65, 0.05), randStep(rng, 0.45, 1.65, 0.05), randStep(rng, 0.45, 1.65, 0.05)],
    d: [randStep(rng, 0, 0.95, 0.01), randStep(rng, 0, 0.95, 0.01), randStep(rng, 0, 0.95, 0.01)]
  });
}

function randomPaletteSize(rng) {
  const sizes = unit(rng) < 0.85 ? COMMON_PALETTE_SIZES : LARGE_PALETTE_SIZES;
  return pick(rng, sizes, DEFAULT_CONFIG.paletteSize);
}

function randomizePixelizationControls(snapshot, rng) {
  const enabled = unit(rng) < 0.25;
  snapshot.pixelBlockSize = enabled ? randInt(rng, 2, 16) : 1;
  snapshot.pixelBlockSampleMode = enabled
    ? pick(rng, PIXEL_BLOCK_SAMPLE_MODES, DEFAULT_CONFIG.pixelBlockSampleMode)
    : DEFAULT_CONFIG.pixelBlockSampleMode;
}

function randomizeSharedControls(snapshot, rng) {
  snapshot.paletteSize = randomPaletteSize(rng);
  snapshot.paletteGamma = randStep(rng, 0.55, 2.25, 0.01);
  snapshot.gammaC = randStep(rng, 0.5, 1.7, 0.1);
  snapshot.paletteHue = randStep(rng, -5, 5, 1);
  snapshot.deltaL = randStep(rng, 8, 54, 0.5);
  snapshot.tonalZoneWeight = randStep(rng, 0, 2, 0.01);
  snapshot.widthBonus = randStep(rng, 0, 2, 0.01);
  snapshot.hueSpread = randStep(rng, 0, 0.45, 0.01);
  snapshot.minDistance = randInt(rng, 4, 24);
  snapshot.sortMode = pick(rng, SORT_MODES, DEFAULT_CONFIG.sortMode);
  snapshot.seed = randInt(rng, 1, 500);
  snapshot.blockSize = randInt(rng, 1, 5);
  snapshot.samplingMode = pick(rng, SAMPLING_MODES, DEFAULT_CONFIG.samplingMode);
  snapshot.selectionMidtoneWeight = randStep(rng, 0, 0.9, 0.05);
  snapshot.selectionOutlierWeight = randStep(rng, 0, 0.8, 0.05);
  snapshot.selectionChromaWeight = randStep(rng, 0, 0.8, 0.05);
  snapshot.generatedLocks = [];
}

function randomizeAssignmentControls(snapshot, rng) {
  snapshot.assignMode = pick(rng, objectKeys(ASSIGN_MODE), DEFAULT_CONFIG.assignMode);
  snapshot.outputMode = pick(rng, objectKeys(OUTPUT_MODE), DEFAULT_CONFIG.outputMode);
  snapshot.softness = randStep(rng, 0.6, 2.6, 0.05);
  snapshot.blendK = randInt(rng, 1, 5);
  snapshot.lumaWeight = randStep(rng, 0, 2.2, 0.05);
  snapshot.chromaWeight = randStep(rng, 0, 2.2, 0.05);
  snapshot.hueWeight = randStep(rng, 0, 2.2, 0.05);
  snapshot.maxDistanceEnabled = unit(rng) > 0.72;
  snapshot.maxDistance = randStep(rng, 12, 72, 1);
  snapshot.shadowCutoff = randStep(rng, 15, 45, 1);
  snapshot.highlightCutoff = randStep(rng, 55, 88, 1);
  if (snapshot.highlightCutoff <= snapshot.shadowCutoff + 8) snapshot.highlightCutoff = snapshot.shadowCutoff + 8;
  snapshot.ditherPattern = pick(rng, objectKeys(DITHER_PATTERN), DEFAULT_CONFIG.ditherPattern);
  snapshot.ditherAngle = randStep(rng, -90, 90, 1);
  snapshot.ditherLumaAmount = randStep(rng, 0, 0.75, 0.01);
  snapshot.ditherScale = randInt(rng, 1, 8);
}

function randomizeFinishingControls(snapshot, rng) {
  snapshot.levelsExposure = randStep(rng, -0.85, 0.85, 0.01);
  snapshot.levelsGamma = randStep(rng, 0.72, 1.45, 0.01);
  snapshot.levelsShoulder = randStep(rng, 1.1, 6, 0.1);
  snapshot.levelsCenter = randStep(rng, -3.2, -0.15, 0.05);
  snapshot.levelsCurveAmount = randStep(rng, 0, 0.55, 0.01);
  snapshot.clarityAmount = randStep(rng, 0, 0.75, 0.01);
}

function randomizeModeSpecificControls(snapshot, rng) {
  if (snapshot.paletteMode === "harmony") {
    snapshot.seedSwatch = randomHex(rng, {minLightness: 20, maxLightness: 82, minChroma: 10});
    snapshot.harmonyRelationship = pick(rng, objectKeys(HARMONY_RELATIONSHIPS), DEFAULT_CONFIG.harmonyRelationship);
    snapshot.harmonyRegionContrast = pick(rng, objectKeys(HARMONY_REGION_CONTRASTS), DEFAULT_CONFIG.harmonyRegionContrast);
    snapshot.harmonyRampSteepness = randStep(rng, 0.35, 2.35, 0.05);
  } else if (snapshot.paletteMode === "cosine") {
    const useCustom = unit(rng) > 0.65;
    snapshot.cosinePreset = useCustom ? "custom" : pick(rng, objectKeys(COSINE_PALETTE_PRESETS), DEFAULT_CONFIG.cosinePreset);
    if (useCustom) snapshot.cosineCustomVectors = randomCosineVectors(rng);
  } else if (snapshot.paletteMode === "manual") {
    snapshot.manualPalette = randomManualPalette(rng, snapshot.paletteSize);
    snapshot.manualMatchAliases = [];
    snapshot.generatedAssist = randStep(rng, 0, 45, 1);
    snapshot.aliasAllSources = false;
  } else if (IMAGE_PALETTE_MODES.has(snapshot.paletteMode)) {
    snapshot.generatedAssist = 0;
  }
}

export function createRandomizedConfigSnapshot(current = {}, options = {}) {
  const rng = randomSource(options.rng);
  const snapshot = JSON.parse(JSON.stringify({...DEFAULT_CONFIG, ...(current || {})}));
  const requestedMode = options.paletteMode || snapshot.paletteMode;
  snapshot.paletteMode = PALETTE_MODES.includes(requestedMode) || requestedMode === "generatedReference"
    ? requestedMode
    : DEFAULT_CONFIG.paletteMode;

  if (options.randomizeMode) {
    snapshot.paletteMode = pick(rng, PALETTE_MODES, DEFAULT_CONFIG.paletteMode);
  }

  randomizeSharedControls(snapshot, rng);
  randomizeAssignmentControls(snapshot, rng);
  randomizeFinishingControls(snapshot, rng);
  randomizePixelizationControls(snapshot, rng);
  randomizeModeSpecificControls(snapshot, rng);

  snapshot.cycleOffset = 0;
  snapshot.CYCLE_MODE = 0;
  snapshot.cycleManualKeys = [];
  snapshot.compareEnabled = !!current.compareEnabled;
  snapshot.compareSplit = current.compareSplit ?? DEFAULT_CONFIG.compareSplit;
  snapshot.pixelPerfect = !!current.pixelPerfect;
  snapshot.dynamicSkin = !!current.dynamicSkin;

  return snapshot;
}

export function createRandomizerController({
  config,
  cloneConfigSnapshot,
  replaceConfigSnapshot,
  withHistory,
  setStatus,
  rng = Math.random
}) {
  if (!config) throw new Error("createRandomizerController requires config.");
  if (typeof replaceConfigSnapshot !== "function") throw new Error("createRandomizerController requires replaceConfigSnapshot().");

  const snapshot = typeof cloneConfigSnapshot === "function"
    ? cloneConfigSnapshot
    : () => JSON.parse(JSON.stringify(config));
  const history = typeof withHistory === "function"
    ? withHistory
    : (_label, mutator) => mutator();
  const announce = typeof setStatus === "function" ? setStatus : () => {};

  function randomizePalette(options = {}) {
    return history("Randomize palette", () => {
      const next = createRandomizedConfigSnapshot(snapshot(), {rng, ...options});
      replaceConfigSnapshot(next, {cancelPendingHistory: false});
      announce("Randomized palette settings.");
      return next;
    });
  }

  return {randomizePalette};
}
