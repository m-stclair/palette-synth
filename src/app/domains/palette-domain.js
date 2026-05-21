import { createPaletteCycle } from "../../palette/cycle.js";
import { createPaletteRuntime } from "../../palette/runtime.js";
import { createPalettePreview } from "../../ui/palette-preview.js";

export function createPaletteDomain({
  els,
  state,
  config,
  manual,
  history = {},
  render = {},
  cyclePreviewActions = {},
  diagnosticsActions = {},
  copyPaletteHex,
  setStatus
}) {
  const {
    syncManualSwatches,
    manualSwatchLab,
    manualSwatchEditable,
    manualMatchAliasHex,
    manualSourceHex,
    activeManualMatchAliasCount,
    syncManualPaletteEditor,
    openManualPaletteEditor
  } = manual;
  const {withHistory} = history;
  const {
    markPaletteDirty = () => {},
    queueRender = () => {}
  } = render;
  const {syncCycleControls = () => {}} = cyclePreviewActions;
  const {setDiagnosticOverlay = () => {}} = diagnosticsActions;

  const cycle = createPaletteCycle({
    getConfig: () => config,
    getRecords: () => state.paletteRecords,
    syncManualSwatches: () => syncManualSwatches()
  });

  const runtime = createPaletteRuntime({
    config,
    state,
    syncManualSwatches,
    manualSwatchLab,
    manualSwatchEditable,
    manualMatchAliasHex
  });

  const preview = createPalettePreview({
    els,
    config,
    state,
    syncGeneratedLocks: runtime.syncGeneratedLocks,
    activeGeneratedLocks: runtime.activeGeneratedLocks,
    generatedFamilyCount: runtime.generatedFamilyCount,
    isGeneratedPaletteMode: runtime.isGeneratedPaletteMode,
    activePaletteImageData: runtime.activePaletteImageData,
    activePaletteImageLabel: runtime.activePaletteImageLabel,
    manualCycleModeEnabled: cycle.manualCycleModeEnabled,
    syncCycleManualKeys: cycle.syncCycleManualKeys,
    cycleTaggable: cycle.cycleTaggable,
    cycleTagged: cycle.cycleTagged,
    manualCycleIndices: cycle.manualCycleIndices,
    manualSwatchEditable,
    manualMatchAliasHex,
    manualSourceHex,
    activeManualMatchAliasCount,
    withHistory,
    markPaletteDirty,
    queueRender,
    syncCycleControls,
    syncManualPaletteEditor,
    openManualPaletteEditor,
    copyPaletteHex,
    setDiagnosticOverlay,
    setStatus
  });

  return {
    cycle,
    runtime,
    preview,
    ...cycle,
    ...runtime,
    ...preview
  };
}
