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

export function createAppInitializer({
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
  bindCycleMaskControls,
  syncCycleMaskUi,
  renderManualSwatches,
  viewportController,
  compareSplitController,
  paletteRegionController,
  cycleMaskController,
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
}) {
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
    syncCycleMaskUi?.();
    renderManualSwatches();
    els.canvas.classList.toggle("pixel-perfect", config.pixelPerfect);

    bindCycleMaskControls?.();

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
      cycleMask: cycleMaskController,
      diagnosticsPanelIsOpen,
      pixelInspectorPanelIsOpen,
      inspectDiagnosticPixel
    });

    initWorkbench({queueRender, updateDiagnostics, resetPanelControls, panelHasResettableControls});
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
      loadFile,
      loadReferenceFile,
      downloadCanvas,
      downloadFullImage,
      exportPalette,
      copyCurrentPaletteHexStrings,
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
