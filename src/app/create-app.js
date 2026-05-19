import {
  DEFAULT_CONFIG,
  cloneDefaultConfig
} from "../state/config.js";
import {
  clamp,
  positiveMod,
  gcdInt,
  normalizeHexColor
} from "../color-utils.js";
import {
  createManualSwatchModel
} from "../manual/swatches.js";

import { createPaletteCycle } from "../palette/cycle.js";
import { createDiagnosticMetrics } from "../diagnostics/metrics.js";
import { createDiagnosticsPanel } from "../ui/diagnostics-panel.js";
import { createCompareSplitController } from "../ui/compare-split.js";
import { createPaletteRegionController } from "../ui/palette-region.js";
import { createCycleMaskController } from "../ui/cycle-mask.js";
import { createViewportController } from "../ui/viewport.js";
import { createRenderSession } from "../runtime/render-session.js";
import { createPaletteRuntime } from "../palette/runtime.js";
import { createHistoryController } from "../state/history.js";
import { createManualPaletteEditor } from "../ui/manual-palette-editor.js";
import { createManualSwatchesList } from "../ui/manual-swatches-list.js";
import { createPalettePreview } from "../ui/palette-preview.js";
import { createRuntimeState } from "./runtime-state.js";
import { createConfigController } from "./config-controller.js";
import { createDiagnosticsController } from "../diagnostics/controller.js";
import { createImageController } from "../runtime/image-controller.js";
import { createShaderProgramController } from "../runtime/shader-programs.js";
import { createLevelSourceController } from "../runtime/level-sources.js";
import { createRenderedCanvasController } from "../export/rendered-canvas.js";
import { createAnimationExportController } from "../export/animation-controller.js";
import { createCyclePreviewController } from "../runtime/cycle-preview.js";
import { createManualPaletteActions } from "../manual/manual-palette-actions.js";
import { createResetController } from "./reset-controller.js";
import { createConditionalPanelsController } from "./conditional-panels.js";
import { createStatusController } from "./status-controller.js";
import { createAppInitializer } from "./initializer.js";
import { createExportActions } from "../export/export-actions.js";


export function createPaletteSynthApp({
  shaders = {},
  document = globalThis.document,
  window = globalThis.window,
  requestAnimationFrame = globalThis.requestAnimationFrame,
  cancelAnimationFrame = globalThis.cancelAnimationFrame,
  Image = globalThis.Image,
  URL = globalThis.URL
} = {}) {
  const FRAGMENT_SHADER_BODY = shaders.FRAGMENT_SHADER_BODY || "";
  const VERTEX_SHADER = shaders.VERTEX_SHADER || "";
  const LEVELS_FRAGMENT_SHADER = shaders.LEVELS_FRAGMENT_SHADER || "";
  const CLARITY_SHARP_FRAGMENT_SHADER = shaders.CLARITY_SHARP_FRAGMENT_SHADER || "";
  const CLARITY_FRAGMENT_SHADER = shaders.CLARITY_FRAGMENT_SHADER || "";
  const BLOCK_SAMPLE_FRAGMENT_SHADER = shaders.BLOCK_SAMPLE_FRAGMENT_SHADER || "";
  const PALETTE_POST_FRAGMENT_SHADER = shaders.PALETTE_POST_FRAGMENT_SHADER || "";
  const VIEW_COMPOSITE_FRAGMENT_SHADER = shaders.VIEW_COMPOSITE_FRAGMENT_SHADER || "";

  const state = createRuntimeState({document});

  const els = {};

  const config = cloneDefaultConfig();

  const statusController = createStatusController({els, state});

  function setStatus(text) {
    return statusController.setStatus(text);
  }

  const historyController = createHistoryController({
    els,
    state,
    getSnapshot: cloneConfigSnapshot,
    applySnapshot: replaceConfigSnapshot,
    setStatus,
    shouldCancelShortcut: () => state.paletteRegion.enabled || state.paletteRegion.dragging || ((state.mask || state.cycleMask)?.paintMode || "off") !== "off" || !!(state.mask || state.cycleMask)?.dragging,
    cancelShortcut: () => {
      if (((state.mask || state.cycleMask)?.paintMode || "off") !== "off" || (state.mask || state.cycleMask)?.dragging) {
        (state.mask || state.cycleMask).paintMode = "off";
        (state.mask || state.cycleMask).dragging = false;
        cycleMaskController?.syncCycleMaskUi?.();
        cycleMaskController?.updateCycleMaskOverlay?.();
        setStatus("Mask painting off.");
        return;
      }
      cancelPaletteRegionDrag();
    }
  });
  const {
    beginHistory,
    commitHistory,
    cancelPendingHistory,
    withHistory,
    pushHistorySnapshot,
    undoHistory,
    redoHistory,
    bindHistoryShortcuts,
    updateHistoryButtons
  } = historyController;

  const manualSwatches = createManualSwatchModel({
    getConfig: () => config,
    getRecords: () => state.paletteRecords,
    onAliasChange: () => {
      markPaletteDirty();
      queueRender();
    }
  });
  const {
    syncManualSwatches,
    manualSwatchIndex,
    manualSwatchAt,
    manualSwatchIndexForId,
    manualSourceHex,
    manualSwatchLab,
    manualMatchAliasHex,
    setManualMatchAlias,
    insertManualSwatchAfter,
    removeManualSwatchAt,
    manualSwatchEditable,
    paletteRecordForManualSwatchId,
    activeManualMatchAliasCount
  } = manualSwatches;

  const manualSwatchesList = createManualSwatchesList({
    els,
    config,
    state,
    syncManualSwatches,
    manualSwatchIndexForId,
    removeManualSwatchAt,
    beginHistory,
    commitHistory,
    withHistory,
    markPaletteDirty,
    queueRender
  });
  const {renderManualSwatches} = manualSwatchesList;

  const manualPaletteEditor = createManualPaletteEditor({
    els,
    getConfig: () => config,
    getState: () => state,
    syncManualSwatches,
    manualSwatchIndex,
    manualSwatchAt,
    manualSwatchIndexForId,
    manualSourceHex,
    manualMatchAliasHex,
    setManualMatchAlias,
    manualSwatchEditable,
    paletteRecordForManualSwatchId,
    beginHistory,
    commitHistory,
    withHistory,
    onSourceColorChange: (identifier, color) => {
      const index = manualSwatchIndex(identifier);
      if (index < 0) return null;
      const safe = normalizeHexColor(color, manualSourceHex(index));
      const {lab, colorSpace, ...swatch} = config.manualPalette[index];
      config.manualPalette[index] = {...swatch, hex: safe};
      renderManualSwatches();
      markPaletteDirty();
      queueRender();
      return safe;
    },
    onDuplicateSwatch: ({index, sourceHex, aliasHex}) => {
      const copy = insertManualSwatchAfter(index, sourceHex, aliasHex, "copy");
      if (!copy) return null;
      renderManualSwatches();
      markPaletteDirty();
      queueRender();
      return copy;
    },
    onRemoveSwatch: ({index}) => {
      const next = removeManualSwatchAt(index);
      renderManualSwatches();
      markPaletteDirty();
      queueRender();
      return next;
    },
    copyPaletteHex,
    setStatus
  });
  const {
    closeManualPaletteEditor,
    openManualPaletteEditor,
    syncManualPaletteEditor
  } = manualPaletteEditor;

  const paletteCycle = createPaletteCycle({
    getConfig: () => config,
    getRecords: () => state.paletteRecords,
    syncManualSwatches: () => syncManualSwatches()
  });
  const {
    manualCycleModeEnabled,
    syncCycleManualKeys,
    cycleTaggable,
    cycleTagged,
    manualCycleIndices,
    cyclePeriod,
    normalizedCycleOffset,
    applyManualCycle,
    renderPaletteLabs
  } = paletteCycle;


  const paletteRuntime = createPaletteRuntime({
    config,
    state,
    syncManualSwatches,
    manualSwatchLab,
    manualSwatchEditable,
    manualMatchAliasHex
  });
  const {
    manualPresetName,
    presetExists,
    presetColors,
    presetSize,
    generatedFamilyCount,
    syncGeneratedLocks,
    activeGeneratedLocks,
    isGeneratedPaletteMode,
    activePaletteImageData,
    activePaletteImageLabel,
    activePaletteRegionRect,
    paletteUniformEntries,
    preprocessPaletteEntries,
    fallbackPaletteRecords,
    getPaletteRecords
  } = paletteRuntime;

  const palettePreview = createPalettePreview({
    els,
    config,
    state,
    syncGeneratedLocks,
    activeGeneratedLocks,
    generatedFamilyCount,
    isGeneratedPaletteMode,
    activePaletteImageData,
    activePaletteImageLabel,
    manualCycleModeEnabled,
    syncCycleManualKeys,
    cycleTaggable,
    cycleTagged,
    manualCycleIndices,
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
    setStatus
  });
  const {
    updateGeneratedLockUi,
    clearManualCycleTags,
    clearGeneratedLocks,
    renderSwatches
  } = palettePreview;

  const diagnosticMetrics = createDiagnosticMetrics({
    getConfig: () => config,
    getImageData: () => state.imageData,
    getRecords: () => state.paletteRecords,
    getEntries: records => paletteUniformEntries(records, renderPaletteLabs(records)),
    includeCycleOffset: () => manualCycleModeEnabled()
  });
  const {
    diagnosticsSignature,
    topPaletteMatches,
    assignmentWeights,
    computeDiagnostics
  } = diagnosticMetrics;

  function setDiagnosticOverlay(next = {}) {
    const mode = ["swatch", "difference"].includes(next.mode) ? next.mode : "none";
    const swatchValue = Number(next.swatchIndex);
    const swatchIndex = mode === "swatch" && Number.isInteger(swatchValue)
      ? Math.max(0, Math.min(63, swatchValue))
      : null;
    if (!state.diagnostics) state.diagnostics = {};
    state.diagnostics.overlay = {mode, swatchIndex};

    if (mode === "difference") setStatus("Diagnostic overlay: difference heatmap.");
    else if (mode === "swatch" && swatchIndex !== null) setStatus(`Diagnostic overlay: swatch ${swatchIndex + 1}.`);
    else setStatus("Diagnostic overlay off.");

    queueRender();
  }

  const diagnosticsPanel = createDiagnosticsPanel({
    els,
    getConfig: () => config,
    getState: () => state,
    cycleTagged,
    isGeneratedPaletteMode,
    activePaletteImageData,
    syncGeneratedLocks,
    setDiagnosticOverlay
  });
  const {renderDiagnosticsPanel, renderDiagnosticsSelection, updateDiagnosticsPixel} = diagnosticsPanel;

  let configController;
  let renderedCanvasController;
  let animationExportController;
  let cyclePreviewController;
  let resetController;
  let conditionalPanelsController;

  function cloneConfigSnapshot() {
    return configController.cloneConfigSnapshot();
  }

  function sanitizeConfigSnapshot(raw = {}) {
    return configController.sanitizeConfigSnapshot(raw);
  }

  function replaceConfigSnapshot(snapshot, options) {
    return configController.replaceConfigSnapshot(snapshot, options);
  }

  function setOutputText(key, out, value = config[key]) {
    return configController.setOutputText(key, out, value);
  }

  function handleControlDirty(key) {
    return configController.handleControlDirty(key);
  }

  function updateConditionalPanels() {
    return conditionalPanelsController.updateConditionalPanels();
  }

  const shaderProgramController = createShaderProgramController({
    config,
    state,
    vertexSource: VERTEX_SHADER,
    fragmentSource: FRAGMENT_SHADER_BODY,
    manualCycleModeEnabled
  });
  const {buildProgramForContext, buildProgram} = shaderProgramController;

  const levelSourceController = createLevelSourceController({
    state,
    config,
    vertexSource: VERTEX_SHADER,
    fragmentSource: LEVELS_FRAGMENT_SHADER,
    claritySharpFragmentSource: CLARITY_SHARP_FRAGMENT_SHADER,
    clarityFragmentSource: CLARITY_FRAGMENT_SHADER,
    defaults: DEFAULT_CONFIG
  });
  const {ensureLevelAdjustedSources} = levelSourceController;

  const viewportController = createViewportController({els, state, queueRender});
  const {
    getCanvasRenderSize,
    getViewRect,
    getDisplayViewRect,
    getViewSpan,
    updateViewStatus,
    resetView,
    zoomBy,
    clientPointToImagePixel
  } = viewportController;

  const diagnosticsController = createDiagnosticsController({
    els,
    state,
    config,
    ensurePalette,
    renderPaletteLabs,
    paletteUniformEntries,
    diagnosticsSignature,
    computeDiagnostics,
    renderDiagnosticsPanel,
    renderDiagnosticsSelection,
    updateDiagnosticsPixel,
    clientPointToImagePixel,
    getDisplayViewRect,
    getViewSpan,
    topPaletteMatches,
    assignmentWeights,
    setStatus
  });
  const {
    diagnosticsPanelIsOpen,
    pixelInspectorPanelIsOpen,
    setInspectorTab,
    setPixelInspectorOpen,
    togglePixelInspector,
    refreshDiagnosticPixel,
    clearDiagnosticPixel,
    updateDiagnostics,
    inspectDiagnosticPixel,
    nudgeDiagnosticPixel
  } = diagnosticsController;

  const compareSplitController = createCompareSplitController({
    els,
    config,
    getDisplayViewRect,
    queueRender
  });
  const {
    setCompareSplit,
    setCompareEnabled,
    syncCompareControls
  } = compareSplitController;

  let paletteRegionController;
  let cycleMaskController;
  function cancelPaletteRegionDrag(options) {
    return paletteRegionController.cancelPaletteRegionDrag(options);
  }

  paletteRegionController = createPaletteRegionController({
    els,
    state,
    config,
    getCanvasRenderSize,
    getViewRect,
    getDisplayViewRect,
    getViewSpan,
    clientPointToImagePixel,
    cloneConfigSnapshot,
    pushHistorySnapshot,
    markPaletteDirty,
    updateConditionalPanels,
    queueRender,
    setStatus
  });
  const {
    updatePaletteRegionUi,
    updatePaletteRegionOverlay,
    resetPaletteRegion,
    togglePaletteRegionSelection
  } = paletteRegionController;

  cycleMaskController = createCycleMaskController({
    els,
    state,
    getCanvasRenderSize,
    getViewRect,
    getDisplayViewRect,
    getViewSpan,
    clientPointToImagePixel,
    markMaskDirty,
    queueRender,
    setStatus
  });
  const {
    bindCycleMaskControls,
    resetCycleMask,
    syncCycleMaskUi,
    updateCycleMaskOverlay
  } = cycleMaskController;

  let renderSessionController;
  function markTextureDirty(options) {
    return renderSessionController.markTextureDirty(options);
  }

  function markPaletteDirty(options) {
    return renderSessionController.markPaletteDirty(options);
  }

  function markMaskDirty(options) {
    return renderSessionController.markMaskDirty(options);
  }

  function markLevelsDirty(options) {
    return renderSessionController.markLevelsDirty(options);
  }

  function markEverythingDirty(options) {
    return renderSessionController.markEverythingDirty(options);
  }

  function ensureTexture(options) {
    return renderSessionController.ensureTexture(options);
  }

  function ensurePalette(options) {
    return renderSessionController.ensurePalette(options);
  }

  function currentRenderSettings(options) {
    return renderSessionController.currentRenderSettings(options);
  }

  function renderPaletteProgram(gl, program, options) {
    return renderSessionController.renderPaletteProgram(gl, program, options);
  }

  function draw(options) {
    return renderSessionController.draw(options);
  }

  function queueRender(options) {
    return renderSessionController.queueRender(options);
  }

  renderSessionController = createRenderSession({
    els,
    state,
    config,
    ensureLevelAdjustedSources,
    getPaletteRecords,
    paletteUniformEntries,
    renderPaletteLabs,
    preprocessPaletteEntries,
    renderSwatches,
    manualCycleModeEnabled,
    normalizedCycleOffset,
    getCanvasRenderSize,
    getViewRect,
    getViewSpan,
    buildProgram,
    vertexSource: VERTEX_SHADER,
    blockSampleFragmentSource: BLOCK_SAMPLE_FRAGMENT_SHADER,
    postProcessFragmentSource: PALETTE_POST_FRAGMENT_SHADER,
    viewCompositeFragmentSource: VIEW_COMPOSITE_FRAGMENT_SHADER,
    updatePaletteRegionOverlay,
    updateCycleMaskOverlay,
    syncCycleMaskUi,
    updateDiagnostics
  });

  configController = createConfigController({
    config,
    els,
    state,
    root: document,
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
  });

  renderedCanvasController = createRenderedCanvasController({
    state,
    config,
    document,
    ensurePalette,
    getPaletteRecords,
    fallbackPaletteRecords,
    paletteUniformEntries,
    preprocessPaletteEntries,
    manualCycleModeEnabled,
    applyManualCycle,
    normalizedCycleOffset,
    buildProgramForContext,
    renderPaletteProgram,
    vertexSource: VERTEX_SHADER,
    postProcessFragmentSource: PALETTE_POST_FRAGMENT_SHADER,
    viewCompositeFragmentSource: VIEW_COMPOSITE_FRAGMENT_SHADER
  });

  animationExportController = createAnimationExportController({
    els,
    state,
    config,
    clamp,
    cyclePeriod,
    gcdInt,
    positiveMod,
    normalizedCycleOffset,
    manualCycleModeEnabled,
    getPaletteRecords,
    ensurePalette,
    renderFullImageCanvas,
    setStatus
  });

  const imageController = createImageController({
    state,
    config,
    els,
    root: document,
    Image,
    URL,
    cloneConfigSnapshot,
    pushHistorySnapshot,
    ensureLevelAdjustedSources,
    resetPaletteRegion,
    resetCycleMask,
    resetView,
    markEverythingDirty,
    markPaletteDirty,
    updateConditionalPanels,
    queueRender,
    setStatus
  });
  const {
    updateReferenceImageStatus,
    loadReferenceFile,
    loadFile,
    loadDemo
  } = imageController;

  cyclePreviewController = createCyclePreviewController({
    els,
    state,
    config,
    cyclePeriod,
    normalizedCycleOffset,
    positiveMod,
    manualCycleModeEnabled,
    markPaletteDirty,
    queueRender,
    setStatus,
    syncAnimationExportUi,
    requestAnimationFrame,
    cancelAnimationFrame
  });

  function syncCycleControls(records) {
    return cyclePreviewController.syncCycleControls(records);
  }

  function stopCyclePreview() {
    return cyclePreviewController.stopCyclePreview();
  }

  function toggleCyclePreview() {
    return cyclePreviewController.toggleCyclePreview();
  }

  async function copyPaletteHex(hex) {
    try {
      await navigator.clipboard.writeText(hex);
      setStatus(`Copied ${hex}`);
    } catch {
      setStatus(hex);
    }
  }

  function renderFullImageCanvas(options) {
    return renderedCanvasController.renderFullImageCanvas(options);
  }

  const exportActions = createExportActions({
    els,
    state,
    root: document,
    draw,
    renderFullImageCanvas,
    ensurePalette,
    getPaletteRecords
  });
  const {downloadCanvas, downloadFullImage, exportPalette} = exportActions;

  function animationLoopSpan(records = state.paletteRecords, step = state.animationExport.step) {
    return animationExportController.animationLoopSpan(records, step);
  }

  function syncAnimationExportUi(records = state.paletteRecords) {
    return animationExportController.syncAnimationExportUi(records);
  }

  function sanitizeExportPrefix(value, fallback) {
    return animationExportController.sanitizeExportPrefix(value, fallback);
  }

  function useAnimationLoopSpan() {
    return animationExportController.useAnimationLoopSpan();
  }

  function exportAnimationPngZip() {
    return animationExportController.exportAnimationPngZip();
  }

  function exportAnimationGif() {
    return animationExportController.exportAnimationGif();
  }

  const manualPaletteActions = createManualPaletteActions({
    els,
    state,
    config,
    root: document,
    window,
    Image,
    URL,
    cloneConfigSnapshot,
    pushHistorySnapshot,
    withHistory,
    presetExists,
    presetColors,
    presetSize,
    manualPresetName,
    activePaletteImageData,
    activePaletteRegionRect,
    getPaletteRecords,
    syncManualSwatches,
    renderManualSwatches,
    markPaletteDirty,
    updateConditionalPanels,
    queueRender,
    setStatus,
    setOutputText
  });
  const {
    loadStoredManualPresets,
    populatePresetSelect,
    loadPresetAsManual,
    switchPalettePreset,
    updateCapturePaletteUi,
    captureCurrentPaletteToManual,
    closeCapturePaletteMenu,
    importLut,
    addManualSwatch,
    addPixelSourceToManualPalette,
    copyCurrentPaletteHexStrings,
    openManualPaletteTextDialog,
    closeManualPaletteTextDialog,
    importManualPaletteText
  } = manualPaletteActions;

  conditionalPanelsController = createConditionalPanelsController({
    config,
    state,
    els,
    root: document,
    manualCycleModeEnabled,
    cancelPaletteRegionDrag,
    closeManualPaletteEditor,
    updateGeneratedLockUi,
    updateCapturePaletteUi,
    syncCycleControls,
    updatePaletteRegionUi,
    updatePaletteRegionOverlay
  });

  resetController = createResetController({
    state,
    config,
    replaceConfigSnapshot,
    resetView,
    resetPaletteRegion,
    syncAnimationExportUi,
    setStatus
  });

  function resetSettings() {
    return resetController.resetSettings();
  }

  function resetPanelControls(panel, options = {}) {
    const label = options.label || "panel";
    return withHistory(`Reset ${label} controls`, () => resetController.resetPanelControls(panel, options));
  }

  function panelHasResettableControls(panel) {
    return resetController.panelHasResettableControls(panel);
  }

  const appInitializer = createAppInitializer({
    els,
    state,
    config,
    root: document,
    clamp,
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
    copyPixelHex: copyPaletteHex,
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
  });
  const {init} = appInitializer;

  return {
    init,
    state,
    config,
    els,
    cloneConfigSnapshot,
    replaceConfigSnapshot
  };
}
