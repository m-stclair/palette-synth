import { createConfigController } from "../config-controller.js";
import { createConditionalPanelsController } from "../conditional-panels.js";
import { createRandomizerController } from "../randomizer.js";
import { createResetController } from "../reset-controller.js";
import { createManualPaletteActions } from "../../manual/manual-palette-actions.js";

export function createAppActionsDomain({
  els,
  state,
  config,
  root,
  env = {},
  ports,
  history,
  manual,
  palette,
  view,
  render,
  exporting,
  setStatus
}) {
  const {window, Image, URL} = env;

  const configController = createConfigController({
    config,
    els,
    state,
    root,
    presetExists: palette.presetExists,
    stopCyclePreview: ports.cyclePreviewActions.stopCyclePreview,
    cancelPendingHistory: history.cancelPendingHistory,
    closeManualPaletteEditor: manual.closeManualPaletteEditor,
    markEverythingDirty: render.markEverythingDirty,
    markLevelsDirty: render.markLevelsDirty,
    markPaletteDirty: render.markPaletteDirty,
    markTextureDirty: render.markTextureDirty,
    queueRender: render.queueRender,
    renderManualSwatches: manual.renderManualSwatches,
    updateConditionalPanels: ports.conditionalPanelsActions.updateConditionalPanels,
    updatePaletteRegionUi: view.updatePaletteRegionUi,
    updatePaletteRegionOverlay: view.updatePaletteRegionOverlay,
    syncCycleControls: ports.cyclePreviewActions.syncCycleControls,
    updateViewStatus: view.updateViewStatus,
    updateHistoryButtons: history.updateHistoryButtons,
    syncCompareControls: view.syncCompareControls
  });
  ports.config.attach(configController);

  const manualPaletteActions = createManualPaletteActions({
    els,
    state,
    config,
    root,
    window,
    Image,
    URL,
    cloneConfigSnapshot: configController.cloneConfigSnapshot,
    pushHistorySnapshot: history.pushHistorySnapshot,
    withHistory: history.withHistory,
    presetExists: palette.presetExists,
    presetColors: palette.presetColors,
    presetSize: palette.presetSize,
    manualPresetName: palette.manualPresetName,
    activePaletteImageData: palette.activePaletteImageData,
    activePaletteRegionRect: palette.activePaletteRegionRect,
    getPaletteRecords: palette.getPaletteRecords,
    syncManualSwatches: manual.syncManualSwatches,
    renderManualSwatches: manual.renderManualSwatches,
    markPaletteDirty: render.markPaletteDirty,
    updateConditionalPanels: ports.conditionalPanelsActions.updateConditionalPanels,
    queueRender: render.queueRender,
    setStatus,
    setOutputText: configController.setOutputText
  });

  const randomizerController = createRandomizerController({
    config,
    cloneConfigSnapshot: configController.cloneConfigSnapshot,
    replaceConfigSnapshot: configController.replaceConfigSnapshot,
    withHistory: history.withHistory,
    setStatus
  });

  const conditionalPanelsController = createConditionalPanelsController({
    config,
    state,
    els,
    root,
    manualCycleModeEnabled: palette.manualCycleModeEnabled,
    cancelPaletteRegionDrag: ports.paletteRegionActions.cancelPaletteRegionDrag,
    closeManualPaletteEditor: manual.closeManualPaletteEditor,
    updateGeneratedLockUi: palette.updateGeneratedLockUi,
    updateCapturePaletteUi: manualPaletteActions.updateCapturePaletteUi,
    syncCycleControls: ports.cyclePreviewActions.syncCycleControls,
    updatePaletteRegionUi: view.updatePaletteRegionUi,
    updatePaletteRegionOverlay: view.updatePaletteRegionOverlay
  });
  ports.conditionalPanels.attach(conditionalPanelsController);

  const resetController = createResetController({
    state,
    config,
    replaceConfigSnapshot: configController.replaceConfigSnapshot,
    resetView: view.resetView,
    resetPaletteRegion: view.resetPaletteRegion,
    syncAnimationExportUi: exporting.syncAnimationExportUi,
    setStatus
  });
  ports.reset.attach(resetController);

  function resetPanelControls(panel, options = {}) {
    const label = options.label || "panel";
    return history.withHistory(`Reset ${label} controls`, () => resetController.resetPanelControls(panel, options));
  }

  const reset = {
    resetSettings: resetController.resetSettings,
    resetPanelControls,
    panelHasResettableControls: resetController.panelHasResettableControls
  };

  return {
    config: configController,
    manualPalette: manualPaletteActions,
    randomizer: randomizerController,
    conditionalPanels: conditionalPanelsController,
    reset,

    configController,
    manualPaletteActions,
    randomizerController,
    conditionalPanelsController,
    resetController,

    ...configController,
    ...manualPaletteActions,
    ...randomizerController,
    updateConditionalPanels: conditionalPanelsController.updateConditionalPanels,
    ...reset
  };
}
