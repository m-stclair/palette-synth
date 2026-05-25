import { collectUiElements } from "../ui/dom.js";
import { bindAnimationExportControls, bindAppControls, bindControls, bindRecipeControls } from "../ui/controls.js";
import { bindCanvasInteractions } from "../ui/canvas-interactions.js";
import { bindFloatingPixelInspector } from "../ui/floating-pixel-inspector.js";
import { initWorkbench } from "../ui/workbench.js";
import { bindDismissibleMenus } from "../ui/dismissible-menus.js";
import { bindRangeScrubSkinHold } from "../ui/range-scrub-skin-hold.js";
import { createRecipeController } from "../recipes/controller.js";
import { createWebgl2Context as defaultCreateWebgl2Context } from "../gl/context.js";

function controlValue(el) {
  if (el.type === "checkbox") return !!el.checked;
  if (el.type === "number" || el.type === "range") return Number(el.value);
  return el.value;
}

function nestedSurface(primary, fallback = {}) {
  return primary || fallback || {};
}

function initializerDepsFromGrouped(deps) {
  if (!deps || !deps.core) {
    throw new Error("createAppInitializer requires grouped app dependencies with a core object");
  }
  const core = deps.core || {};
  const env = deps.env || core.env || {};
  const startup = deps.startup || {};
  const history = deps.history || {};
  const render = deps.render || {};
  const palette = deps.palette || {};
  const cyclePreview = deps.cyclePreview || {};
  const manual = deps.manual || {};
  const view = deps.view || {};
  const diagnostics = deps.diagnostics || {};
  const diagnosticsController = nestedSurface(diagnostics.controller, diagnostics);
  const files = deps.files || {};
  const exporting = deps.exporting || {};
  const animationExport = nestedSurface(exporting.animation, exporting);
  const exportActions = nestedSurface(exporting.actions, exporting);
  const appActions = deps.appActions || {};
  const configActions = nestedSurface(appActions.config, appActions);
  const manualPaletteActions = nestedSurface(appActions.manualPalette, appActions);
  const randomizerActions = nestedSurface(appActions.randomizer, appActions);
  const resetActions = nestedSurface(appActions.reset, appActions);
  const conditionalPanelsActions = nestedSurface(appActions.conditionalPanels, appActions);
  const status = deps.status || {};

  return {
    els: core.els,
    state: core.state,
    config: core.config,
    root: startup.root || env.document || globalThis.document,
    windowRef: startup.windowRef || env.window || globalThis.window,
    clamp: startup.clamp,
    createWebgl2Context: startup.createWebgl2Context || defaultCreateWebgl2Context,

    normalizedCycleOffset: palette.normalizedCycleOffset,
    manualCycleModeEnabled: palette.manualCycleModeEnabled,
    clearManualCycleTags: palette.clearManualCycleTags,
    clearGeneratedLocks: palette.clearGeneratedLocks,

    setOutputText: configActions.setOutputText,
    handleControlDirty: configActions.handleControlDirty,
    cloneConfigSnapshot: configActions.cloneConfigSnapshot,
    sanitizeConfigSnapshot: configActions.sanitizeConfigSnapshot,
    replaceConfigSnapshot: configActions.replaceConfigSnapshot,

    markPaletteDirty: render.markPaletteDirty,
    markTextureDirty: render.markTextureDirty,
    queueRender: render.queueRender,

    syncCycleControls: cyclePreview.syncCycleControls,
    toggleCyclePreview: cyclePreview.toggleCyclePreview,

    updateConditionalPanels: conditionalPanelsActions.updateConditionalPanels,

    beginHistory: history.beginHistory,
    commitHistory: history.commitHistory,
    pushHistorySnapshot: history.pushHistorySnapshot,
    withHistory: history.withHistory,
    bindHistoryShortcuts: history.bindHistoryShortcuts,
    updateHistoryButtons: history.updateHistoryButtons,
    undoHistory: history.undoHistory,
    redoHistory: history.redoHistory,

    setStatus: status.setStatus,
    setDiagnosticOverlay: diagnostics.setDiagnosticOverlay,
    updateDiagnostics: diagnosticsController.updateDiagnostics,
    diagnosticsPanelIsOpen: diagnosticsController.diagnosticsPanelIsOpen,
    pixelInspectorPanelIsOpen: diagnosticsController.pixelInspectorPanelIsOpen,
    setInspectorTab: diagnosticsController.setInspectorTab,
    setPixelInspectorOpen: diagnosticsController.setPixelInspectorOpen,
    togglePixelInspector: diagnosticsController.togglePixelInspector,
    refreshDiagnosticPixel: diagnosticsController.refreshDiagnosticPixel,
    clearDiagnosticPixel: diagnosticsController.clearDiagnosticPixel,
    inspectDiagnosticPixel: diagnosticsController.inspectDiagnosticPixel,
    nudgeDiagnosticPixel: diagnosticsController.nudgeDiagnosticPixel,

    animationLoopSpan: animationExport.animationLoopSpan,
    syncAnimationExportUi: animationExport.syncAnimationExportUi,
    sanitizeExportPrefix: animationExport.sanitizeExportPrefix,
    useAnimationLoopSpan: animationExport.useAnimationLoopSpan,
    exportAnimationPngZip: animationExport.exportAnimationPngZip,
    exportAnimationGif: animationExport.exportAnimationGif,

    updateReferenceImageStatus: files.updateReferenceImageStatus,
    loadReferenceFile: files.loadReferenceFile,
    loadFile: files.loadFile,
    loadDemo: files.loadDemo,

    updatePaletteRegionUi: view.updatePaletteRegionUi,
    updatePaletteRegionOverlay: view.updatePaletteRegionOverlay,
    bindMaskControls: view.bindMaskControls,
    syncMaskUi: view.syncMaskUi,
    viewportController: view.viewportController || view.viewport,
    compareSplitController: view.compareSplitController || view.compare,
    paletteRegionController: view.paletteRegionController || view.paletteRegion,
    maskController: view.maskController || view.mask,
    setCompareEnabled: view.setCompareEnabled,
    setCompareSplit: view.setCompareSplit,
    togglePaletteRegionSelection: view.togglePaletteRegionSelection,
    resetPaletteRegion: view.resetPaletteRegion,
    getDisplayViewRect: view.getDisplayViewRect,
    zoomBy: view.zoomBy,
    resetView: view.resetView,

    renderManualSwatches: manual.renderManualSwatches,

    downloadCanvas: exportActions.downloadCanvas,
    downloadFullImage: exportActions.downloadFullImage,
    exportPalette: exportActions.exportPalette,

    copyCurrentPaletteHexStrings: manualPaletteActions.copyCurrentPaletteHexStrings,
    captureCurrentPaletteToManual: manualPaletteActions.captureCurrentPaletteToManual,
    closeCapturePaletteMenu: manualPaletteActions.closeCapturePaletteMenu,
    loadPresetAsManual: manualPaletteActions.loadPresetAsManual,
    switchPalettePreset: manualPaletteActions.switchPalettePreset,
    addManualSwatch: manualPaletteActions.addManualSwatch,
    addPixelSourceToManualPalette: manualPaletteActions.addPixelSourceToManualPalette,
    copyPixelHex: deps.copyPixelHex,
    importLut: manualPaletteActions.importLut,
    openManualPaletteTextDialog: manualPaletteActions.openManualPaletteTextDialog,
    closeManualPaletteTextDialog: manualPaletteActions.closeManualPaletteTextDialog,
    importManualPaletteText: manualPaletteActions.importManualPaletteText,
    loadStoredManualPresets: manualPaletteActions.loadStoredManualPresets,
    populatePresetSelect: manualPaletteActions.populatePresetSelect,

    randomizePalette: randomizerActions.randomizePalette,

    resetSettings: resetActions.resetSettings,
    resetPanelControls: resetActions.resetPanelControls,
    panelHasResettableControls: resetActions.panelHasResettableControls
  };
}

export function createAppInitializer(deps = {}) {
  const {
    els,
    state,
    config,
    root = globalThis.document,
    windowRef = globalThis.window,
    clamp,
    createWebgl2Context = defaultCreateWebgl2Context,
    normalizedCycleOffset,
    setOutputText,
    handleControlDirty,
    manualCycleModeEnabled,
    markPaletteDirty,
    markTextureDirty,
    syncCycleControls,
    updateConditionalPanels,
    queueRender,
    beginHistory,
    commitHistory,
    cloneConfigSnapshot,
    sanitizeConfigSnapshot,
    replaceConfigSnapshot,
    pushHistorySnapshot,
    setStatus,
    setDiagnosticOverlay,
    animationLoopSpan,
    syncAnimationExportUi,
    sanitizeExportPrefix,
    useAnimationLoopSpan,
    exportAnimationPngZip,
    exportAnimationGif,
    updateReferenceImageStatus,
    updatePaletteRegionUi,
    bindMaskControls,
    syncMaskUi,
    renderManualSwatches,
    viewportController,
    compareSplitController,
    paletteRegionController,
    maskController,
    diagnosticsPanelIsOpen,
    pixelInspectorPanelIsOpen,
    setInspectorTab,
    setPixelInspectorOpen,
    togglePixelInspector,
    refreshDiagnosticPixel,
    clearDiagnosticPixel,
    inspectDiagnosticPixel,
    nudgeDiagnosticPixel,
    updateDiagnostics,
    withHistory,
    bindHistoryShortcuts,
    updateHistoryButtons,
    setCompareEnabled,
    setCompareSplit,
    loadFile,
    loadReferenceFile,
    downloadCanvas,
    downloadFullImage,
    exportPalette,
    copyCurrentPaletteHexStrings,
    randomizePalette,
    captureCurrentPaletteToManual,
    closeCapturePaletteMenu,
    loadPresetAsManual,
    switchPalettePreset,
    addManualSwatch,
    addPixelSourceToManualPalette,
    copyPixelHex,
    importLut,
    openManualPaletteTextDialog,
    closeManualPaletteTextDialog,
    importManualPaletteText,
    clearManualCycleTags,
    clearGeneratedLocks,
    togglePaletteRegionSelection,
    resetPaletteRegion,
    updatePaletteRegionOverlay,
    toggleCyclePreview,
    getDisplayViewRect,
    zoomBy,
    resetView,
    undoHistory,
    redoHistory,
    resetSettings,
    resetPanelControls,
    panelHasResettableControls,
    loadStoredManualPresets,
    populatePresetSelect,
    loadDemo
  } = initializerDepsFromGrouped(deps);
  function init() {
    collectUiElements(els, undefined, root);
    let gl;
    try {
      gl = createWebgl2Context(els.canvas, "WebGL2 is required for Palette Synth.");
    } catch (err) {
      els.error.hidden = false;
      els.error.textContent = err.message;
      return;
    }
    state.gl = gl;

    loadStoredManualPresets();
    populatePresetSelect();

    bindControls({
      els,
      config,
      state,
      controlValue,
      normalizedCycleOffset,
      setOutputText,
      handleControlDirty,
      manualCycleModeEnabled,
      markPaletteDirty,
      syncCycleControls,
      updateConditionalPanels,
      queueRender,
      beginHistory,
      commitHistory
    });

    const recipeController = createRecipeController({
      els,
      state,
      cloneConfigSnapshot,
      sanitizeConfigSnapshot,
      replaceConfigSnapshot,
      pushHistorySnapshot,
      setStatus
    });
    bindRecipeControls({
      els,
      ...recipeController
    });

    bindAnimationExportControls({
      els,
      state,
      clamp,
      animationLoopSpan,
      syncAnimationExportUi,
      sanitizeExportPrefix,
      useAnimationLoopSpan,
      exportAnimationPngZip,
      exportAnimationGif
    });

    updateConditionalPanels();
    updateReferenceImageStatus();
    updatePaletteRegionUi();
    syncMaskUi?.();
    renderManualSwatches();
    els.canvas.classList.toggle("pixel-perfect", config.pixelPerfect);

    bindMaskControls?.();

    bindFloatingPixelInspector({
      els,
      state,
      config,
      setPixelInspectorOpen,
      togglePixelInspector,
      setInspectorTab,
      refreshDiagnosticPixel,
      clearDiagnosticPixel,
      copyPixelHex,
      setStatus
    });

    bindCanvasInteractions({
      canvas: els.canvas,
      state,
      viewport: viewportController,
      compareSplit: compareSplitController,
      paletteRegion: paletteRegionController,
      mask: maskController,
      diagnosticsPanelIsOpen,
      pixelInspectorPanelIsOpen,
      inspectDiagnosticPixel
    });

    initWorkbench({
      queueRender,
      invalidateCanvasRenderSize: viewportController.invalidateCanvasRenderSize,
      updateDiagnostics,
      resetPanelControls,
      panelHasResettableControls
    });
    bindDismissibleMenus({root});
    bindRangeScrubSkinHold({root, windowRef});
    viewportController.updateViewStatus();
    if (els.pixelPerfectToggle) els.pixelPerfectToggle.checked = !!config.pixelPerfect;

    bindAppControls({
      els,
      config,
      state,
      withHistory,
      beginHistory,
      commitHistory,
      bindHistoryShortcuts,
      updateHistoryButtons,
      setOutputText,
      handleControlDirty,
      updateConditionalPanels,
      normalizedCycleOffset,
      manualCycleModeEnabled,
      setCompareEnabled,
      setCompareSplit,
      syncCycleControls,
      queueRender,
      invalidateCanvasRenderSize: viewportController.invalidateCanvasRenderSize,
      loadFile,
      loadReferenceFile,
      loadDemo,
      downloadCanvas,
      downloadFullImage,
      exportPalette,
      copyCurrentPaletteHexStrings,
      randomizePalette,
      captureCurrentPaletteToManual,
      closeCapturePaletteMenu,
      loadPresetAsManual,
      switchPalettePreset,
      addManualSwatch,
      addPixelSourceToManualPalette,
      copyPixelHex,
      setPixelInspectorOpen,
      togglePixelInspector,
      setInspectorTab,
      clearDiagnosticPixel,
      nudgeDiagnosticPixel,
      pixelInspectorPanelIsOpen,
      importLut,
      openManualPaletteTextDialog,
      closeManualPaletteTextDialog,
      importManualPaletteText,
      clearManualCycleTags,
      clearGeneratedLocks,
      togglePaletteRegionSelection,
      resetPaletteRegion,
      updatePaletteRegionUi,
      updatePaletteRegionOverlay,
      setStatus,
      toggleCyclePreview,
      getDisplayViewRect,
      zoomBy,
      resetView,
      cloneConfigSnapshot,
      replaceConfigSnapshot,
      markTextureDirty,
      markPaletteDirty,
      undoHistory,
      redoHistory,
      resetSettings,
      setDiagnosticOverlay,
      updateDiagnostics
    });

    loadDemo();
  }

  return {init};
}
