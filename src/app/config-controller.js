import { $, SELECT_WEIGHT_CONTROL_IDS } from "../ui/dom.js";
import { syncCosineCustomVectorControls, syncGeneratedPaletteSizeControl } from "../ui/controls.js";
import { syncColorPickerInput } from "../ui/color-picker.js";
import { syncPaletteSwatchScaleUi } from "../ui/palette-swatch-scale.js";
import {
  cloneConfigSnapshot as cloneConfigSnapshotFrom,
  sanitizeConfigSnapshot as sanitizeConfigSnapshotBase
} from "../state/config.js";

export const PALETTE_DIRTY_KEYS = new Set([
  "paletteMode", "presetName", "paletteSize", "seedSwatch", "harmonyRelationship", "harmonyRegionContrast", "harmonyRampSteepness", "cosinePreset", "cosineCustomVectors", "deltaL", "paletteGamma", "gammaC", "paletteHue", "tonalZoneWeight", "widthBonus", "hueSpread", "minDistance",
  "sortMode", "blockSize", "seed", "samplingMode", "generatedAssist", "generatedTintShadeFamilies", "aliasAllSources", "manualMatchAliases", "CYCLE_MODE"
]);

export const TEXTURE_DIRTY_KEYS = new Set(["pixelPerfect"]);

export const LEVELS_DIRTY_KEYS = new Set([
  "levelsExposure", "levelsGamma", "levelsShoulder", "levelsCenter", "levelsCurveAmount", "clarityAmount"
]);

export const UI_SKIN_DIRTY_KEYS = new Set(["dynamicSkin"]);

export function createConfigController({
  config,
  els,
  state,
  root = globalThis.document,
  presetExists,
  stopCyclePreview,
  cancelPendingHistory,
  closeManualPaletteEditor,
  markEverythingDirty,
  markLevelsDirty,
  markPaletteDirty,
  markTextureDirty,
  queueRender,
  renderManualSwatches,
  updateConditionalPanels,
  updatePaletteRegionUi,
  updatePaletteRegionOverlay,
  syncCycleControls,
  updateViewStatus,
  updateHistoryButtons,
  syncCompareControls
}) {
  if (!config) throw new Error("createConfigController requires config.");
  if (!els) throw new Error("createConfigController requires els.");
  if (!state) throw new Error("createConfigController requires state.");

  const byId = id => $(id, root);
  const noop = () => {};
  const safePresetExists = typeof presetExists === "function" ? presetExists : () => false;
  const safeStopCyclePreview = typeof stopCyclePreview === "function" ? stopCyclePreview : noop;
  const safeCancelPendingHistory = typeof cancelPendingHistory === "function" ? cancelPendingHistory : noop;
  const safeCloseManualPaletteEditor = typeof closeManualPaletteEditor === "function" ? closeManualPaletteEditor : noop;
  const safeMarkEverythingDirty = typeof markEverythingDirty === "function" ? markEverythingDirty : noop;
  const safeMarkLevelsDirty = typeof markLevelsDirty === "function" ? markLevelsDirty : noop;
  const safeMarkPaletteDirty = typeof markPaletteDirty === "function" ? markPaletteDirty : noop;
  const safeMarkTextureDirty = typeof markTextureDirty === "function" ? markTextureDirty : noop;
  const safeQueueRender = typeof queueRender === "function" ? queueRender : noop;
  const safeRenderManualSwatches = typeof renderManualSwatches === "function" ? renderManualSwatches : noop;
  const safeUpdateConditionalPanels = typeof updateConditionalPanels === "function" ? updateConditionalPanels : noop;
  const safeUpdatePaletteRegionUi = typeof updatePaletteRegionUi === "function" ? updatePaletteRegionUi : noop;
  const safeUpdatePaletteRegionOverlay = typeof updatePaletteRegionOverlay === "function" ? updatePaletteRegionOverlay : noop;
  const safeSyncCycleControls = typeof syncCycleControls === "function" ? syncCycleControls : noop;
  const safeUpdateViewStatus = typeof updateViewStatus === "function" ? updateViewStatus : noop;
  const safeUpdateHistoryButtons = typeof updateHistoryButtons === "function" ? updateHistoryButtons : noop;
  const safeSyncCompareControls = typeof syncCompareControls === "function" ? syncCompareControls : noop;

  function cloneConfigSnapshot() {
    return cloneConfigSnapshotFrom(config);
  }

  function sanitizeConfigSnapshot(raw = {}) {
    return sanitizeConfigSnapshotBase(raw, {presetExists: safePresetExists});
  }

  function replaceConfigSnapshot(snapshot, {cancelPendingHistory: shouldCancelPendingHistory = true} = {}) {
    const clean = sanitizeConfigSnapshot(snapshot);
    safeStopCyclePreview();
    if (shouldCancelPendingHistory) safeCancelPendingHistory();
    Object.keys(config).forEach(key => delete config[key]);
    Object.assign(config, clean);
    syncControlsFromConfig();
    safeCloseManualPaletteEditor();
    safeMarkEverythingDirty();
    safeQueueRender();
  }

  function setOutputText(key, out, value = config[key]) {
    if (!out) return;
    if (key === "cyclePreviewSpeed") out.textContent = `${Number(value).toFixed(1)} steps/s`;
    else if (key === "harmonyRampSteepness") out.textContent = `${Number(value).toFixed(2)}×`;
    else out.textContent = String(value);
  }

  function syncControlsFromConfig() {
    for (const key of Object.keys(config)) {
      const el = byId(key);
      if (!el) continue;
      if (el.type === "checkbox") el.checked = !!config[key];
      else if (!Array.isArray(config[key])) el.value = config[key];
      syncColorPickerInput(el);
      setOutputText(key, byId(`${key}Value`), Array.isArray(config[key]) ? el.value : config[key]);
    }
    syncGeneratedPaletteSizeControl(config, {root, setOutputText});
    syncCosineCustomVectorControls(config, root);
    SELECT_WEIGHT_CONTROL_IDS.forEach((id, i) => {
      const el = byId(id);
      if (!el) return;
      el.value = config.selectWeights[i];
      const out = byId(`${id}Value`);
      if (out) out.textContent = el.value;
    });
    if (els.canvas) els.canvas.classList.toggle("pixel-perfect", !!config.pixelPerfect);
    if (els.pixelPerfectToggle) els.pixelPerfectToggle.checked = !!config.pixelPerfect;
    syncPaletteSwatchScaleUi({config, els, root});
    safeSyncCompareControls();
    if (els.showPaletteRegion) els.showPaletteRegion.checked = !!config.showPaletteRegion;
    safeRenderManualSwatches();
    safeUpdateConditionalPanels();
    safeUpdatePaletteRegionUi();
    safeUpdatePaletteRegionOverlay();
    safeSyncCycleControls();
    safeUpdateViewStatus();
    safeUpdateHistoryButtons();
  }

  function handleControlDirty(key) {
    if (LEVELS_DIRTY_KEYS.has(key)) safeMarkLevelsDirty();
    if (PALETTE_DIRTY_KEYS.has(key)) safeMarkPaletteDirty();
    if (TEXTURE_DIRTY_KEYS.has(key)) safeMarkTextureDirty();
    if (UI_SKIN_DIRTY_KEYS.has(key)) state.swatchesDirty = true;
  }

  return {
    cloneConfigSnapshot,
    sanitizeConfigSnapshot,
    replaceConfigSnapshot,
    setOutputText,
    syncControlsFromConfig,
    handleControlDirty
  };
}
