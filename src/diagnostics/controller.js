import { analyzePixelAtImagePoint } from "./pixel-inspector.js";
import { clamp } from "../color-utils.js";

export function panelIsOpen(panel) {
  return !!panel && !panel.hidden && !panel.classList.contains("is-collapsed");
}

const INSPECTOR_TABS = ["pixel", "selection", "diagnostics"];

export function createDiagnosticsController({
  els,
  state,
  config,
  ensurePalette,
  renderPaletteLabs,
  paletteUniformEntries,
  diagnosticsSignature,
  computeDiagnostics,
  renderDiagnosticsPanel,
  renderDiagnosticsSelection = () => {},
  updateDiagnosticsPixel = () => {},
  clientPointToImagePixel,
  getDisplayViewRect = () => null,
  getViewSpan = () => [1, 1],
  topPaletteMatches,
  assignmentWeights,
  setStatus = () => {}
} = {}) {
  const diagnosticsState = () => {
    if (!state.diagnostics) state.diagnostics = {};
    return state.diagnostics;
  };

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
    return null;
  }

  function tabPanel(tab) {
    if (tab === "pixel") return els.inspectorPanelPixel || els.diagnosticsPixel?.closest?.("[data-inspector-tab-panel='pixel']");
    if (tab === "selection") return els.inspectorPanelSelection || els.diagnosticsSelection?.closest?.(".selection-diagnostics-panel");
    if (tab === "diagnostics") return els.inspectorPanelDiagnostics || els.diagnosticsSummary?.closest?.(".diagnostics-panel");
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

    const blockSize = Math.max(1, Math.round(Number(config.pixelBlockSize) || 1));
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

  function analyzeDiagnosticPixel(x, y) {
    return analyzePixelAtImagePoint({
      x,
      y,
      imageData: state.imageData,
      paletteRecords: () => state.paletteRecords,
      config,
      ensurePalette,
      renderPaletteLabs,
      paletteUniformEntries,
      topPaletteMatches,
      assignmentWeights
    });
  }

  function inspectDiagnosticImagePixel(x, y, {announce = false} = {}) {
    if (!state.imageData) return null;
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

  function nudgeDiagnosticPixel(dx, dy, {step = 1, announce = true} = {}) {
    const diagnostic = diagnosticsState();
    const probe = diagnostic.pixelProbe || diagnostic.pixel;
    if (!probe || !state.imageData) {
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
    if (announce) setStatus(tab === "pixel" ? "Pixel inspector selected." : tab === "selection" ? "Family selection selected." : "Palette diagnostics selected.");
    return tab;
  }

  function togglePixelInspector(options = {}) {
    setPixelInspectorOpen(!diagnosticsState().pixelInspectorOpen, options);
  }

  function diagnosticsUiIsOpen() {
    return inspectorTabsEnabled() ? inspectorPaneIsOpen() : (diagnosticsPanelIsOpen() || selectionDiagnosticsPanelIsOpen() || pixelInspectorPanelIsOpen());
  }

  function updateDiagnostics() {
    const inspectorOpen = pixelInspectorPanelIsOpen();
    if (inspectorOpen) refreshDiagnosticPixel();
    else {
      syncPixelInspectorUi();
      syncPixelProbeOverlay();
    }

    const fullDiagnosticsOpen = diagnosticsPanelIsOpen();
    const selectionDiagnosticsOpen = selectionDiagnosticsPanelIsOpen();
    if (selectionDiagnosticsOpen) renderDiagnosticsSelection();

    // Full palette diagnostics sample thousands of pixels. Keep that work
    // tied to the palette diagnostics panel only; the pixel inspector has
    // its own single-pixel path above. Cheap selection diagnostics are
    // rendered above from the palette trace and do not need image sampling.
    if (!fullDiagnosticsOpen) return;
    if (!state.imageData) {
      state.diagnostics.stats = null;
      state.diagnostics.signature = "";
      renderDiagnosticsPanel(null);
      return;
    }
    if (state.paletteDirty || !state.paletteRecords.length) ensurePalette();
    if (!state.paletteRecords.length) {
      state.diagnostics.stats = null;
      state.diagnostics.signature = "";
      renderDiagnosticsPanel(null);
      return;
    }
    const records = state.paletteRecords;
    const renderLabs = renderPaletteLabs(records);
    const entries = paletteUniformEntries(records, renderLabs);
    const signature = diagnosticsSignature(records, entries);
    if (state.diagnostics.signature !== signature) {
      const stats = computeDiagnostics(records);
      state.diagnostics.stats = stats;
      state.diagnostics.signature = stats?.signature || signature;
    }
    renderDiagnosticsPanel(state.diagnostics.stats);
  }

  syncPixelInspectorUi();

  return {
    inspectorPaneIsOpen,
    activeInspectorTab,
    setInspectorTab,
    diagnosticsPanelIsOpen,
    selectionDiagnosticsPanelIsOpen,
    pixelInspectorPanelIsOpen,
    diagnosticsUiIsOpen,
    setPixelInspectorOpen,
    togglePixelInspector,
    refreshDiagnosticPixel,
    inspectDiagnosticPixel,
    inspectDiagnosticImagePixel,
    nudgeDiagnosticPixel,
    clearDiagnosticPixel,
    updateDiagnostics
  };
}
