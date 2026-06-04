import { analyzePixelAtImagePoint, createPixelAnalysisContext, sampleFinalOutputPixelAtImagePoint } from "./pixel-inspector.js";
import { clamp } from "../color-utils.js";
import { effectivePixelBlockSize } from "../state/config.js";

export function panelIsOpen(panel) {
  return !!panel && !panel.hidden && !panel.classList.contains("is-collapsed");
}

const INSPECTOR_TABS = ["pixel", "selection", "diagnostics", "xray", "histogram"];

function histogramChannel(tab) {
  return ["luma", "chroma", "hue"].includes(tab) ? tab : "luma";
}

function histogramSpecs(channel) {
  const safeChannel = histogramChannel(channel);
  return [
    {key: `source-${safeChannel}`, scope: "source", channel: safeChannel},
    {key: `output-${safeChannel}`, scope: "output", channel: safeChannel}
  ];
}

function resetHistogramDiagnostics(diagnostics) {
  diagnostics.histogramStats = {};
  diagnostics.histogramSignatures = {};
  diagnostics.histogramSignature = "";
}

export function createDiagnosticsController({
  els,
  state,
  config,
  ensurePalette = () => {},
  ensureLevelAdjustedSources = () => state.imageData,
  renderPaletteLabs = records => records.map(record => record?.lab).filter(Array.isArray),
  paletteUniformEntries = (records = []) => records.map(record => ({sourceRecord: record, renderLab: record?.lab, featureLab: record?.lab})),
  diagnosticsSignature = () => "",
  computeDiagnostics = () => null,
  sourceHistogramSignature = null,
  outputHistogramSignature = null,
  computeSourceHistogramDiagnostics = null,
  computeOutputHistogramDiagnostics = null,
  sourceCloudSignature = null,
  computeSourcePixelCloudDiagnostics = null,
  diagnosticsActiveTab = () => "contribution",
  diagnosticsActiveXrayMode = () => "scatter",
  renderDiagnosticsPanel,
  renderDiagnosticsXray = () => {},
  renderHistogramPanel = () => {},
  renderDiagnosticsSelection = () => {},
  updateDiagnosticsPixel = () => {},
  renderPixelLoupe = () => {},
  clientPointToImagePixel,
  getDisplayViewRect = () => null,
  getViewSpan = () => [1, 1],
  topPaletteMatches,
  assignmentWeights,
  assignmentMapping,
  setStatus = () => {},
  requestFrame = null,
  cancelFrame = null
} = {}) {
  const diagnosticsState = () => {
    if (!state.diagnostics) state.diagnostics = {};
    return state.diagnostics;
  };

  function ensureImageData() {
    ensureLevelAdjustedSources?.();
    return state.imageData;
  }

  function inspectorTabsEnabled() {
    return !!(els.inspectorTabs || els.inspectorTabPixel || els.inspectorPanelPixel || els.inspectorPanelDiagnostics);
  }

  function activeInspectorTab() {
    const tab = diagnosticsState().inspectorTab;
    return INSPECTOR_TABS.includes(tab) ? tab : "pixel";
  }

  function tabButton(tab) {
    if (tab === "pixel") return els.inspectorTabPixel;
    if (tab === "selection") return els.inspectorTabSelection;
    if (tab === "diagnostics") return els.inspectorTabDiagnostics;
    if (tab === "xray") return els.inspectorTabXray;
    if (tab === "histogram") return els.inspectorTabHistogram;
    return null;
  }

  function tabPanel(tab) {
    if (tab === "pixel") return els.inspectorPanelPixel || els.diagnosticsPixel?.closest?.("[data-inspector-tab-panel='pixel']");
    if (tab === "selection") return els.inspectorPanelSelection || els.diagnosticsSelection?.closest?.(".selection-diagnostics-panel");
    if (tab === "diagnostics") return els.inspectorPanelDiagnostics || els.diagnosticsSummary?.closest?.(".diagnostics-panel");
    if (tab === "xray") return els.inspectorPanelXray || els.diagnosticsXray?.closest?.("[data-inspector-tab-panel='xray']");
    if (tab === "histogram") return els.inspectorPanelHistogram || els.diagnosticsHistogram?.closest?.("[data-inspector-tab-panel='histogram']");
    return null;
  }

  function syncInspectorTabsUi({focus = false} = {}) {
    if (!inspectorTabsEnabled()) return;
    const active = activeInspectorTab();
    for (const tab of INSPECTOR_TABS) {
      const selected = tab === active;
      const button = tabButton(tab);
      const panel = tabPanel(tab);
      button?.classList?.toggle?.("is-active", selected);
      button?.setAttribute?.("aria-selected", String(selected));
      button?.setAttribute?.("tabindex", selected ? "0" : "-1");
      if (panel) panel.hidden = !selected;
    }
    if (els.clearPixelInspector) els.clearPixelInspector.hidden = active !== "pixel";
    if (focus) tabButton(active)?.focus?.({preventScroll: true});
  }

  function inspectorPaneIsOpen() {
    const diagnostic = diagnosticsState();
    const pane = pixelInspectorPane();
    if (els.pixelInspectorPane) return !!diagnostic.pixelInspectorOpen;
    if (pane) return panelIsOpen(pane);
    return !!diagnostic.pixelInspectorOpen;
  }

  function diagnosticsPanelIsOpen() {
    const panel = tabPanel("diagnostics");
    if (inspectorTabsEnabled()) return inspectorPaneIsOpen() && activeInspectorTab() === "diagnostics" && panelIsOpen(panel);
    return panelIsOpen(panel);
  }

  function histogramPanelIsOpen() {
    const panel = tabPanel("histogram");
    if (inspectorTabsEnabled()) return inspectorPaneIsOpen() && activeInspectorTab() === "histogram" && panelIsOpen(panel);
    return panelIsOpen(panel);
  }

  function xrayPanelIsOpen() {
    const panel = tabPanel("xray");
    if (inspectorTabsEnabled()) return inspectorPaneIsOpen() && activeInspectorTab() === "xray" && panelIsOpen(panel);
    return panelIsOpen(panel);
  }

  function selectionDiagnosticsPanelIsOpen() {
    const panel = tabPanel("selection");
    if (inspectorTabsEnabled()) return inspectorPaneIsOpen() && activeInspectorTab() === "selection" && panelIsOpen(panel);
    return panelIsOpen(panel);
  }

  function pixelInspectorPane() {
    return els.pixelInspectorPane || els.diagnosticsPixel?.closest?.(".pixel-inspector-panel");
  }

  function pixelInspectorPanelIsOpen() {
    const pane = pixelInspectorPane();
    if (inspectorTabsEnabled()) return inspectorPaneIsOpen() && activeInspectorTab() === "pixel" && (!tabPanel("pixel") || panelIsOpen(tabPanel("pixel")));
    if (els.pixelInspectorPane) return inspectorPaneIsOpen();
    if (pane) return panelIsOpen(pane);
    return inspectorPaneIsOpen();
  }

  function pixelLoupePanelIsOpen() {
    const diagnostic = diagnosticsState();
    if (els.pixelLoupePane) return !!diagnostic.pixelLoupeOpen;
    return !!diagnostic.pixelLoupeOpen;
  }

  function syncPixelInspectorUi() {
    syncInspectorTabsUi();
    const paneOpen = inspectorPaneIsOpen();
    const pixelOpen = pixelInspectorPanelIsOpen();
    if (els.pixelInspectorPane) els.pixelInspectorPane.hidden = !paneOpen;
    if (els.togglePixelInspector) {
      els.togglePixelInspector.classList?.toggle?.("is-active", paneOpen);
      els.togglePixelInspector.setAttribute?.("aria-pressed", String(paneOpen));
    }
    els.canvas?.classList?.toggle?.("is-inspecting", pixelOpen);
  }

  function syncPixelLoupeUi() {
    const open = pixelLoupePanelIsOpen();
    if (els.pixelLoupePane) els.pixelLoupePane.hidden = !open;
    if (els.togglePixelLoupe) {
      els.togglePixelLoupe.classList?.toggle?.("is-active", open);
      els.togglePixelLoupe.setAttribute?.("aria-pressed", String(open));
    }
    els.canvas?.classList?.toggle?.("is-louping", open);
  }

  function notifyPixelLoupeRender(pixel = diagnosticsState().pixelLoupe || null) {
    renderPixelLoupe?.(pixel);
  }

  function setPixelLoupeRenderer(renderer) {
    renderPixelLoupe = typeof renderer === "function" ? renderer : () => {};
    notifyPixelLoupeRender();
  }

  function pixelClientPoint(x, y) {
    if (!state.imageData) return null;
    const rect = getDisplayViewRect?.();
    if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.width) || rect.width <= 0 || rect.height <= 0) return null;
    const [spanX, spanY] = getViewSpan?.(rect.width, rect.height) || [1, 1];
    const imageW = state.imageData.width || 1;
    const imageH = state.imageData.height || 1;
    const uvX = clamp(Number(x) / imageW, 0, 1);
    const uvY = clamp(Number(y) / imageH, 0, 1);
    const centerX = Number.isFinite(state.view?.centerX) ? state.view.centerX : 0.5;
    const centerY = Number.isFinite(state.view?.centerY) ? state.view.centerY : 0.5;
    const screenX = (uvX - centerX) / Math.max(spanX, 1e-6) + 0.5;
    const screenY = (uvY - centerY) / Math.max(spanY, 1e-6) + 0.5;
    return {
      visible: screenX >= 0 && screenX <= 1 && screenY >= 0 && screenY <= 1,
      clientX: rect.left + screenX * rect.width,
      clientY: rect.top + screenY * rect.height
    };
  }

  function syncPixelProbeOverlay() {
    const overlay = els.pixelProbeOverlay;
    if (!overlay) return;
    const diagnostic = diagnosticsState();
    const pixel = diagnostic.pixel;
    const open = pixelInspectorPanelIsOpen();
    if (!open || !pixel || !state.imageData) {
      overlay.hidden = true;
      return;
    }

    const stageRect = overlay.parentElement?.getBoundingClientRect?.();
    if (!stageRect) {
      overlay.hidden = true;
      return;
    }

    const blockSize = effectivePixelBlockSize(config);
    const imageW = state.imageData.width || 1;
    const imageH = state.imageData.height || 1;
    const blockOriginX = Math.floor(pixel.x / blockSize) * blockSize;
    const blockOriginY = Math.floor(pixel.y / blockSize) * blockSize;
    const blockEndX = Math.min(blockOriginX + blockSize, imageW);
    const blockEndY = Math.min(blockOriginY + blockSize, imageH);
    const center = pixelClientPoint(pixel.x + 0.5, pixel.y + 0.5);
    const topLeft = pixelClientPoint(blockOriginX, blockOriginY);
    const bottomRight = pixelClientPoint(blockEndX, blockEndY);
    if (!center?.visible || !topLeft || !bottomRight) {
      overlay.hidden = true;
      return;
    }

    const block = overlay.querySelector?.(".pixel-probe-block");
    const crosshair = overlay.querySelector?.(".pixel-probe-crosshair");
    const left = Math.min(topLeft.clientX, bottomRight.clientX) - stageRect.left;
    const top = Math.min(topLeft.clientY, bottomRight.clientY) - stageRect.top;
    const width = Math.max(2, Math.abs(bottomRight.clientX - topLeft.clientX));
    const height = Math.max(2, Math.abs(bottomRight.clientY - topLeft.clientY));
    if (block) {
      block.style.left = `${left}px`;
      block.style.top = `${top}px`;
      block.style.width = `${width}px`;
      block.style.height = `${height}px`;
    }
    if (crosshair) {
      crosshair.style.left = `${center.clientX - stageRect.left}px`;
      crosshair.style.top = `${center.clientY - stageRect.top}px`;
    }
    overlay.hidden = false;
  }

  function createPaletteContext() {
    return createPixelAnalysisContext({
      paletteRecords: () => state.paletteRecords,
      ensurePalette,
      renderPaletteLabs,
      paletteUniformEntries
    });
  }

  function analyzeDiagnosticPixel(x, y, paletteContext = null) {
    return analyzePixelAtImagePoint({
      x,
      y,
      imageData: state.imageData,
      paletteRecords: () => state.paletteRecords,
      paletteContext,
      config,
      ensurePalette,
      renderPaletteLabs,
      paletteUniformEntries,
      topPaletteMatches,
      assignmentWeights,
      assignmentMapping
    });
  }

  function inspectDiagnosticImagePixel(x, y, {announce = false} = {}) {
    if (!ensureImageData()) return null;
    const width = state.imageData.width || 1;
    const height = state.imageData.height || 1;
    const pxX = clamp(Math.floor(Number(x) || 0), 0, width - 1);
    const pxY = clamp(Math.floor(Number(y) || 0), 0, height - 1);
    const diagnostic = diagnosticsState();
    diagnostic.pixelProbe = {x: pxX, y: pxY};
    diagnostic.pixel = analyzeDiagnosticPixel(pxX, pxY);
    updateDiagnosticsPixel();
    syncPixelProbeOverlay();
    if (announce && diagnostic.pixel) setStatus(`Inspected pixel ${diagnostic.pixel.x},${diagnostic.pixel.y}.`);
    return diagnostic.pixel;
  }

  function refreshDiagnosticPixel({announce = false} = {}) {
    const diagnostic = diagnosticsState();
    if (!diagnostic.pixelProbe) {
      updateDiagnosticsPixel();
      syncPixelProbeOverlay();
      return null;
    }
    return inspectDiagnosticImagePixel(diagnostic.pixelProbe.x, diagnostic.pixelProbe.y, {announce});
  }

  function inspectDiagnosticPixel(clientX, clientY) {
    const point = clientPointToImagePixel?.(clientX, clientY);
    if (!point) return null;
    return inspectDiagnosticImagePixel(point.x, point.y);
  }

  function analyzeLoupeImagePixel(x, y, paletteContext = null) {
    if (!ensureImageData()) return null;
    const width = state.imageData.width || 1;
    const height = state.imageData.height || 1;
    const pxX = clamp(Math.floor(Number(x) || 0), 0, width - 1);
    const pxY = clamp(Math.floor(Number(y) || 0), 0, height - 1);
    return analyzeDiagnosticPixel(pxX, pxY, paletteContext);
  }

  function createLoupePatchSampler() {
    if (!ensureImageData()) return null;
    const imageData = state.imageData;
    const paletteContext = createPaletteContext();
    return (x, y) => {
      const width = imageData.width || 1;
      const height = imageData.height || 1;
      const pxX = clamp(Math.floor(Number(x) || 0), 0, width - 1);
      const pxY = clamp(Math.floor(Number(y) || 0), 0, height - 1);
      return sampleFinalOutputPixelAtImagePoint({
        x: pxX,
        y: pxY,
        imageData,
        paletteContext,
        config,
        topPaletteMatches,
        assignmentWeights,
        assignmentMapping
      });
    };
  }

  function inspectLoupePixel(clientX, clientY) {
    const point = clientPointToImagePixel?.(clientX, clientY);
    if (!point || !ensureImageData()) return null;
    const width = state.imageData.width || 1;
    const height = state.imageData.height || 1;
    const pxX = clamp(Math.floor(Number(point.x) || 0), 0, width - 1);
    const pxY = clamp(Math.floor(Number(point.y) || 0), 0, height - 1);
    const diagnostic = diagnosticsState();
    diagnostic.pixelLoupeProbe = {x: pxX, y: pxY};
    diagnostic.pixelLoupe = analyzeLoupeImagePixel(pxX, pxY);
    return diagnostic.pixelLoupe;
  }

  function refreshLoupePixel() {
    const diagnostic = diagnosticsState();
    if (!diagnostic.pixelLoupeProbe || !ensureImageData()) return null;
    diagnostic.pixelLoupe = analyzeDiagnosticPixel(diagnostic.pixelLoupeProbe.x, diagnostic.pixelLoupeProbe.y);
    notifyPixelLoupeRender(diagnostic.pixelLoupe);
    return diagnostic.pixelLoupe;
  }

  function clearLoupePixel() {
    const diagnostic = diagnosticsState();
    diagnostic.pixelLoupeProbe = null;
    diagnostic.pixelLoupe = null;
    notifyPixelLoupeRender(null);
  }

  function setPixelLoupeOpen(open, {announce = false} = {}) {
    const diagnostic = diagnosticsState();
    diagnostic.pixelLoupeOpen = !!open;
    syncPixelLoupeUi();
    if (diagnostic.pixelLoupeOpen) refreshLoupePixel();
    if (announce) setStatus(diagnostic.pixelLoupeOpen ? "Loupe open. Hover the preview to sample pixels live." : "Loupe closed.");
  }

  function togglePixelLoupe(options = {}) {
    setPixelLoupeOpen(!diagnosticsState().pixelLoupeOpen, options);
  }

  function nudgeDiagnosticPixel(dx, dy, {step = 1, announce = true} = {}) {
    const diagnostic = diagnosticsState();
    const probe = diagnostic.pixelProbe || diagnostic.pixel;
    if (!probe || !ensureImageData()) {
      setStatus("Inspect a pixel first.");
      return null;
    }
    return inspectDiagnosticImagePixel(probe.x + dx * step, probe.y + dy * step, {announce});
  }

  function clearDiagnosticPixel({announce = false} = {}) {
    const diagnostic = diagnosticsState();
    diagnostic.pixel = null;
    diagnostic.pixelProbe = null;
    updateDiagnosticsPixel();
    syncPixelProbeOverlay();
    if (announce) setStatus("Pixel probe cleared.");
  }

  function setPixelInspectorOpen(open, {announce = false} = {}) {
    const diagnostic = diagnosticsState();
    diagnostic.pixelInspectorOpen = !!open;
    syncPixelInspectorUi();
    if (diagnostic.pixelInspectorOpen && pixelInspectorPanelIsOpen()) refreshDiagnosticPixel();
    else if (diagnostic.pixelInspectorOpen) updateDiagnostics();
    else {
      updateDiagnosticsPixel();
      syncPixelProbeOverlay();
    }
    if (announce) {
      const pixelTab = activeInspectorTab() === "pixel";
      setStatus(diagnostic.pixelInspectorOpen
        ? (pixelTab ? "Pixel inspector open. Click the preview to inspect." : "Inspector open.")
        : (pixelTab ? "Pixel inspector closed." : "Inspector closed."));
    }
  }

  function setInspectorTab(tab, {focus = false, announce = false, update = true} = {}) {
    if (!INSPECTOR_TABS.includes(tab)) return activeInspectorTab();
    diagnosticsState().inspectorTab = tab;
    syncPixelInspectorUi();
    if (focus) tabButton(tab)?.focus?.({preventScroll: true});
    if (inspectorPaneIsOpen() && update) updateDiagnostics();
    if (announce) setStatus(tab === "pixel" ? "Pixel inspector selected." : tab === "selection" ? "Family selection selected." : tab === "xray" ? "Palette X-Ray selected." : tab === "histogram" ? "Histograms selected." : "Palette diagnostics selected.");
    return tab;
  }

  function togglePixelInspector(options = {}) {
    setPixelInspectorOpen(!diagnosticsState().pixelInspectorOpen, options);
  }

  function diagnosticsUiIsOpen() {
    return inspectorTabsEnabled() ? inspectorPaneIsOpen() : (diagnosticsPanelIsOpen() || histogramPanelIsOpen() || selectionDiagnosticsPanelIsOpen() || pixelInspectorPanelIsOpen());
  }

  const scheduleFrame = typeof requestFrame === "function" ? requestFrame : null;
  const cancelScheduledFrame = typeof cancelFrame === "function" ? cancelFrame : null;
  let diagnosticsQueued = false;
  let diagnosticsFrameId = null;
  let lastImmediateDiagnosticsFrameTime = null;

  function frameTimeKnown(frameTime) {
    return frameTime !== undefined && frameTime !== null;
  }

  function runDiagnosticsNow(options = {}) {
    const {frameTime} = options;
    if (frameTimeKnown(frameTime)) {
      if (frameTime === lastImmediateDiagnosticsFrameTime && !options.immediate) return;
      if (options.immediate) lastImmediateDiagnosticsFrameTime = frameTime;
    }

    const inspectorOpen = pixelInspectorPanelIsOpen();
    if (inspectorOpen) {
      ensureImageData();
      refreshDiagnosticPixel();
    }
    else {
      syncPixelInspectorUi();
      syncPixelProbeOverlay();
    }
    if (pixelLoupePanelIsOpen()) refreshLoupePixel();

    const fullDiagnosticsOpen = diagnosticsPanelIsOpen();
    const histogramOpen = histogramPanelIsOpen();
    const xrayOpen = xrayPanelIsOpen();
    const xrayCloudOpen = xrayOpen && diagnosticsActiveXrayMode?.() === "cloud";
    const selectionDiagnosticsOpen = selectionDiagnosticsPanelIsOpen();
    if (selectionDiagnosticsOpen) {
      const traceableMode = config.paletteMode === "generated" || config.paletteMode === "generatedReference" || config.paletteMode === "harmony" || config.paletteMode === "cosine";
      if (state.paletteDirty || !state.paletteRecords.length || (traceableMode && !state.paletteSelectionTrace)) ensurePalette({captureTrace: traceableMode});
      renderDiagnosticsSelection();
    }

    // Full palette diagnostics sample thousands of pixels. Keep that work
    // tied to the palette diagnostics panel only; the pixel inspector has
    // its own single-pixel path above. Selection diagnostics asks palette
    // generation for its trace only while the families/selection tab is open.
    // The X-Ray is mostly a palette-structure view and does not need image
    // sampling. Cloud is the deliberate exception: it visualizes the input
    // pixels, so only that mode pays the source-sampling cost.
    if (!fullDiagnosticsOpen && !histogramOpen && !xrayOpen) return;
    if (fullDiagnosticsOpen || histogramOpen || xrayCloudOpen) ensureImageData();
    if (state.paletteDirty || !state.paletteRecords.length) ensurePalette();
    if (!state.paletteRecords.length) {
      state.diagnostics.stats = null;
      state.diagnostics.xrayStats = null;
      state.diagnostics.signature = "";
      state.diagnostics.sourceCloud = null;
      state.diagnostics.sourceCloudSignature = "";
      resetHistogramDiagnostics(state.diagnostics);
      if (fullDiagnosticsOpen) renderDiagnosticsPanel(null);
      if (histogramOpen) renderHistogramPanel(null);
      if (xrayOpen) renderDiagnosticsXray(null);
      return;
    }
    const records = state.paletteRecords;
    const renderLabs = renderPaletteLabs(records);
    const entries = paletteUniformEntries(records, renderLabs);
    const xrayStats = {records, entries, collisions: state.diagnostics.stats?.collisions || null};
    if (xrayCloudOpen && state.imageData) {
      const signature = sourceCloudSignature?.() || "";
      if (state.diagnostics.sourceCloudSignature !== signature) {
        state.diagnostics.sourceCloud = computeSourcePixelCloudDiagnostics?.() || null;
        state.diagnostics.sourceCloudSignature = state.diagnostics.sourceCloud?.signature || signature;
      }
      xrayStats.sourceCloud = state.diagnostics.sourceCloud || null;
    }
    state.diagnostics.xrayStats = xrayStats;
    if (xrayOpen && !fullDiagnosticsOpen) renderDiagnosticsXray(xrayStats);

    if (!state.imageData) {
      state.diagnostics.stats = null;
      state.diagnostics.xrayStats = xrayStats;
      state.diagnostics.signature = "";
      state.diagnostics.sourceCloud = null;
      state.diagnostics.sourceCloudSignature = "";
      resetHistogramDiagnostics(state.diagnostics);
      if (fullDiagnosticsOpen) renderDiagnosticsPanel(null);
      if (histogramOpen) renderHistogramPanel(null);
      if (xrayOpen && fullDiagnosticsOpen) renderDiagnosticsXray(xrayStats);
      return;
    }
    if (histogramOpen) {
      const channel = histogramChannel(diagnosticsActiveTab?.());
      const histogramSignatures = state.diagnostics.histogramSignatures && typeof state.diagnostics.histogramSignatures === "object"
        ? state.diagnostics.histogramSignatures
        : (state.diagnostics.histogramSignatures = {});
      const histogramStats = state.diagnostics.histogramStats && typeof state.diagnostics.histogramStats === "object"
        ? state.diagnostics.histogramStats
        : (state.diagnostics.histogramStats = {});
      for (const spec of histogramSpecs(channel)) {
        const signatureFn = spec.scope === "output" ? outputHistogramSignature : sourceHistogramSignature;
        const computeFn = spec.scope === "output" ? computeOutputHistogramDiagnostics : computeSourceHistogramDiagnostics;
        const histogramSignature = signatureFn
          ? signatureFn(records, entries, spec.channel)
          : `${diagnosticsSignature(records, entries)}~${spec.key}-histogram-v4`;
        if (histogramSignatures[spec.key] !== histogramSignature) {
          const stats = computeFn?.(records, spec.channel) || null;
          histogramStats[spec.key] = stats;
          histogramSignatures[spec.key] = stats?.signature || histogramSignature;
        }
      }
      renderHistogramPanel(histogramStats);
      if (!fullDiagnosticsOpen) return;
    }
    if (!fullDiagnosticsOpen) return;

    const signature = diagnosticsSignature(records, entries);
    if (state.diagnostics.signature !== signature) {
      const stats = computeDiagnostics(records);
      state.diagnostics.stats = stats;
      state.diagnostics.signature = stats?.signature || signature;
    }
    renderDiagnosticsPanel(state.diagnostics.stats);
    if (state.diagnostics.stats) {
      state.diagnostics.xrayStats = state.diagnostics.stats;
      if (xrayStats.sourceCloud) state.diagnostics.xrayStats.sourceCloud = xrayStats.sourceCloud;
    }
    if (xrayOpen) renderDiagnosticsXray(state.diagnostics.xrayStats || xrayStats);
  }

  function clearQueuedDiagnostics() {
    if (diagnosticsQueued && diagnosticsFrameId !== null && cancelScheduledFrame) {
      cancelScheduledFrame(diagnosticsFrameId);
    }
    diagnosticsQueued = false;
    diagnosticsFrameId = null;
  }

  function updateDiagnostics(options = {}) {
    if (!scheduleFrame || options.immediate) {
      clearQueuedDiagnostics();
      runDiagnosticsNow({frameTime: options.frameTime, immediate: !!options.immediate});
      return;
    }
    if (diagnosticsQueued) return;
    diagnosticsQueued = true;
    diagnosticsFrameId = scheduleFrame(frameTime => {
      diagnosticsQueued = false;
      diagnosticsFrameId = null;
      runDiagnosticsNow({frameTime});
    });
  }

  syncPixelInspectorUi();
  syncPixelLoupeUi();

  return {
    setInspectorTab,
    diagnosticsPanelIsOpen,
    xrayPanelIsOpen,
    pixelInspectorPanelIsOpen,
    pixelLoupePanelIsOpen,
    setPixelInspectorOpen,
    togglePixelInspector,
    setPixelLoupeOpen,
    togglePixelLoupe,
    setPixelLoupeRenderer,
    refreshDiagnosticPixel,
    inspectDiagnosticPixel,
    inspectLoupePixel,
    analyzeLoupeImagePixel,
    createLoupePatchSampler,
    refreshLoupePixel,
    clearLoupePixel,
    nudgeDiagnosticPixel,
    clearDiagnosticPixel,
    updateDiagnostics
  };
}
