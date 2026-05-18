import { paletteLabs, positiveMod, gcdInt } from "../color-utils.js";
import { normalizeCycleManualKeys } from "../state/config.js";

export function cycleModeValue(config) {
  return String(config?.CYCLE_MODE);
}

export function manualCycleModeEnabled(config) {
  return cycleModeValue(config) === "manual";
}

export function syncCycleManualKeys(config, swatches = config?.manualPalette || []) {
  if (!config) return [];
  config.cycleManualKeys = normalizeCycleManualKeys(config.cycleManualKeys, swatches);
  return config.cycleManualKeys;
}

export function manualCycleKeySet(config, swatches = config?.manualPalette || []) {
  return new Set(syncCycleManualKeys(config, swatches));
}

export function cycleTaggable(config, record) {
  return manualCycleModeEnabled(config) && !!record?.cycleKey;
}

export function cycleTagged(config, record, swatches = config?.manualPalette || []) {
  return cycleTaggable(config, record) && manualCycleKeySet(config, swatches).has(record.cycleKey);
}

export function manualCycleIndices(config, records = [], keySet = manualCycleKeySet(config)) {
  const indices = [];
  const safeRecords = Array.isArray(records) ? records : [];
  safeRecords.forEach((record, index) => {
    if (record?.cycleKey && keySet.has(record.cycleKey)) indices.push(index);
  });
  return indices;
}

export function automaticCyclePeriod(config, length) {
  const n = Math.max(0, Math.round(length));
  if (n <= 1) return 1;
  const mode = Number(config?.CYCLE_MODE);
  const lcm = (a, b) => !a || !b ? Math.max(a, b) : Math.abs(a * b) / gcdInt(a, b);
  if (mode === 0) return n;
  const lowEnd = Math.floor(n / 3);
  const highStart = Math.floor((2 * n) / 3);
  if (mode === 1) {
    const lengths = [lowEnd, highStart - lowEnd, n - highStart].filter(v => v > 1);
    return lengths.reduce((acc, value) => acc ? lcm(acc, value) : value, 1) || 1;
  }
  if (mode === 2) return Math.max(1, highStart - lowEnd);
  if (mode === 3) return Math.max(1, n - highStart);
  if (mode === 4) return Math.max(1, lowEnd);
  return n;
}

export function cyclePeriod(config, records = [], swatches = config?.manualPalette || []) {
  const safeRecords = Array.isArray(records) ? records : [];
  if (manualCycleModeEnabled(config)) {
    return Math.max(1, manualCycleIndices(config, safeRecords, manualCycleKeySet(config, swatches)).length);
  }
  return automaticCyclePeriod(config, safeRecords.length);
}

export function normalizedCycleOffset(config, offset = config?.cycleOffset, records = [], swatches = config?.manualPalette || []) {
  const period = cyclePeriod(config, records, swatches);
  if (period <= 1) return 0;
  return positiveMod(Math.round(offset), period);
}

export function applyManualCycle(config, records = [], offset = config?.cycleOffset, swatches = config?.manualPalette || []) {
  const safeRecords = Array.isArray(records) ? records : [];
  const base = paletteLabs(safeRecords);
  const tagged = manualCycleIndices(config, safeRecords, manualCycleKeySet(config, swatches));
  if (tagged.length <= 1) return base;
  const out = base.map(lab => [...lab]);
  const shift = positiveMod(Math.round(offset), tagged.length);
  if (shift === 0) return out;
  for (let i = 0; i < tagged.length; i++) {
    const targetIndex = tagged[i];
    const sourceIndex = tagged[(i + shift) % tagged.length];
    out[targetIndex] = [...base[sourceIndex]];
  }
  return out;
}

export function renderPaletteLabs(config, records = [], swatches = config?.manualPalette || []) {
  if (manualCycleModeEnabled(config)) return applyManualCycle(config, records, config?.cycleOffset, swatches);
  return paletteLabs(Array.isArray(records) ? records : []);
}

export function createPaletteCycle({getConfig, getRecords = () => [], syncManualSwatches = null} = {}) {
  const config = () => getConfig?.() || {};
  const records = fallback => fallback === undefined ? (getRecords?.() ?? []) : fallback;
  const swatches = () => syncManualSwatches?.() ?? config().manualPalette ?? [];

  return {
    cycleModeValue: () => cycleModeValue(config()),
    manualCycleModeEnabled: () => manualCycleModeEnabled(config()),
    syncCycleManualKeys: () => syncCycleManualKeys(config(), swatches()),
    manualCycleKeySet: () => manualCycleKeySet(config(), swatches()),
    cycleTaggable: record => cycleTaggable(config(), record),
    cycleTagged: record => cycleTagged(config(), record, swatches()),
    manualCycleIndices: (inputRecords, keySet = undefined) => {
      const cfg = config();
      const manualKeys = keySet ?? manualCycleKeySet(cfg, swatches());
      return manualCycleIndices(cfg, records(inputRecords), manualKeys);
    },
    automaticCyclePeriod: length => automaticCyclePeriod(config(), length),
    cyclePeriod: inputRecords => cyclePeriod(config(), records(inputRecords), swatches()),
    normalizedCycleOffset: (offset = config().cycleOffset, inputRecords = undefined) => normalizedCycleOffset(config(), offset, records(inputRecords), swatches()),
    applyManualCycle: (inputRecords = undefined, offset = config().cycleOffset) => applyManualCycle(config(), records(inputRecords), offset, swatches()),
    renderPaletteLabs: (inputRecords = undefined) => renderPaletteLabs(config(), records(inputRecords), swatches())
  };
}
