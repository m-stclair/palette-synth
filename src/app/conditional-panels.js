export function createConditionalPanelsController({
  config,
  state,
  els,
  root = globalThis.document,
  manualCycleModeEnabled,
  cancelPaletteRegionDrag,
  closeManualPaletteEditor,
  updateGeneratedLockUi,
  updateCapturePaletteUi,
  syncCycleControls,
  updatePaletteRegionUi,
  updatePaletteRegionOverlay
}) {
  function updateConditionalPanels() {
    if (config.paletteMode === "preset") config.paletteMode = "manual";
    if (config.paletteMode !== "generated" && (state.paletteRegion.enabled || state.paletteRegion.dragging)) {
      cancelPaletteRegionDrag({announce: false});
    }
    if (els.paletteMode && els.paletteMode.value !== config.paletteMode) els.paletteMode.value = config.paletteMode;
    root.body.dataset.paletteMode = config.paletteMode;
    if (config.cosinePreset) root.body.dataset.cosinePreset = config.cosinePreset;
    else delete root.body.dataset.cosinePreset;
    root.body.dataset.assignMode = config.assignMode;
    root.body.dataset.outputMode = config.outputMode;
    if (config.paletteMode !== "manual" || manualCycleModeEnabled()) closeManualPaletteEditor();
    updateGeneratedLockUi();
    updateCapturePaletteUi();
    syncCycleControls();
    updatePaletteRegionUi();
    updatePaletteRegionOverlay();
  }

  return {updateConditionalPanels};
}
