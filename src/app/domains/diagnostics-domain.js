import { createDiagnosticMetrics } from "../../diagnostics/metrics.js";
import { createDiagnosticsController } from "../../diagnostics/controller.js";
import { createDiagnosticsPanel } from "../../ui/diagnostics-panel.js";

export function createDiagnosticsDomain({
  els,
  state,
  config,
  palette,
  render = {},
  view = {},
  env = {},
  setStatus = () => {}
}) {
  const {
    manualCycleModeEnabled,
    cycleTagged,
    isGeneratedPaletteMode,
    activePaletteImageData,
    syncGeneratedLocks,
    activatePaletteSwatch,
    repositionManualGraphSwatch,
    makeGraphSwatchAnchorSource,
    renderPaletteLabs,
    paletteUniformEntries
  } = palette;
  const {
    ensurePalette = () => {},
    queueRender = () => {}
  } = render;
  const {
    clientPointToImagePixel,
    getDisplayViewRect,
    getViewSpan
  } = view;
  const {
    requestFrame = null,
    cancelFrame = null
  } = env;

  const metrics = createDiagnosticMetrics({
    getConfig: () => config,
    getImageData: () => state.imageData,
    getRecords: () => state.paletteRecords,
    getEntries: records => paletteUniformEntries(records, renderPaletteLabs(records)),
    includeCycleOffset: () => manualCycleModeEnabled()
  });

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

  let controller = null;
  const panel = createDiagnosticsPanel({
    els,
    getConfig: () => config,
    getState: () => state,
    cycleTagged,
    isGeneratedPaletteMode,
    activePaletteImageData,
    syncGeneratedLocks,
    setDiagnosticOverlay,
    onPaletteSwatchClick: activatePaletteSwatch,
    onGraphSwatchReposition: repositionManualGraphSwatch,
    onGraphSwatchPromoteAnchor: makeGraphSwatchAnchorSource,
    onDiagnosticsTabChange: () => controller?.updateDiagnostics?.({immediate: true})
  });

  controller = createDiagnosticsController({
    els,
    state,
    config,
    ensurePalette,
    renderPaletteLabs,
    paletteUniformEntries,
    diagnosticsSignature: metrics.diagnosticsSignature,
    computeDiagnostics: metrics.computeDiagnostics,
    sourceHistogramSignature: metrics.sourceHistogramSignature,
    outputHistogramSignature: metrics.outputHistogramSignature,
    computeSourceHistogramDiagnostics: metrics.computeSourceHistogramDiagnostics,
    computeOutputHistogramDiagnostics: metrics.computeOutputHistogramDiagnostics,
    diagnosticsActiveTab: panel.activeHistogramTab,
    renderDiagnosticsPanel: panel.renderDiagnosticsPanel,
    renderDiagnosticsXray: panel.renderDiagnosticsXray,
    renderHistogramPanel: panel.renderHistogramPanel,
    renderDiagnosticsSelection: panel.renderDiagnosticsSelection,
    updateDiagnosticsPixel: panel.updateDiagnosticsPixel,
    clientPointToImagePixel,
    getDisplayViewRect,
    getViewSpan,
    topPaletteMatches: metrics.topPaletteMatches,
    assignmentWeights: metrics.assignmentWeights,
    setStatus,
    requestFrame,
    cancelFrame
  });

  return {
    metrics,
    panel,
    controller,
    setDiagnosticOverlay,
    ...metrics,
    ...panel,
    ...controller
  };
}
