import { MAX_PALETTE_SIZE, PALETTE_PRESETS, TAU } from "../constants.js";
import {
  clamp,
  clamp01,
  hexToLab,
  labDistance,
  labToHex,
  makePaletteRecord,
  paletteLabs,
  sortPaletteRecords
} from "../color-utils.js";
import {
  activeGeneratedLocks as activeGeneratedLocksForConfig,
  createCosinePalette,
  createGeneratedPalette,
  createHarmonyPalette,
  createManualPalette,
  createPresetPalette,
  generatedFamilyCount as generatedFamilyCountForConfig,
  syncGeneratedLocks as syncGeneratedLocksForConfig
} from "./generation.js";
import { normalizeSampleRegion } from "./sampling.js";

const MANUAL_PRESET_PREFIX = "manualPreset:";

export function manualPresetName(id) {
  return `${MANUAL_PRESET_PREFIX}${id}`;
}

export function manualPresetIdFromName(name) {
  const value = String(name || "");
  return value.startsWith(MANUAL_PRESET_PREFIX) ? value.slice(MANUAL_PRESET_PREFIX.length) : "";
}

export function createPaletteRuntime({
  config,
  state,
  syncManualSwatches,
  manualSwatchLab,
  manualSwatchEditable,
  manualMatchAliasHex
}) {
  function manualPresetByName(name) {
    const id = manualPresetIdFromName(name);
    return id ? state.manualPresets.find(preset => preset.id === id) || null : null;
  }

  function presetExists(name) {
    return Object.prototype.hasOwnProperty.call(PALETTE_PRESETS, name) || !!manualPresetByName(name);
  }

  function presetColors(name) {
    const manualPreset = manualPresetByName(name);
    if (manualPreset) return manualPreset.colors;
    const keys = Object.keys(PALETTE_PRESETS);
    const preset = PALETTE_PRESETS[name] ?? PALETTE_PRESETS[keys[0]];
    if (Array.isArray(preset)) return preset;
    if (Array.isArray(preset?.colors)) return preset.colors;
    return [];
  }

  function presetSize(name) {
    const manualPreset = manualPresetByName(name);
    if (manualPreset) return Math.max(1, Math.min(MAX_PALETTE_SIZE, manualPreset.colors.length || 1));
    const preset = PALETTE_PRESETS[name];
    const colors = presetColors(name);
    const requested = Array.isArray(preset) ? colors.length : Math.round(preset?.size ?? colors.length);
    return Math.max(1, Math.min(MAX_PALETTE_SIZE, requested || colors.length || 1));
  }

  function generatedFamilyCount() {
    return generatedFamilyCountForConfig(config);
  }

  function syncGeneratedLocks() {
    return syncGeneratedLocksForConfig(config);
  }

  function activeGeneratedLocks(baseCount = generatedFamilyCount()) {
    return activeGeneratedLocksForConfig(config, baseCount);
  }

  function harmonyPalette() {
    return createHarmonyPalette(config);
  }

  function cosinePalette() {
    return createCosinePalette(config);
  }

  function presetPalette() {
    return createPresetPalette(config, presetColors(config.presetName), presetSize(config.presetName));
  }

  function isGeneratedPaletteMode(mode = config.paletteMode) {
    return mode === "generated" || mode === "generatedReference";
  }

  function activePaletteImageData(mode = config.paletteMode) {
    return mode === "generatedReference" ? state.referenceImageData : state.imageData;
  }

  function activePaletteRegionRect(imageData = activePaletteImageData(), mode = config.paletteMode) {
    if (!imageData || mode !== "generated" || imageData !== state.imageData || !config.paletteRegionRect) return null;
    return normalizeSampleRegion(config.paletteRegionRect, imageData.width, imageData.height);
  }

  function activePaletteImageLabel(mode = config.paletteMode) {
    if (mode === "generated" && activePaletteRegionRect(activePaletteImageData(mode), mode)) return "selected region";
    return mode === "generatedReference" ? "reference image" : "image";
  }

  function generatedSourceKey(mode = config.paletteMode) {
    return mode === "generatedReference" ? "reference" : "generated";
  }

  function generatedPalette(options = {}) {
    const mode = options.mode ?? config.paletteMode;
    const captureTrace = !!options.captureTrace;
    const imageData = activePaletteImageData(mode);
    const sampleRegion = activePaletteRegionRect(imageData, mode);
    const result = createGeneratedPalette({
      config,
      mode,
      imageData,
      sampleRegion,
      sourceKey: generatedSourceKey(mode),
      sourceLabel: activePaletteImageLabel(mode),
      fallbackSwatches: syncManualSwatches(),
      captureTrace
    });
    if (captureTrace) state.paletteSelectionTrace = result.trace;
    return result.records;
  }

  function manualPalette() {
    const swatches = syncManualSwatches();
    const assist = clamp01(config.generatedAssist / 100);
    const assistRecords = assist > 0 && state.imageData ? generatedPalette() : null;
    return createManualPalette({
      config,
      swatches,
      manualSwatchLab,
      assistRecords,
      imageDataAvailable: !!state.imageData
    });
  }


  function paletteAdjustmentsActive() {
    return Math.abs((Number(config.paletteGamma) || 1) - 1) > 1e-6
      || Math.abs((Number(config.gammaC) || 1) - 1) > 1e-6
      || Math.abs(Number(config.paletteHue) || 0) > 1e-6;
  }

  function adjustPaletteLab([L, a, b]) {
    let outL = clamp(Number(L) || 0, 0, 100);
    let outA = Number(a) || 0;
    let outB = Number(b) || 0;

    const gamma = clamp(Number(config.paletteGamma) || 1, 0.2, 4);
    if (Math.abs(gamma - 1) > 1e-6) {
      outL = 100 * Math.pow(clamp01(outL / 100), 1 / gamma);
    }

    const chromaGamma = clamp(Number(config.gammaC) || 1, 0.1, 2);
    const hueDegrees = Number(config.paletteHue) || 0;
    const C = Math.hypot(outA, outB);
    if (C > 0 || Math.abs(chromaGamma - 1) > 1e-6 || Math.abs(hueDegrees) > 1e-6) {
      const h = Math.atan2(outB, outA) + hueDegrees * TAU / 360;
      const chromaRef = 100;
      const Cn = clamp(C / chromaRef, 0, 2);
      const adjustedC = chromaRef * Math.pow(Cn, chromaGamma);
      outA = Math.cos(h) * adjustedC;
      outB = Math.sin(h) * adjustedC;
    }

    return [clamp(outL, 0, 100), outA, outB];
  }

  function applyPaletteAdjustments(records) {
    if (!paletteAdjustmentsActive()) return records;
    return records.map(record => {
      const lab = adjustPaletteLab(record.lab);
      return {
        ...record,
        lab,
        hex: labToHex(lab),
        adjustedLab: lab,
        unadjustedLab: Array.isArray(record.lab) ? [...record.lab] : null
      };
    });
  }

  function preprocessPalette(palette, renderPalette = palette) {
    const paletteBlock = new Float32Array(MAX_PALETTE_SIZE * 4);
    const paletteFeatures = new Float32Array(MAX_PALETTE_SIZE * 4);
    const limit = Math.min(palette.length, MAX_PALETTE_SIZE, renderPalette.length);
    for (let i = 0; i < limit; i++) {
      const [renderL, renderA, renderB] = renderPalette[i];
      paletteBlock[i * 4 + 0] = renderL;
      paletteBlock[i * 4 + 1] = renderA;
      paletteBlock[i * 4 + 2] = renderB;
      const [L, a, b] = palette[i];
      const C = Math.hypot(a, b);
      const h = Math.atan2(b, a);
      paletteFeatures[i * 4 + 0] = L;
      paletteFeatures[i * 4 + 1] = C;
      paletteFeatures[i * 4 + 2] = Math.cos(h);
      paletteFeatures[i * 4 + 3] = Math.sin(h);
    }
    return {paletteBlock, paletteFeatures};
  }

  function paletteUniformEntries(records, renderPalette = paletteLabs(records)) {
    const safeRecords = Array.isArray(records) ? records : [];
    const safeRenderPalette = Array.isArray(renderPalette) ? renderPalette : paletteLabs(safeRecords);
    const natural = safeRecords.slice(0, MAX_PALETTE_SIZE).map((record, index) => ({
      featureLab: record.lab,
      renderLab: safeRenderPalette[index] || record.lab,
      featureHex: labToHex(record.lab),
      renderHex: labToHex(safeRenderPalette[index] || record.lab),
      sourceRecord: record,
      alias: false
    }));

    const entries = [...natural];
    if (config.paletteMode !== "manual" || entries.length >= MAX_PALETTE_SIZE) return entries;

    for (let i = 0; i < safeRecords.length && entries.length < MAX_PALETTE_SIZE; i++) {
      const record = safeRecords[i];
      if (!manualSwatchEditable(record)) continue;
      const renderLab = safeRenderPalette[i] || record.lab;
      const aliasHex = manualMatchAliasHex(record.swatchId ?? record.sourceIndex);
      const aliasLabs = [];
      if (aliasHex) aliasLabs.push(hexToLab(aliasHex));
      if (config.aliasAllSources && Array.isArray(record.sourceLab)) aliasLabs.push(record.sourceLab);
      for (const aliasLab of aliasLabs) {
        if (!Array.isArray(aliasLab) || aliasLab.length < 3) continue;
        if (labDistance(aliasLab, record.lab) < 0.1) continue;
        if (entries.some(entry => entry.sourceRecord === record && labDistance(entry.featureLab, aliasLab) < 0.1)) continue;
        entries.push({
          featureLab: [...aliasLab],
          renderLab,
          sourceRecord: record,
          alias: true
        });
      }
    }

    return entries;
  }

  function preprocessPaletteEntries(entries) {
    const safeEntries = Array.isArray(entries) ? entries : [];
    const featurePalette = safeEntries.map(entry => entry.featureLab);
    const renderPalette = safeEntries.map(entry => entry.renderLab);
    const basePalette = safeEntries.map(entry => entry.sourceRecord?.lab || entry.renderLab || entry.featureLab);
    const out = preprocessPalette(featurePalette, renderPalette);
    const {paletteBlock: paletteBaseBlock} = preprocessPalette(featurePalette, basePalette);
    const paletteSourceIndices = new Int32Array(MAX_PALETTE_SIZE);
    paletteSourceIndices.fill(-1);
    for (let i = 0; i < Math.min(safeEntries.length, MAX_PALETTE_SIZE); i++) {
      const record = safeEntries[i]?.sourceRecord;
      const displayIndex = Number.isInteger(record?.displayIndex) ? record.displayIndex : i;
      paletteSourceIndices[i] = clamp(Math.round(displayIndex), 0, MAX_PALETTE_SIZE - 1);
    }
    return {...out, paletteBaseBlock, paletteSourceIndices};
  }

  function fallbackPaletteRecords() {
    return ["#111111", "#eeeeee"].map((color, sourceIndex) => makePaletteRecord({
      lab: hexToLab(color),
      source: "fallback",
      familyId: `fallback-${sourceIndex}`,
      familyIndex: sourceIndex,
      variant: "single",
      variantIndex: 0,
      sourceIndex,
      role: "fallback-swatch"
    }));
  }

  function getPaletteRecords() {
    let raw;
    if (!isGeneratedPaletteMode()) state.paletteSelectionTrace = null;
    if (config.paletteMode === "manual") raw = manualPalette();
    else if (config.paletteMode === "preset") raw = presetPalette();
    else if (config.paletteMode === "harmony") raw = harmonyPalette();
    else if (config.paletteMode === "cosine") raw = cosinePalette();
    else raw = generatedPalette({captureTrace: true});
    const records = raw.length ? raw : fallbackPaletteRecords();
    return sortPaletteRecords(applyPaletteAdjustments(records), config.sortMode);
  }

  function getPalette() {
    return paletteLabs(getPaletteRecords());
  }

  return {
    manualPresetName,
    presetExists,
    presetColors,
    presetSize,
    generatedFamilyCount,
    syncGeneratedLocks,
    activeGeneratedLocks,
    manualPalette,
    isGeneratedPaletteMode,
    activePaletteImageData,
    activePaletteImageLabel,
    activePaletteRegionRect,
    generatedSourceKey,
    paletteUniformEntries,
    preprocessPaletteEntries,
    fallbackPaletteRecords,
    getPaletteRecords,
    getPalette
  };
}
