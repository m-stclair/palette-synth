import { DIAGNOSTIC, createDiagnosticMetrics, normalizeHistogramBinCount } from "../../diagnostics/metrics.js";
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
    ensureLevelAdjustedSources = () => state.imageData,
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
    getImageData: () => {
      ensureLevelAdjustedSources();
      return state.imageData;
    },
    getRecords: () => state.paletteRecords,
    getEntries: records => paletteUniformEntries(records, renderPaletteLabs(records)),
    getHistogramBinCount: () => state.diagnostics?.histogramBinCount,
    includeCycleOffset: () => manualCycleModeEnabled()
  });

  function setDiagnosticOverlay(next = {}) {
    const mode = ["swatch", "difference", "histogram"].includes(next.mode) ? next.mode : "none";
    const swatchValue = Number(next.swatchIndex);
    const swatchIndex = mode === "swatch" && Number.isInteger(swatchValue)
      ? Math.max(0, Math.min(63, swatchValue))
      : null;
    if (!state.diagnostics) state.diagnostics = {};

    if (mode === "histogram") {
      const channel = ["chroma", "hue", "neutral"].includes(next.histogramChannel) ? next.histogramChannel : "luma";
      const scope = next.histogramScope === "output" ? "output" : "source";

      if (channel === "neutral") {
        state.diagnostics.overlay = {
          mode,
          swatchIndex: null,
          histogramScope: scope,
          histogramChannel: channel,
          histogramBinIndex: null,
          histogramBinCount: null,
          histogramDomainMax: null,
          histogramStart: null,
          histogramEnd: null,
          histogramMin: 0,
          histogramMax: 0
        };
        setStatus(`Diagnostic overlay: ${scope} neutral / unreliable hue.`);
        queueRender();
        return;
      }

      const binCount = normalizeHistogramBinCount(next.histogramBinCount, state.diagnostics.histogramBinCount);
      const binValue = Math.max(0, Math.min(binCount - 1, Math.round(Number(next.histogramBinIndex) || 0)));
      const domainMax = Math.max(1e-5, Number(next.histogramDomainMax) || (channel === "hue" ? 360 : (channel === "chroma" ? 32 : 100)));
      const providedStart = Number(next.histogramStart);
      const providedEnd = Number(next.histogramEnd);
      const start = Math.max(0, Number.isFinite(providedStart) ? providedStart : (binValue / binCount) * domainMax);
      const end = Math.max(start, Number.isFinite(providedEnd) ? providedEnd : ((binValue + 1) / binCount) * domainMax);
      const shaderEnd = binValue >= binCount - 1 ? DIAGNOSTIC.histogramOverlayOverflowMax : end;
      state.diagnostics.overlay = {
        mode,
        swatchIndex: null,
        histogramScope: scope,
        histogramChannel: channel,
        histogramBinIndex: binValue,
        histogramBinCount: binCount,
        histogramDomainMax: domainMax,
        histogramStart: start,
        histogramEnd: end,
        histogramMin: start,
        histogramMax: shaderEnd
      };
      const axisLabel = channel === "chroma" ? "C" : (channel === "hue" ? "H°" : "L");
      setStatus(`Diagnostic overlay: ${scope} ${axisLabel} bin ${binValue + 1} (${start.toFixed(1)}–${end.toFixed(1)}).`);
      queueRender();
      return;
    }

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
    ensureLevelAdjustedSources,
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
    assignmentMapping: metrics.assignmentMapping,
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
