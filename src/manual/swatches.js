import {
  normalizeHexColor,
  normalizeOptionalHexColor,
  normalizeManualLab,
  hexToLab,
  labDistance,
  labToHex
} from "../color-utils.js";
import { normalizeCycleManualKeys, normalizeManualSwatches } from "../state/config.js";
import { createManualSwatchId, manualCycleKeyForId } from "./ids.js";

const MAX_MANUAL_SWATCHES = 42;

export function createManualSwatch(color = "#eeeeee", aliasHex = null, seed = "swatch", locked = false, lab = null) {
  const hex = normalizeHexColor(color, "#111111");
  const exactLab = normalizeManualLab(lab);
  const swatch = {
    id: createManualSwatchId(seed),
    hex,
    aliasHex: normalizeOptionalHexColor(aliasHex),
    locked: !!locked
  };
  if (exactLab && normalizeHexColor(labToHex(exactLab), "") === hex) {
    swatch.lab = exactLab;
    swatch.colorSpace = "oklab-scaled";
  }
  return swatch;
}

export function normalizeCapturedPaletteEntry(entry) {
  const objectEntry = entry && typeof entry === "object" && !Array.isArray(entry);
  const exactLab = objectEntry ? normalizeManualLab(entry.lab ?? entry.sourceLab) : null;
  const labHex = exactLab ? labToHex(exactLab) : "";
  const rawHex = objectEntry ? (entry.hex ?? entry.color ?? entry.value ?? labHex) : entry;
  const hex = normalizeHexColor(rawHex, labHex || "");
  if (!hex) return null;
  return {
    hex,
    lab: exactLab && normalizeHexColor(labHex, "") === hex ? exactLab : null
  };
}

export function manualSwatchesFromColors(colors, seed = "swatch") {
  return (Array.isArray(colors) ? colors : [])
    .slice(0, MAX_MANUAL_SWATCHES)
    .map((color, index) => {
      const entry = normalizeCapturedPaletteEntry(color);
      return entry ? createManualSwatch(entry.hex, null, `${seed}-${index + 1}`, false, entry.lab) : null;
    })
    .filter(Boolean);
}

export function syncManualSwatches(config) {
  if (!config) return [];
  config.manualPalette = normalizeManualSwatches(config.manualPalette, config.manualMatchAliases);
  config.manualMatchAliases = [];
  return config.manualPalette;
}

export function manualSwatchIndex(config, identifier) {
  const swatches = syncManualSwatches(config);
  if (Number.isInteger(identifier)) return identifier >= 0 && identifier < swatches.length ? identifier : -1;
  const id = String(identifier || "");
  return swatches.findIndex(swatch => swatch.id === id || manualCycleKeyForId(swatch.id) === id);
}

export function manualSwatchAt(config, identifier) {
  const index = manualSwatchIndex(config, identifier);
  return index >= 0 ? config.manualPalette[index] : null;
}

export function manualSwatchIndexForId(config, id) {
  return manualSwatchIndex(config, id);
}

export function manualSourceHex(config, identifier) {
  const swatch = manualSwatchAt(config, identifier);
  return normalizeHexColor(swatch?.hex, "#111111");
}

export function manualSwatchLab(swatch) {
  const hex = normalizeHexColor(swatch?.hex, "#111111");
  const exactLab = normalizeManualLab(swatch?.lab);
  if (exactLab && normalizeHexColor(labToHex(exactLab), "") === hex) return exactLab;
  return hexToLab(hex);
}

export function manualMatchAliasHex(config, identifier) {
  return manualSwatchAt(config, identifier)?.aliasHex || null;
}

export function setManualMatchAlias(config, identifier, color) {
  const index = manualSwatchIndex(config, identifier);
  if (index < 0) return null;
  const swatch = config.manualPalette[index];
  swatch.aliasHex = color ? normalizeHexColor(color, manualSourceHex(config, index)) : null;
  config.manualPalette[index] = swatch;
  return swatch;
}

export function insertManualSwatchAfter(config, index, color, aliasHex = null, seed = "copy") {
  const swatches = syncManualSwatches(config);
  if (swatches.length >= MAX_MANUAL_SWATCHES) return null;
  const insertAt = Math.max(0, Math.min(swatches.length, Math.round(Number(index) || 0) + 1));
  const swatch = createManualSwatch(color, aliasHex, seed);
  swatches.splice(insertAt, 0, swatch);
  config.manualPalette = swatches;
  return swatch;
}

export function removeManualSwatchAt(config, index) {
  const swatches = syncManualSwatches(config);
  if (swatches.length <= 1 || index < 0 || index >= swatches.length) return null;
  swatches.splice(index, 1);
  config.manualPalette = swatches;
  config.cycleManualKeys = normalizeCycleManualKeys(config.cycleManualKeys, swatches);
  return swatches[Math.min(index, swatches.length - 1)] || null;
}

export function manualSwatchEditable(config, record) {
  return config?.paletteMode === "manual"
    && !!record
    && record.source === "manual"
    && !!record.swatchId
    && manualSwatchIndexForId(config, record.swatchId) >= 0;
}

export function paletteRecordForManualSwatchId(swatchId, records = []) {
  return (records || []).find(record => record?.source === "manual" && record.swatchId === swatchId) || null;
}

export function paletteRecordForManualSourceIndex(config, index, records = []) {
  const swatch = manualSwatchAt(config, index);
  return swatch ? paletteRecordForManualSwatchId(swatch.id, records) : null;
}

export function activeManualMatchAliasCount(config, records = []) {
  if (config?.paletteMode !== "manual") return 0;
  return (records || []).reduce((count, record) => {
    if (!manualSwatchEditable(config, record)) return count;
    let next = count;
    if (manualMatchAliasHex(config, record.swatchId ?? record.sourceIndex)) next += 1;
    if (config.aliasAllSources && Array.isArray(record.sourceLab) && Array.isArray(record.lab) && labDistance(record.sourceLab, record.lab) >= 0.1) next += 1;
    return next;
  }, 0);
}

export function createManualSwatchModel({getConfig, getRecords = () => [], onAliasChange = null} = {}) {
  const config = () => getConfig?.() || {};
  const records = fallback => fallback === undefined ? (getRecords?.() ?? []) : fallback;

  return {
    syncManualSwatches: () => syncManualSwatches(config()),
    manualSwatchIndex: identifier => manualSwatchIndex(config(), identifier),
    manualSwatchAt: identifier => manualSwatchAt(config(), identifier),
    manualSwatchIndexForId: id => manualSwatchIndexForId(config(), id),
    manualSourceHex: identifier => manualSourceHex(config(), identifier),
    manualSwatchLab,
    manualMatchAliasHex: identifier => manualMatchAliasHex(config(), identifier),
    setManualMatchAlias: (identifier, color) => {
      const swatch = setManualMatchAlias(config(), identifier, color);
      if (swatch && typeof onAliasChange === "function") onAliasChange();
      return swatch;
    },
    insertManualSwatchAfter: (index, color, aliasHex = null, seed = "copy") => insertManualSwatchAfter(config(), index, color, aliasHex, seed),
    removeManualSwatchAt: index => removeManualSwatchAt(config(), index),
    manualSwatchEditable: record => manualSwatchEditable(config(), record),
    paletteRecordForManualSwatchId: (swatchId, inputRecords = undefined) => paletteRecordForManualSwatchId(swatchId, records(inputRecords)),
    activeManualMatchAliasCount: (inputRecords = undefined) => activeManualMatchAliasCount(config(), records(inputRecords))
  };
}
