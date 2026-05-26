import {
  MAX_PALETTE_SIZE,
  SELECTION_NOISE_AMOUNT,
  TAU,
  NEUTRAL_CHROMA_EPSILON
} from "../constants.js";
import {
  clamp,
  colorInfoLabel,
  hexToByteRgb,
  labDistanceComponents,
  labToHex,
  labToOklch,
  oklchToLab,
  fitLabToSrgb,
  rgb8ToLab,
  visibleSwatchLab
} from "../color-utils.js";
import { cpuDistanceBreakdown } from "../diagnostics/metrics.js";

function capitalize(value) {
  const text = String(value || "");
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

export function formatDistance(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

export function formatUsagePercent(value) {
  // One consistent formatter for every per-swatch percentage so the
  // contribution column, the territory column, and the alias annotation
  // all round the same way.
  const pct = Math.max(0, Number(value) || 0) * 100;
  if (pct === 0) return "0%";
  if (pct < 0.1) return "<0.1%";
  if (pct < 10) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(0)}%`;
}

export function normalizeDeltaParts(parts) {
  if (!parts) return null;
  const luma = Number(parts.luma ?? parts.deltaL ?? parts.dL);
  const chroma = Number(parts.chroma ?? parts.deltaC ?? parts.dC);
  const hue = Number(parts.hue ?? parts.deltaH ?? parts.dH);
  if (![luma, chroma, hue].every(Number.isFinite)) return null;
  return {luma, chroma, hue, hueSuppressed: !!(parts.hueSuppressed ?? parts.raw?.hueSuppressed)};
}

function formatHueDistance(parts) {
  return parts?.hueSuppressed ? "~" : formatDistance(parts?.hue);
}

function labFromHex(hex) {
  if (!hex) return null;
  const rgb = hexToByteRgb(hex);
  if (!rgb || rgb.length < 3) return null;
  return rgb8ToLab(rgb[0], rgb[1], rgb[2]);
}

function deltaFromPixel(pixel, {blendActive = false, config = {}} = {}) {
  const stored = blendActive
    ? (pixel.blendDelta || pixel.finalDelta || pixel.outputDelta)
    : (pixel.fxDelta || pixel.outputDelta || pixel.finalDelta || pixel.blendDelta);
  const normalized = normalizeDeltaParts(stored);
  if (normalized) return normalized;

  const sourceLab = Array.isArray(pixel.sourceLab) ? pixel.sourceLab : labFromHex(pixel.sourceHex);
  const targetLab = blendActive
    ? (Array.isArray(pixel.finalLab) ? pixel.finalLab : labFromHex(pixel.finalHex))
    : (Array.isArray(pixel.outputLab) ? pixel.outputLab : labFromHex(pixel.fxHex || pixel.finalHex));
  if (!sourceLab || !targetLab) return null;
  const sourceParts = labDistanceComponents(sourceLab);
  const targetParts = labDistanceComponents(targetLab);
  return cpuDistanceBreakdown(
    sourceParts.lightness,
    sourceParts.chroma,
    sourceParts.scaledHue,
    targetParts.lightness,
    targetParts.chroma,
    targetParts.scaledHue,
    config
  );
}


function assignmentContributionModeLabel(config) {
  if (config.assignMode === "nearest") return "Nearest coverage";
  if (config.assignMode === "blend") return "Blend contribution";
  if (config.assignMode === "dither") return "Dither contribution";
  return "Contribution";
}

function lightnessY(lab, height, padding) {
  return padding + (1 - clamp(lab[0] / 100, 0, 1)) * (height - padding * 2);
}

function hueXForPlot(lab, plotLeft, plotRight, pad) {
  const [, C, h] = labToOklch(lab);
  if (C < NEUTRAL_CHROMA_EPSILON) return (pad + plotLeft) / 2;
  return plotLeft + (h / TAU) * (plotRight - plotLeft);
}

function formatScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n >= 10 ? n.toFixed(1) : n.toFixed(3);
}

function formatSignedScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "−";
  return `${sign}${formatScore(Math.abs(n))}`;
}

function swatchListHtml(hexes = []) {
  return hexes.map(hex => {
    const colorInfo = colorInfoLabel(hex);
    return `<i class="selection-swatch" style="background:${hex}" title="${colorInfo}"></i>`;
  }).join("");
}

function familySeedReadoutHtml(picked = {}) {
  const seedHex = picked.hex || (Array.isArray(picked.lab) ? labToHex(picked.lab) : "");
  const seedInfo = seedHex ? colorInfoLabel(seedHex, picked.lab) : (Array.isArray(picked.lab) ? colorInfoLabel("", picked.lab) : "");
  return `<span class="selection-round-seed" title="family seed ${seedInfo || "—"}">${seedInfo || "—"}</span>`;
}

function pixelInspectorSwatchNumber(match, config = {}) {
  const record = match?.record;
  if (config?.paletteMode === "manual" && record?.source === "manual" && Number.isInteger(record.sourceIndex)) {
    return record.sourceIndex + 1;
  }
  return (Number.isInteger(match?.displayIndex) ? match.displayIndex : 0) + 1;
}

function pixelInspectorSwatchTitle(match, config = {}) {
  const number = pixelInspectorSwatchNumber(match, config);
  const manual = config?.paletteMode === "manual" && match?.record?.source === "manual";
  return `${manual ? "manual " : ""}swatch ${number}`;
}

function usageRecord(item, records = []) {
  if (item?.record) return item.record;
  const index = Number.isInteger(item?.index) ? item.index : -1;
  return index >= 0 ? records[index] || null : null;
}

function usageSwatchNumber(item, config = {}, records = []) {
  const record = usageRecord(item, records);
  if (config?.paletteMode === "manual" && record?.source === "manual" && Number.isInteger(record.sourceIndex)) {
    return record.sourceIndex + 1;
  }
  if (Number.isInteger(record?.displayIndex)) return record.displayIndex + 1;
  return (Number.isInteger(item?.index) ? item.index : 0) + 1;
}

function usageOrderValue(item, config = {}, records = []) {
  const record = usageRecord(item, records);
  if (config?.paletteMode === "manual" && record?.source === "manual" && Number.isInteger(record.sourceIndex)) {
    return record.sourceIndex;
  }
  if (Number.isInteger(record?.displayIndex)) return record.displayIndex;
  return Number.isInteger(item?.index) ? item.index : 0;
}

function usageSwatchTitle(item, config = {}, records = []) {
  const manual = config?.paletteMode === "manual" && usageRecord(item, records)?.source === "manual";
  return `${manual ? "manual " : ""}swatch ${usageSwatchNumber(item, config, records)}`;
}

function scorePartRow(label, contribution, detail = "") {
  const cls = contribution < 0 ? " is-negative" : (contribution > 0 ? " is-positive" : "");
  return `<div class="selection-score-row${cls}"><span>${label}</span><b>${formatSignedScore(contribution)}</b><small>${detail}</small></div>`;
}

function alternativeRowsHtml(items = [], pickedIndex = null) {
  if (!items.length) return `<div class="selection-empty">none</div>`;
  return items.map(item => {
    const picked = item.index === pickedIndex;
    const cls = `selection-alt${picked ? " is-picked" : ""}${item.blockedBySpacing ? " is-blocked" : ""}`;
    const distance = Number.isFinite(item.nearestFamilyDistance) ? ` · nearest ${formatDistance(item.nearestFamilyDistance)}` : "";
    return `<div class="${cls}">
        <span class="selection-alt-rank">#${item.rank ?? "—"}</span>
        <span class="selection-alt-swatches">${swatchListHtml(item.familyHexes || [item.hex])}</span>
        <span class="selection-alt-text"><b>${item.hex}</b><span class="selection-alt-meta">${item.band}${distance}</span><em>${item.reason || "candidate"}</em></span>
        <strong>${formatScore(item.marginalScore ?? item.baseScore)}</strong>
      </div>`;
  }).join("");
}

export function createDiagnosticsPanel({
  els = {},
  getConfig = () => ({}),
  getState = () => ({}),
  cycleTagged = () => false,
  isGeneratedPaletteMode = () => false,
  activePaletteImageData = () => null,
  syncGeneratedLocks = () => [],
  setDiagnosticOverlay = () => {},
  onPaletteSwatchClick = () => {},
  onGraphSwatchReposition = () => false,
  onGraphSwatchPromoteAnchor = () => false,
  onDiagnosticsTabChange = () => {}
} = {}) {
  const overlayBoundElements = new WeakSet();
  let histogramGraphActivationRecords = [];
  const HISTOGRAM_TABS = [
    {id: "luma", label: "Luma", title: "Compare source and output luma distributions"},
    {id: "chroma", label: "Chroma", title: "Compare source and output chroma distributions"},
    {id: "hue", label: "Hue", title: "Compare source and output hue distributions, excluding near-neutral pixels"}
  ];

  function histogramChannelLabel(channel = activeHistogramTab()) {
    if (channel === "chroma") return "Chroma";
    if (channel === "hue") return "Hue";
    return "Luma";
  }

  function histogramSpec(scope, channel = activeHistogramTab()) {
    const resolvedChannel = ["luma", "chroma", "hue"].includes(channel) ? channel : "luma";
    const resolvedScope = scope === "output" ? "output" : "source";
    const label = resolvedScope === "output" ? "Output" : "Source";
    return {
      key: `${resolvedScope}-${resolvedChannel}`,
      scope: resolvedScope,
      channel: resolvedChannel,
      heading: `${label} ${histogramChannelLabel(resolvedChannel).toLowerCase()} histogram`
    };
  }

  function activeHistogramTab() {
    const diagnostic = getState().diagnostics || {};
    const tab = diagnostic.histogramTab || diagnostic.panelTab;
    if (HISTOGRAM_TABS.some(item => item.id === tab)) return tab;
    if (tab === "source-chroma" || tab === "output-chroma") return "chroma";
    if (tab === "source-luma" || tab === "output-luma") return "luma";
    return "luma";
  }

  function setHistogramTab(next) {
    if (!HISTOGRAM_TABS.some(item => item.id === next) || next === activeHistogramTab()) return;
    const state = getState();
    if (!state.diagnostics) state.diagnostics = {};
    state.diagnostics.histogramTab = next;
    renderHistogramPanel(state.diagnostics.histogramStats || null);
    onDiagnosticsTabChange(next);
  }

  function bindHistogramTabEvents() {
    const tabs = els.diagnosticsTabs;
    if (!tabs?.addEventListener || overlayBoundElements.has(tabs)) return;
    overlayBoundElements.add(tabs);
    tabs.addEventListener("click", event => {
      const button = event.target?.closest?.("[data-histogram-tab]");
      if (!button) return;
      setHistogramTab(button.dataset.histogramTab);
    });
  }

  function renderHistogramTabs() {
    if (!els.diagnosticsTabs) return;
    bindHistogramTabEvents();
    const active = activeHistogramTab();
    els.diagnosticsTabs.innerHTML = HISTOGRAM_TABS.map(tab => {
      const selected = tab.id === active;
      return `<button type="button" class="ghost mini-control${selected ? " is-active" : ""}" data-histogram-tab="${tab.id}" role="tab" aria-selected="${selected}" title="${tab.title}">${tab.label}</button>`;
    }).join("");
  }

  function diagnosticsOverlayState() {
    const overlay = getState().diagnostics?.overlay || {};
    const mode = ["swatch", "difference"].includes(overlay.mode) ? overlay.mode : "none";
    const swatchIndex = Number.isInteger(overlay.swatchIndex) ? overlay.swatchIndex : null;
    return {mode, swatchIndex};
  }

  function requestDiagnosticOverlay(next) {
    setDiagnosticOverlay(next);
    renderDiagnosticsPanel(getState().diagnostics?.stats);
  }

  function swatchGraphAttrs(index, displayIndex = index) {
    const label = `Activate swatch ${Number(displayIndex) + 1}`;
    return `data-palette-graph-swatch-index="${index}" tabindex="0" role="button" aria-label="${label}"`;
  }

  function diagnosticSwatchIndex(record, fallbackIndex = 0) {
    return Number.isInteger(record?.displayIndex) ? record.displayIndex : fallbackIndex;
  }

  function graphSwatchStateClasses(record, index = 0) {
    const state = getState();
    const classes = [];
    if (record?.muted) classes.push("is-muted");
    if (record?.locked) classes.push("is-locked");
    if (cycleTagged(record)) classes.push("is-cycle-tagged");
    if (record?.swatchId && state.manualEditor?.swatchId === record.swatchId) classes.push("is-selected");
    const overlay = diagnosticsOverlayState();
    if (overlay.mode === "swatch" && overlay.swatchIndex === diagnosticSwatchIndex(record, index)) {
      classes.push("is-diagnostic-overlay");
    }
    return classes;
  }

  function graphSwatchClass(record, index = 0, base = "xray-swatch-marker") {
    const stateClasses = graphSwatchStateClasses(record, index);
    return `${base}${stateClasses.length ? ` ${stateClasses.join(" ")}` : ""}`;
  }

  function graphSwatchTitle(record, index, lab = record?.lab) {
    const display = (record?.displayIndex ?? index) + 1;
    const hex = record?.hex || (Array.isArray(lab) ? labToHex(lab) : "");
    const stateParts = [];
    if (record?.muted) stateParts.push("muted");
    if (record?.locked) stateParts.push("locked");
    if (cycleTagged(record)) stateParts.push("cycle-tagged");
    if (record?.swatchId && getState().manualEditor?.swatchId === record.swatchId) stateParts.push("selected");
    const overlay = diagnosticsOverlayState();
    if (overlay.mode === "swatch" && overlay.swatchIndex === diagnosticSwatchIndex(record, index)) stateParts.push("diagnostic overlay");
    const stateText = stateParts.length ? ` · ${stateParts.join(" · ")}` : "";
    return `swatch ${display} · ${colorInfoLabel(hex, lab)}${stateText}`;
  }

  function xrayMatchAliasEntries(stats) {
    return (stats?.entries || []).filter(entry => entry?.alias && Array.isArray(entry.featureLab) && entry.sourceRecord);
  }

  function xrayMatchAliasDisplayIndex(entry, records = []) {
    const record = entry?.sourceRecord;
    const fallbackIndex = records.indexOf(record);
    const index = Number.isInteger(record?.displayIndex)
      ? record.displayIndex
      : (fallbackIndex >= 0 ? fallbackIndex : 0);
    return index + 1;
  }

  function xrayMatchAliasTitle(entry, records = []) {
    const hex = labToHex(entry.featureLab);
    return `match anchor for swatch ${xrayMatchAliasDisplayIndex(entry, records)} · ${colorInfoLabel(hex, entry.featureLab)}`;
  }

  function mutedCircleSlash(cx, cy, radius) {
    const inset = Math.max(2.2, Number(radius) * 0.72);
    return `<line class="xray-swatch-muted-slash" x1="${(cx - inset).toFixed(1)}" y1="${(cy + inset).toFixed(1)}" x2="${(cx + inset).toFixed(1)}" y2="${(cy - inset).toFixed(1)}"/>`;
  }

  function mutedRectSlash(x, y, width, height, inset = 1.2) {
    return `<line class="xray-swatch-muted-slash" x1="${(x + inset).toFixed(1)}" y1="${(y + height - inset).toFixed(1)}" x2="${(x + width - inset).toFixed(1)}" y2="${(y + inset).toFixed(1)}"/>`;
  }

  function graphSwatchTarget(event) {
    const target = event?.target?.closest?.("[data-palette-graph-swatch-index]");
    if (!target) return null;
    const index = Number(target.dataset?.paletteGraphSwatchIndex);
    return Number.isInteger(index) ? {target, index} : null;
  }

  function graphSwatchPlotMode(target) {
    const svg = target?.closest?.("svg.xray-plot") || target?.closest?.(".xray-plot");
    return svg?.dataset?.xrayPlotMode || xrayMode;
  }

  function graphSwatchDraggable(target) {
    return ["scatter", "wheel", "ramp"].includes(graphSwatchPlotMode(target));
  }

  function graphSwatchRecords() {
    const diagnostic = getState().diagnostics || {};
    return Array.isArray(diagnostic.xrayStats?.records)
      ? diagnostic.xrayStats.records
      : (Array.isArray(diagnostic.stats?.records) ? diagnostic.stats.records : []);
  }

  function svgViewBox(svg) {
    const base = svg?.viewBox?.baseVal;
    if (base && Number.isFinite(base.width) && Number.isFinite(base.height) && base.width > 0 && base.height > 0) {
      return {x: Number(base.x) || 0, y: Number(base.y) || 0, width: base.width, height: base.height};
    }
    const raw = svg?.getAttribute?.("viewBox") || svg?.dataset?.xrayViewBox || "";
    const parts = String(raw).trim().split(/[\s,]+/).map(Number);
    if (parts.length >= 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
      return {x: parts[0], y: parts[1], width: parts[2], height: parts[3]};
    }
    return null;
  }

  function svgPointFromEvent(event, svg) {
    if (!event || !svg) return null;
    const clientX = Number(event.clientX) || 0;
    const clientY = Number(event.clientY) || 0;
    const box = svgViewBox(svg);
    const rect = svg.getBoundingClientRect?.();
    // Prefer the rendered bounding box over getScreenCTM. The X-Ray SVGs are
    // ordinary viewBox-scaled plots, and in some browser/layout combinations
    // getScreenCTM can effectively hand back page-space coordinates. That makes
    // a small drag look like a jump to an axis extreme; the Lab clamp then eats
    // the swatch into black, white, or a tiny red wedge. Rect + viewBox keeps the
    // inverse mapping tied to the actual plotted pixels.
    if (box && rect && Number.isFinite(rect.left) && Number.isFinite(rect.top) && Number.isFinite(rect.width) && Number.isFinite(rect.height) && rect.width > 0 && rect.height > 0) {
      return {
        x: box.x + ((clientX - rect.left) / rect.width) * box.width,
        y: box.y + ((clientY - rect.top) / rect.height) * box.height
      };
    }
    if (typeof svg.createSVGPoint === "function" && typeof svg.getScreenCTM === "function") {
      const ctm = svg.getScreenCTM();
      if (ctm && typeof ctm.inverse === "function") {
        const point = svg.createSVGPoint();
        point.x = clientX;
        point.y = clientY;
        const mapped = point.matrixTransform(ctm.inverse());
        if (Number.isFinite(mapped.x) && Number.isFinite(mapped.y)) return {x: mapped.x, y: mapped.y};
      }
    }
    return null;
  }

  function xrayWheelMaxChroma(records = []) {
    let maxChroma = 18;
    for (const record of records) {
      const swatchLab = visibleSwatchLab(record) || record?.lab;
      if (!Array.isArray(swatchLab)) continue;
      const [, C] = labToOklch(swatchLab);
      if (C > maxChroma) maxChroma = C;
    }
    return maxChroma;
  }

  function xrayDragScale(svg) {
    const box = svgViewBox(svg);
    const rect = svg?.getBoundingClientRect?.();
    if (box && rect && Number.isFinite(rect.width) && Number.isFinite(rect.height) && rect.width > 0 && rect.height > 0) {
      return {x: box.width / rect.width, y: box.height / rect.height};
    }
    return {x: 1, y: 1};
  }

  function xrayDragStartPoint(mode, record, records = []) {
    if (!record || !Array.isArray(record.lab)) return null;
    if (mode === "scatter") {
      const width = 360;
      const height = 220;
      const pad = 16;
      const plotLeft = pad + 8;
      const plotRight = width - 10;
      return {
        x: hueXForPlot(record.lab, plotLeft, plotRight, pad),
        y: lightnessY(record.lab, height, pad)
      };
    }
    if (mode === "wheel") {
      const width = 240;
      const height = 240;
      const cx = width / 2;
      const cy = height / 2;
      const maxR = Math.min(cx, cy) - 14;
      const swatchLab = visibleSwatchLab(record) || record.lab;
      const [, C, h] = labToOklch(swatchLab);
      const r = (C / Math.max(1, xrayWheelMaxChroma(records))) * maxR;
      return {x: cx + Math.cos(h) * r, y: cy - Math.sin(h) * r};
    }
    if (mode === "ramp") {
      const width = 320;
      const padX = 22;
      return {x: padX + clamp(record.lab[0] / 100, 0, 1) * (width - padX * 2), y: 0};
    }
    return null;
  }

  function xrayDragPointFromEvent(event, drag) {
    if (!event || !drag?.startPoint || !drag?.scale) return svgPointFromEvent(event, drag?.svg);
    const clientX = Number(event.clientX) || 0;
    const clientY = Number(event.clientY) || 0;
    return {
      x: drag.startPoint.x + (clientX - drag.x) * drag.scale.x,
      y: drag.startPoint.y + (clientY - drag.y) * drag.scale.y
    };
  }

  function labForXrayDrag(mode, point, record, records = []) {
    if (!point || !record || !Array.isArray(record.lab)) return null;
    const currentLab = visibleSwatchLab(record) || record.lab;
    const [currentL, currentC, currentH] = labToOklch(currentLab);
    if (mode === "scatter") {
      const width = 360;
      const height = 220;
      const pad = 16;
      const plotLeft = pad + 8;
      const plotRight = width - 10;
      const plotWidth = plotRight - plotLeft;
      const L = clamp((1 - ((point.y - pad) / Math.max(1, height - pad * 2))) * 100, 0, 100);
      if (point.x < plotLeft) return oklchToLab([L, 0, currentH]);
      const h = clamp((point.x - plotLeft) / Math.max(1, plotWidth), 0, 1) * TAU;
      const C = currentC < NEUTRAL_CHROMA_EPSILON ? 12 : currentC;
      return fitLabToSrgb(oklchToLab([L, C, h]));
    }
    if (mode === "wheel") {
      const width = 240;
      const height = 240;
      const cx = width / 2;
      const cy = height / 2;
      const maxR = Math.min(cx, cy) - 14;
      const dx = point.x - cx;
      const dy = cy - point.y;
      const distance = Math.hypot(dx, dy);
      const h = distance < 1e-6 ? currentH : ((Math.atan2(dy, dx) % TAU) + TAU) % TAU;
      const C = clamp(distance / Math.max(1, maxR), 0, 1) * xrayWheelMaxChroma(records);
      return fitLabToSrgb(oklchToLab([currentL, C, h]));
    }
    if (mode === "ramp") {
      const width = 320;
      const padX = 22;
      const L = clamp((point.x - padX) / Math.max(1, width - padX * 2), 0, 1) * 100;
      return fitLabToSrgb(oklchToLab([L, currentC, currentH]));
    }
    return null;
  }

  function activateGraphSwatch(event, records = graphSwatchRecords()) {
    const picked = graphSwatchTarget(event);
    if (!picked) return false;
    const record = records[picked.index];
    if (!record) return false;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    void onPaletteSwatchClick(record, picked.index, event);
    return true;
  }

  function bindDiagnosticsOverlayEvents() {
    const usage = els.diagnosticsUsage;
    if (usage?.addEventListener && !overlayBoundElements.has(usage)) {
      overlayBoundElements.add(usage);
      usage.addEventListener("click", event => {
        const button = event.target?.closest?.("[data-diagnostic-swatch-index]");
        if (!button) return;
        const swatchIndex = Number(button.dataset.diagnosticSwatchIndex);
        if (!Number.isInteger(swatchIndex)) return;
        const current = diagnosticsOverlayState();
        const alreadyActive = current.mode === "swatch" && current.swatchIndex === swatchIndex;
        requestDiagnosticOverlay(alreadyActive ? {mode: "none"} : {mode: "swatch", swatchIndex});
      });
    }

    const off = els.diagnosticsOverlayOff;
    if (off?.addEventListener && !overlayBoundElements.has(off)) {
      overlayBoundElements.add(off);
      off.addEventListener("click", () => requestDiagnosticOverlay({mode: "none"}));
    }

    const difference = els.diagnosticsOverlayDifference;
    if (difference?.addEventListener && !overlayBoundElements.has(difference)) {
      overlayBoundElements.add(difference);
      difference.addEventListener("click", () => {
        const current = diagnosticsOverlayState();
        requestDiagnosticOverlay(current.mode === "difference" ? {mode: "none"} : {mode: "difference"});
      });
    }
  }

  function renderDiagnosticsOverlayControls(stats) {
    bindDiagnosticsOverlayEvents();
    if (!els.diagnosticsOverlayControls) return;
    const overlay = diagnosticsOverlayState();
    const records = Array.isArray(stats?.records) ? stats.records : [];
    const hasImageAndPalette = !!getState().imageData && !!stats?.records?.length;
    const swatchText = getConfig().assignMode === "blend" ? "Swatch heatmap" : "Swatch mask";

    if (els.diagnosticsOverlayOff) {
      els.diagnosticsOverlayOff.classList?.toggle?.("is-active", overlay.mode === "none");
      els.diagnosticsOverlayOff.setAttribute?.("aria-pressed", String(overlay.mode === "none"));
      els.diagnosticsOverlayOff.disabled = !hasImageAndPalette && overlay.mode === "none";
    }
    if (els.diagnosticsOverlayDifference) {
      els.diagnosticsOverlayDifference.classList?.toggle?.("is-active", overlay.mode === "difference");
      els.diagnosticsOverlayDifference.setAttribute?.("aria-pressed", String(overlay.mode === "difference"));
      els.diagnosticsOverlayDifference.disabled = !hasImageAndPalette;
    }
    if (els.diagnosticsOverlayStatus) {
      if (!hasImageAndPalette) {
        els.diagnosticsOverlayStatus.textContent = "Open an image and build a palette to use overlays.";
      } else if (overlay.mode === "difference") {
        els.diagnosticsOverlayStatus.textContent = "";
      } else if (overlay.mode === "swatch" && overlay.swatchIndex !== null) {
        const item = {index: overlay.swatchIndex, record: records[overlay.swatchIndex] || null};
        els.diagnosticsOverlayStatus.textContent = `${swatchText}: ${usageSwatchTitle(item, getConfig(), records)}.`;
      } else {
        els.diagnosticsOverlayStatus.textContent = "";
      }
    }
  }

  function histogramPercent(value) {
    const pct = Math.max(0, Number(value) || 0) * 100;
    if (pct < 0.5 && pct > 0) return "<0.5%";
    return `${pct.toFixed(0)}%`;
  }

  function histogramValueForLab(lab, channel) {
    if (!Array.isArray(lab)) return null;
    const parts = labDistanceComponents(lab);
    if (channel === "chroma") return parts.chroma;
    if (channel === "hue") {
      const [, chroma, hue] = labToOklch(lab);
      if (chroma < NEUTRAL_CHROMA_EPSILON) return null;
      return hue * 180 / Math.PI;
    }
    return parts.lightness;
  }

  function histogramMarkerLabForRecord(record) {
    // Histogram markers represent the visible swatch chips, not the internal
    // matcher coordinates. This is deliberately hex-first; see PaletteRecord's
    // object-model comment in color-utils.js.
    return visibleSwatchLab(record);
  }

  function histogramAxisValues(histogram, domainMax) {
    if (histogram.channel === "hue") return [0, 60, 120, 180, 240, 300, 360];
    if (histogram.channel === "chroma") return [0, domainMax * 0.25, domainMax * 0.5, domainMax * 0.75, domainMax];
    return [0, 25, 50, 75, 100];
  }

  function renderHistogramChart(histogramStats = null, {scope = "source", channel = "luma"} = {}) {
    const state = getState();
    const histogram = histogramStats?.histogram || histogramStats?.sample?.histogram;
    const bins = Array.isArray(histogram?.bins) ? histogram.bins : [];
    const scopeLabel = scope === "output" ? "Output" : "Source";
    const channelLabel = histogramChannelLabel(channel).toLowerCase();
    if (!histogram || !bins.length || !(Number(histogram.total) > 0)) {
      const omitted = Number(histogram?.omittedLowChromaCount) || 0;
      const message = histogram?.channel === "hue" && omitted > 0
        ? `All ${omitted.toLocaleString()} sampled ${scopeLabel.toLowerCase()} pixels were below chroma ${formatDistance(histogram.lowChromaThreshold)}; hue is undefined there.`
        : state.imageData
        ? `Open this tab to sample ${scopeLabel.toLowerCase()} ${channelLabel}.${channel === "hue" ? " Near-neutral pixels are skipped." : ""}`
        : `Open an image to see sampled ${channelLabel}.`;
      return `<div class="diagnostics-histogram-card is-empty"><div class="diagnostics-subhead">${scopeLabel}</div><div class="diagnostics-histogram-empty">${message}</div></div>`;
    }

    const width = 360;
    const height = 112;
    const padX = 16;
    const padTop = 8;
    const plotH = 82;
    const markerY = height - 8;
    const plotW = width - padX * 2;
    const max = Math.max(1, Number(histogram.max) || Math.max(...bins, 1));
    const fallbackMax = histogram.channel === "hue" ? 360 : (histogram.channel === "chroma" ? 32 : 100);
    const domainMax = Math.max(1, Number(histogram.domain?.max) || fallbackMax);
    const axisLabel = histogram.axisLabel || (histogram.channel === "chroma" ? "C" : (histogram.channel === "hue" ? "H°" : "L"));
    const xForValue = value => padX + (clamp(Number(value) || 0, 0, domainMax) / domainMax) * plotW;
    const segmentNames = Array.isArray(histogram.segmentNames) && histogram.segmentNames.length
      ? histogram.segmentNames
      : (histogram.channel === "luma" ? ["neutral", "muted", "vivid"] : ["shadow", "midtone", "highlight"]);
    const segments = histogram.segments || histogram.bands || {};
    const barGap = bins.length <= 56 ? 0.7 : 0.35;
    const barW = Math.max(0.75, plotW / bins.length - barGap);
    const bars = bins.map((count, index) => {
      const total = Math.max(0, Number(count) || 0);
      if (!total) return "";
      const x = padX + (index / bins.length) * plotW;
      let cursor = padTop + plotH;
      const rendered = segmentNames.map(name => {
        const values = Array.isArray(segments[name]) ? segments[name] : [];
        const value = Math.max(0, Number(values[index]) || 0);
        if (!value) return "";
        const h = Math.max(0.8, (value / max) * plotH);
        cursor -= h;
        return `<rect class="diagnostics-histogram-bar is-${name}" x="${x.toFixed(2)}" y="${cursor.toFixed(2)}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}"></rect>`;
      }).join("");
      const v0 = (index / bins.length) * domainMax;
      const v1 = ((index + 1) / bins.length) * domainMax;
      return `<g><title>${axisLabel} ${formatDistance(v0)}–${formatDistance(v1)}: ${total} samples</title>${rendered}</g>`;
    }).join("");

    const stats = histogram.stats || histogram.sourceLightness || {};
    const p10 = xForValue(stats.p10);
    const p90 = xForValue(stats.p90);
    const median = xForValue(stats.median);
    const mean = xForValue(stats.mean);
    const mode = xForValue(stats.mode);
    const quantileBand = histogram.channel === "hue"
      ? ""
      : `<rect class="diagnostics-histogram-quantile" x="${Math.min(p10, p90).toFixed(2)}" y="${(padTop - 4).toFixed(2)}" width="${Math.max(0, Math.abs(p90 - p10)).toFixed(2)}" height="${(plotH + 8).toFixed(2)}"><title>middle 80% ${histogram.label || "samples"}</title></rect>`;
    const medianMarker = histogram.channel === "hue"
      ? ""
      : `<line class="diagnostics-histogram-median" x1="${median.toFixed(2)}" y1="${(padTop - 7).toFixed(2)}" x2="${median.toFixed(2)}" y2="${(padTop + plotH + 5).toFixed(2)}"><title>median ${axisLabel} ${formatDistance(stats.median)}</title></line>`;
    const statMarkers = `<line class="diagnostics-histogram-mean" x1="${mean.toFixed(2)}" y1="${(padTop - 7).toFixed(2)}" x2="${mean.toFixed(2)}" y2="${(padTop + plotH + 5).toFixed(2)}"><title>${histogram.channel === "hue" ? "circular " : ""}mean ${axisLabel} ${formatDistance(stats.mean)}</title></line>
      ${medianMarker}
      <line class="diagnostics-histogram-mode" x1="${mode.toFixed(2)}" y1="${(padTop - 4).toFixed(2)}" x2="${mode.toFixed(2)}" y2="${(padTop + plotH + 3).toFixed(2)}"><title>mode bin ${axisLabel} ${formatDistance(stats.mode)}</title></line>`;

    const records = Array.isArray(histogramStats?.records)
      ? histogramStats.records
      : (Array.isArray(state.diagnostics?.stats?.records) ? state.diagnostics.stats.records : []);
    const paletteMarkers = records.map((record, index) => {
      const markerLab = histogramMarkerLabForRecord(record);
      const value = histogramValueForLab(markerLab, histogram.channel);
      if (!Number.isFinite(Number(value))) return "";
      const x = xForValue(value);
      const hex = record.hex || labToHex(markerLab || record.lab);
      const displayIndex = (record.displayIndex ?? index) + 1;
      const muted = record.muted
        ? `<line class="xray-swatch-muted-slash diagnostics-histogram-muted-slash" x1="${(x - 4).toFixed(2)}" y1="${(markerY - 1).toFixed(2)}" x2="${(x + 4).toFixed(2)}" y2="${(padTop + plotH + 4).toFixed(2)}"/>`
        : "";
      const mutedText = record.muted ? " · muted" : "";
      return `<g class="${graphSwatchClass(record, index, "diagnostics-graph-swatch")}" ${swatchGraphAttrs(index, record.displayIndex ?? index)}><title>swatch ${displayIndex} · ${axisLabel} ${formatDistance(value)} · ${colorInfoLabel(hex, markerLab)}${mutedText}</title><line class="diagnostics-histogram-marker" style="--marker-color:${hex}" x1="${x.toFixed(2)}" y1="${(padTop + plotH + 3).toFixed(2)}" x2="${x.toFixed(2)}" y2="${markerY.toFixed(2)}"></line>${muted}<line class="diagnostics-histogram-hit" x1="${x.toFixed(2)}" y1="${(padTop + plotH).toFixed(2)}" x2="${x.toFixed(2)}" y2="${markerY.toFixed(2)}"/></g>`;
    }).join("");

    const axisValues = histogramAxisValues(histogram, domainMax);
    const axis = axisValues.map(value => {
      const x = xForValue(value);
      return `<line class="diagnostics-histogram-grid" x1="${x.toFixed(1)}" y1="${padTop}" x2="${x.toFixed(1)}" y2="${padTop + plotH}"></line>`;
    }).join("");
    const axisTicks = axisValues.map(value => {
      const tick = (clamp(Number(value) || 0, 0, domainMax) / domainMax) * 100;
      const label = histogram.channel === "hue" ? `${Math.round(value)}°` : formatDistance(value);
      const edgeClass = tick <= 0.01 ? " is-start" : (tick >= 99.99 ? " is-end" : "");
      return `<span class="diagnostics-histogram-axis-tick${edgeClass}" style="--tick-left:${tick.toFixed(2)}%">${label}</span>`;
    }).join("");

    const total = Number(histogram.total ?? 0) || 0;
    const step = Number(histogram.step) || 1;
    const range = histogram.channel === "hue"
      ? `mode ${formatDistance(stats.mode)}°`
      : (Number.isFinite(Number(stats.p10)) && Number.isFinite(Number(stats.p90)) ? `${formatDistance(stats.p10)}–${formatDistance(stats.p90)}` : "—");
    const detailText = histogram.channel === "chroma"
      ? `mean C ${formatDistance(stats.mean)} · median ${formatDistance(stats.median)} · max ${formatDistance(stats.max)} · shadows ${histogramPercent(stats.shadowPercent)} / highlights ${histogramPercent(stats.highlightPercent)}`
      : histogram.channel === "hue"
        ? `circular mean ${formatDistance(stats.mean)}° · mode ${formatDistance(stats.mode)}° · low-C skipped ${(Number(histogram.omittedLowChromaCount) || 0).toLocaleString()} < ${formatDistance(histogram.lowChromaThreshold)}`
        : `mean L ${formatDistance(stats.mean)} · median ${formatDistance(stats.median)} · mode ${formatDistance(stats.mode)} · vivid ${histogramPercent(stats.saturatedPercent)}`;
    const overflow = histogram.overflowCount ? ` · ${histogram.overflowCount.toLocaleString()} above axis` : "";
    const segmentLabel = histogram.channel === "luma" ? "neutral / muted / vivid stacks" : "shadow / mid / highlight stacks";
    return `<div class="diagnostics-histogram-card"><div class="diagnostics-subhead">${scopeLabel}</div>
      <div class="diagnostics-histogram-labels"><span>${segmentLabel}</span></div>
      <div class="diagnostics-histogram-plot-wrap" style="--histogram-pad-x:${padX}px">
        <svg class="diagnostics-histogram-plot" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="group" aria-label="${scopeLabel} ${channelLabel} histogram; palette markers are clickable">
          <rect class="diagnostics-histogram-bg" x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="5"/>
          ${quantileBand}
          ${axis}
          ${bars}
          ${statMarkers}
          ${paletteMarkers}
        </svg>
        <div class="diagnostics-histogram-axis-row" aria-hidden="true">${axisTicks}</div>
      </div>
      <div class="diagnostics-histogram-readouts"><div>${total.toLocaleString()} samples · step ${step}px · ${histogram.channel === "hue" ? "hue " : "p10–p90 "}${range}${overflow}</div><div>${detailText}</div></div>
    </div>`;
  }

  function bindHistogramGraphEvents() {
    const container = els.diagnosticsHistogram;
    if (!container?.addEventListener || overlayBoundElements.has(container)) return;
    overlayBoundElements.add(container);
    container.addEventListener("click", event => {
      activateGraphSwatch(event, histogramGraphActivationRecords);
    });
    container.addEventListener("keydown", event => {
      if (!["Enter", " "].includes(event.key)) return;
      activateGraphSwatch(event, histogramGraphActivationRecords);
    });
  }

  function renderHistogramPanel(histogramStats = getState().diagnostics?.histogramStats) {
    renderHistogramTabs();
    if (!els.diagnosticsHistogram) return;
    bindHistogramGraphEvents();
    const channel = activeHistogramTab();
    const sourceSpec = histogramSpec("source", channel);
    const outputSpec = histogramSpec("output", channel);
    if (els.diagnosticsHistogramHeading) els.diagnosticsHistogramHeading.textContent = `${histogramChannelLabel(channel)} histograms`;
    const stats = histogramStats && typeof histogramStats === "object" ? histogramStats : {};
    histogramGraphActivationRecords = Array.isArray(stats[sourceSpec.key]?.records)
      ? stats[sourceSpec.key].records
      : (Array.isArray(stats[outputSpec.key]?.records) ? stats[outputSpec.key].records : graphSwatchRecords());
    els.diagnosticsHistogram.innerHTML = `<div class="diagnostics-histogram-pair">
      ${renderHistogramChart(stats[sourceSpec.key] || null, sourceSpec)}
      ${renderHistogramChart(stats[outputSpec.key] || null, outputSpec)}
    </div>`;
  }

  function renderDiagnosticsUsage(stats) {
    if (!els.diagnosticsUsage) return;
    const config = getConfig();
    if (els.diagnosticsUsageHeading) els.diagnosticsUsageHeading.textContent = assignmentContributionModeLabel(config);
    const usage = stats?.sample?.usage || [];
    if (!usage.length) {
      els.diagnosticsUsage.innerHTML = "";
      return;
    }
    // In nearest mode, contribution is mathematically identical to nearest
    // territory, so the secondary "#1 X%" column would duplicate the main
    // contribution percentage. Hide it in that mode; surface it in blend
    // and dither modes where it is meaningfully different.
    const showTerritoryColumn = config.assignMode !== "nearest";
    const overlay = diagnosticsOverlayState();
    const records = Array.isArray(stats?.records) ? stats.records : [];
    const rows = usage
      .slice()
      .sort((a, b) => b.percent - a.percent || b.territoryPercent - a.territoryPercent || usageOrderValue(a, config, records) - usageOrderValue(b, config, records) || a.index - b.index)
      .map(item => {
        const pct = clamp(item.percent * 100, 0, 100);
        const record = usageRecord(item, records);
        const swatchTitle = usageSwatchTitle(item, config, records);
        const colorInfo = colorInfoLabel(item.hex, record?.lab);
        const territoryNote = showTerritoryColumn
          ? `<small title="Nearest-only territory: ${formatUsagePercent(item.territoryPercent)}">${formatUsagePercent(item.territoryPercent)}</small>`
          : "";
        const aliasNote = item.aliasPercent > 0
          ? ` · alias ${formatUsagePercent(item.aliasPercent)}`
          : "";
        const titleParts = [swatchTitle, colorInfo, `contribution ${formatUsagePercent(item.percent)}`];
        if (showTerritoryColumn) titleParts.push(`nearest ${formatUsagePercent(item.territoryPercent)}`);
        if (item.aliasPercent > 0) titleParts.push(`alias ${formatUsagePercent(item.aliasPercent)}`);
        if (item.load !== "balanced") titleParts.push(item.load);
        const overlayActive = overlay.mode === "swatch" && overlay.swatchIndex === item.index;
        return `<div class="diagnostic-usage-row is-${item.load}${overlayActive ? " is-overlay-target" : ""}" title="${titleParts.join(" · ")}${aliasNote}">
          <button type="button" class="diagnostic-usage-swatch-button" data-diagnostic-swatch-index="${item.index}" aria-pressed="${overlayActive}" title="Show ${config.assignMode === "blend" ? "blend contribution heatmap" : "assignment mask"} for ${swatchTitle} · ${colorInfo}">
            <i class="diagnostic-usage-swatch" style="background:${item.hex}" title="${colorInfo}"></i>
          </button>
          <span class="diagnostic-usage-track"><span class="diagnostic-usage-fill" style="--usage-pct:${pct}%"></span></span>
          <b>${formatUsagePercent(item.percent)}</b>
          ${territoryNote}
        </div>`;
      }).join("");
    els.diagnosticsUsage.classList.toggle("has-territory", showTerritoryColumn);
    els.diagnosticsUsage.innerHTML = rows;
  }

  // The X-Ray supports several legitimately different views over the same
  // palette records: a 2D scatter (Hue×L), a polar OKLCh wheel (Hue×Chroma),
  // a 1D Lightness ramp, an N×N proximity matrix, and a rotatable 3D LCH
  // cylinder. Each surfaces a different property — geometry, hue/gamut reach,
  // tonal coverage, pairwise relationships, and full L/C/H volume respectively
  // — so they complement each other rather than just restyling the same data.
  const XRAY_MODES = [
    {id: "scatter",   label: "Scatter",   title: "Hue × Lightness scatter"},
    {id: "wheel",     label: "Wheel",     title: "Polar OKLCh: hue around the rim, chroma as radius"},
    {id: "ramp",      label: "Tonal",     title: "Lightness ramp — surfaces tonal coverage gaps"},
    {id: "proximity", label: "Proximity", title: "Pairwise weighted distance — surfaces collisions"},
    {id: "cylinder",  label: "Cylinder",  title: "Rotatable 3D LCH cylinder — drag to orbit hue/chroma around lightness"}
  ];
  let xrayMode = "scatter";
  const XRAY_CYLINDER_MAX_PITCH = Math.PI / 2;
  let xrayCylinderYaw = -0.62;
  let xrayCylinderPitch = 0.28;
  let xrayCylinderDrag = null;
  let xrayCylinderSuppressClick = false;
  let xrayGraphDrag = null;
  let xrayGraphSuppressClick = false;

  function rerenderXrayFromState() {
    const diagnostic = getState().diagnostics || {};
    renderDiagnosticsXray(diagnostic.xrayStats || diagnostic.stats);
  }

  function bindXrayModeEvents() {
    const container = els.diagnosticsXray;
    if (!container?.addEventListener || overlayBoundElements.has(container)) return;
    overlayBoundElements.add(container);
    container.addEventListener("click", event => {
      if (xrayGraphSuppressClick) {
        xrayGraphSuppressClick = false;
        event.preventDefault?.();
        event.stopPropagation?.();
        return;
      }
      if (xrayCylinderSuppressClick && event.target?.closest?.("[data-xray-cylinder]")) {
        xrayCylinderSuppressClick = false;
        event.preventDefault?.();
        event.stopPropagation?.();
        return;
      }
      const altShiftGraphSwatch = event.altKey && event.shiftKey ? graphSwatchTarget(event) : null;
      if (altShiftGraphSwatch && graphSwatchDraggable(altShiftGraphSwatch.target)) {
        event.preventDefault?.();
        event.stopPropagation?.();
        return;
      }
      if (activateGraphSwatch(event)) return;
      const button = event.target?.closest?.("[data-xray-mode]");
      if (!button) return;
      const next = button.dataset.xrayMode;
      if (!XRAY_MODES.some(mode => mode.id === next) || next === xrayMode) return;
      xrayMode = next;
      rerenderXrayFromState();
    });
    container.addEventListener("dblclick", event => {
      if (!event.altKey || !event.shiftKey) return;
      const picked = graphSwatchTarget(event);
      if (!picked || !graphSwatchDraggable(picked.target)) return;
      const record = graphSwatchRecords()[picked.index];
      if (!record) return;
      event.preventDefault?.();
      event.stopPropagation?.();
      onGraphSwatchPromoteAnchor(record, {event, index: picked.index});
    });
    container.addEventListener("pointerdown", event => {
      const swatchTarget = event.altKey ? event.target?.closest?.("[data-palette-graph-swatch-index]") : null;
      const svg = swatchTarget?.closest?.("svg.xray-plot") || swatchTarget?.closest?.(".xray-plot");
      const dragMode = svg?.dataset?.xrayPlotMode || xrayMode;
      if (swatchTarget && ["scatter", "wheel", "ramp"].includes(dragMode)) {
        const records = graphSwatchRecords();
        const index = Number(swatchTarget.dataset.paletteGraphSwatchIndex);
        const record = Number.isInteger(index) ? records[index] : null;
        const lab = visibleSwatchLab(record) || record.lab;
        const startPoint = xrayDragStartPoint(dragMode, record, records);
        if (Array.isArray(lab) && startPoint && onGraphSwatchReposition(record, lab, {phase: "start", mode: dragMode, event, index, dropMatchAnchor: !!event.shiftKey}) !== false) {
          event.preventDefault?.();
          event.stopPropagation?.();
          swatchTarget.setPointerCapture?.(event.pointerId);
          xrayGraphDrag = {
            target: swatchTarget,
            svg,
            mode: dragMode,
            record,
            index,
            records,
            moved: false,
            dropMatchAnchor: !!event.shiftKey,
            matchAnchorDropped: false,
            startLab: [...lab],
            matchAnchorHex: labToHex(lab),
            x: Number(event.clientX) || 0,
            y: Number(event.clientY) || 0,
            startPoint,
            scale: xrayDragScale(svg)
          };
          return;
        }
      }
      const target = event.target?.closest?.("[data-xray-cylinder]");
      if (!target || xrayMode !== "cylinder") return;
      event.preventDefault?.();
      target.setPointerCapture?.(event.pointerId);
      xrayCylinderDrag = {
        x: Number(event.clientX) || 0,
        y: Number(event.clientY) || 0,
        yaw: xrayCylinderYaw,
        pitch: xrayCylinderPitch,
        moved: false
      };
    });
    container.addEventListener("pointermove", event => {
      if (xrayGraphDrag) {
        const x = Number(event.clientX) || 0;
        const y = Number(event.clientY) || 0;
        if (Math.hypot(x - xrayGraphDrag.x, y - xrayGraphDrag.y) <= 3) {
          event.preventDefault?.();
          return;
        }
        xrayGraphDrag.moved = true;
        const point = xrayDragPointFromEvent(event, xrayGraphDrag);
        const lab = labForXrayDrag(xrayGraphDrag.mode, point, xrayGraphDrag.record, xrayGraphDrag.records);
        if (lab) {
          event.preventDefault?.();
          if (xrayGraphDrag.dropMatchAnchor && !xrayGraphDrag.matchAnchorDropped) {
            onGraphSwatchReposition(xrayGraphDrag.record, xrayGraphDrag.startLab, {
              phase: "anchor",
              mode: xrayGraphDrag.mode,
              event,
              index: xrayGraphDrag.index,
              anchorHex: xrayGraphDrag.matchAnchorHex
            });
            xrayGraphDrag.matchAnchorDropped = true;
          }
          onGraphSwatchReposition(xrayGraphDrag.record, lab, {
            phase: "move",
            mode: xrayGraphDrag.mode,
            event,
            index: xrayGraphDrag.index,
            matchAnchorDropped: xrayGraphDrag.matchAnchorDropped
          });
        }
        return;
      }
      if (!xrayCylinderDrag || xrayMode !== "cylinder") return;
      const x = Number(event.clientX) || 0;
      const y = Number(event.clientY) || 0;
      if (Math.hypot(x - xrayCylinderDrag.x, y - xrayCylinderDrag.y) > 3) xrayCylinderDrag.moved = true;
      xrayCylinderYaw = xrayCylinderDrag.yaw + (x - xrayCylinderDrag.x) * 0.012;
      xrayCylinderPitch = clamp(xrayCylinderDrag.pitch - (y - xrayCylinderDrag.y) * 0.008, -XRAY_CYLINDER_MAX_PITCH, XRAY_CYLINDER_MAX_PITCH);
      rerenderXrayFromState();
    });
    const endGraphDrag = (event, phase = "end") => {
      if (!xrayGraphDrag) return false;
      const drag = xrayGraphDrag;
      const finalPhase = drag.moved ? phase : "cancel";
      const point = xrayDragPointFromEvent(event, drag);
      const lab = finalPhase === "cancel"
        ? (visibleSwatchLab(drag.record) || drag.record?.lab)
        : labForXrayDrag(drag.mode, point, drag.record, drag.records);
      if (lab) onGraphSwatchReposition(drag.record, lab, {phase: finalPhase, mode: drag.mode, event, index: drag.index, matchAnchorDropped: drag.matchAnchorDropped});
      xrayGraphSuppressClick = true;
      if (typeof setTimeout === "function") setTimeout(() => { xrayGraphSuppressClick = false; }, 0);
      drag.target?.releasePointerCapture?.(event.pointerId);
      xrayGraphDrag = null;
      event.preventDefault?.();
      event.stopPropagation?.();
      return true;
    };
    const endCylinderDrag = event => {
      if (!xrayCylinderDrag) return;
      xrayCylinderSuppressClick = !!xrayCylinderDrag.moved;
      if (xrayCylinderSuppressClick && typeof setTimeout === "function") {
        setTimeout(() => { xrayCylinderSuppressClick = false; }, 0);
      }
      event.target?.releasePointerCapture?.(event.pointerId);
      xrayCylinderDrag = null;
    };
    container.addEventListener("pointerup", event => {
      if (endGraphDrag(event)) return;
      endCylinderDrag(event);
    });
    container.addEventListener("pointercancel", event => {
      if (endGraphDrag(event, "cancel")) return;
      endCylinderDrag(event);
    });
    container.addEventListener("keydown", event => {
      if (["Enter", " "].includes(event.key) && activateGraphSwatch(event)) return;
      const target = event.target?.closest?.("[data-xray-cylinder]");
      if (!target || xrayMode !== "cylinder") return;
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(event.key)) return;
      event.preventDefault?.();
      if (event.key === "ArrowLeft") xrayCylinderYaw -= 0.12;
      else if (event.key === "ArrowRight") xrayCylinderYaw += 0.12;
      else if (event.key === "ArrowUp") xrayCylinderPitch = clamp(xrayCylinderPitch + 0.08, -XRAY_CYLINDER_MAX_PITCH, XRAY_CYLINDER_MAX_PITCH);
      else if (event.key === "ArrowDown") xrayCylinderPitch = clamp(xrayCylinderPitch - 0.08, -XRAY_CYLINDER_MAX_PITCH, XRAY_CYLINDER_MAX_PITCH);
      else { xrayCylinderYaw = -0.62; xrayCylinderPitch = 0.28; }
      rerenderXrayFromState();
    });
  }

  function xrayModeBarHtml() {
    return `<div class="diagnostics-xray-modes" role="tablist" aria-label="Palette X-Ray view">${
      XRAY_MODES.map(mode => {
        const active = mode.id === xrayMode;
        return `<button type="button" class="ghost mini-control${active ? " is-active" : ""}" data-xray-mode="${mode.id}" role="tab" aria-selected="${active}" title="${mode.title}">${mode.label}</button>`;
      }).join("")
    }</div>`;
  }

  function renderXrayScatter(stats) {
    const records = stats?.records || [];
    const entries = stats?.entries || [];
    const width = 360;
    const height = 220;
    const pad = 16;
    const plotLeft = pad + 8; // neutral column lives between pad and plotLeft
    const plotRight = width - 10;

    // Lightness y-axis: tick lines at 0/25/50/75/100, labelled at 0/50/100.
    const lightnessTicks = [0, 25, 50, 75, 100].map(L => {
      const y = lightnessY([L, 0, 0], height, pad);
      const major = L === 0 || L === 50 || L === 100;
      const opacity = major ? 0.22 : 0.10;
      const label = major
        ? `<text x="${(pad - 4).toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="end" class="xray-axis">${L}</text>`
        : "";
      return `<line x1="${plotLeft}" y1="${y.toFixed(1)}" x2="${plotRight}" y2="${y.toFixed(1)}" stroke="rgba(184,196,214,${opacity})"/>${label}`;
    }).join("");

    // Hue x-axis: cardinal-hue colored dots above the plot so users can read
    // the hue mapping at a glance. Angles are in OKLab a/b space.
    const hueStops = [
      {h: 0,                 name: "R"},
      {h: TAU * (60 / 360),  name: "Y"},
      {h: TAU * (140 / 360), name: "G"},
      {h: TAU * (190 / 360), name: "C"},
      {h: TAU * (260 / 360), name: "B"},
      {h: TAU * (330 / 360), name: "M"}
    ];
    const plotWidth = plotRight - plotLeft;
    const hueMarks = hueStops.map(stop => {
      const x = plotLeft + (stop.h / TAU) * plotWidth;
      const hueLab = fitLabToSrgb(oklchToLab([62, 26, stop.h]));
      const hex = labToHex(hueLab);
      return `<circle cx="${x.toFixed(1)}" cy="${(pad - 6).toFixed(1)}" r="2.2" fill="${hex}" stroke="rgba(8,10,13,.6)" stroke-width="0.6"/>
        <text x="${x.toFixed(1)}" y="${(pad - 9).toFixed(1)}" text-anchor="middle" class="xray-axis">${stop.name}</text>`;
    }).join("");

    // Neutral column: a subtle band between pad and plotLeft where every
    // record with chroma below NEUTRAL_CHROMA_EPSILON gets stacked. The band
    // makes that collapse legible instead of being an unmarked vertical line.
    const neutralBand = `<rect x="${pad.toFixed(1)}" y="${pad.toFixed(1)}" width="${(plotLeft - pad).toFixed(1)}" height="${(height - pad * 2).toFixed(1)}" fill="rgba(184,196,214,.05)"/>
      <text x="${((pad + plotLeft) / 2).toFixed(1)}" y="${(height - pad + 10).toFixed(1)}" text-anchor="middle" class="xray-axis">neutral</text>`;

    // Family polylines: connect base/tint/shade variants in source order so
    // generated palette families read as a single ribbon.
    const familyGroups = new Map();
    records.forEach(record => {
      if (record.familyId === null || record.familyId === undefined) return;
      const key = String(record.familyId);
      if (!familyGroups.has(key)) familyGroups.set(key, []);
      familyGroups.get(key).push(record);
    });
    const familyLines = [];
    for (const group of familyGroups.values()) {
      const ordered = group.slice().sort((a, b) => (a.variantIndex ?? 0) - (b.variantIndex ?? 0));
      if (ordered.length < 2) continue;
      const pts = ordered.map(record => {
        const x = hueXForPlot(record.lab, plotLeft, plotRight, pad);
        const y = lightnessY(record.lab, height, pad);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ");
      familyLines.push(`<polyline points="${pts}" fill="none" stroke="rgba(184,196,214,.25)" stroke-width="1"/>`);
    }

    // Manual matcher aliases: drawn as a dashed leader from the source
    // swatch to a diamond marker at the alias hue/lightness.
    const aliasMarks = entries.filter(entry => entry.alias).map(entry => {
      const record = entry.sourceRecord;
      const x1 = hueXForPlot(record.lab, plotLeft, plotRight, pad);
      const y1 = lightnessY(record.lab, height, pad);
      const x2 = hueXForPlot(entry.featureLab, plotLeft, plotRight, pad);
      const y2 = lightnessY(entry.featureLab, height, pad);
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(255,255,255,.24)" stroke-dasharray="2 2"/><rect x="${(x2-3).toFixed(1)}" y="${(y2-3).toFixed(1)}" width="6" height="6" fill="${labToHex(entry.featureLab)}" stroke="rgba(255,255,255,.58)" transform="rotate(45 ${x2.toFixed(1)} ${y2.toFixed(1)})"/>`;
    }).join("");

    // Swatches plotted as circles, sized by chroma, ring-styled by lock/cycle state.
    const points = records.map((record, index) => {
      const [, C] = labToOklch(record.lab);
      const x = hueXForPlot(record.lab, plotLeft, plotRight, pad);
      const y = lightnessY(record.lab, height, pad);
      const r = clamp(4.0 + C / 14, 4.4, 9.5);
      const stroke = record.locked ? "#ffffff" : "rgba(3,5,7,.82)";
      const dash = cycleTagged(record) ? " stroke-dasharray=\"2 1\"" : "";
      const hex = record.hex || labToHex(record.lab);
      const slash = record.muted ? mutedCircleSlash(x, y, r) : "";
      return `<g class="${graphSwatchClass(record, index)}" ${swatchGraphAttrs(index, record.displayIndex ?? index)}><title>${graphSwatchTitle(record, index, record.lab)}</title><circle class="xray-swatch-fill" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${hex}" stroke="${stroke}" stroke-width="1.2"${dash}></circle>${slash}</g>`;
    }).join("");

    return `<svg class="xray-plot xray-scatter" viewBox="0 0 ${width} ${height}" data-xray-plot-mode="scatter" data-xray-view-box="0 0 ${width} ${height}" role="group" aria-label="Hue by lightness scatter with clickable palette swatches">
      <rect x="0" y="0" width="${width}" height="${height}" rx="4" fill="rgba(255,255,255,.015)"/>
      ${neutralBand}
      ${lightnessTicks}
      <line x1="${plotLeft}" y1="${pad}" x2="${plotLeft}" y2="${height-pad}" stroke="rgba(184,196,214,.22)"/>
      ${hueMarks}
      <text x="${pad - 4}" y="${(pad - 6).toFixed(1)}" text-anchor="end" class="xray-axis">L</text>
      ${familyLines.join("")}${aliasMarks}${points}
    </svg>`;
  }

  function renderXrayWheel(stats) {
    // Polar OKLCh: hue = angle (0° = right, OKLab convention), chroma = radius.
    // This is genuinely different from the scatter — the scatter compresses
    // the hue circle to a line, hiding the wraparound and the gamut reach.
    // The wheel makes hue gaps read as wedges of empty wheel and chroma reach
    // read as the radial extent of each dot. Lightness drops out of the
    // axes, but it survives in the dot fill (which is the swatch's own hex).
    const records = stats?.records || [];
    const width = 240;
    const height = 240;
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.min(cx, cy) - 14;

    // Normalize radius to the larger of the actual palette's max chroma and a
    // floor of 18. Without the floor an all-pastel palette would balloon to
    // fill the wheel and read as if it were vividly saturated; the floor
    // anchors the scale so a high-chroma palette and a low-chroma palette
    // look visibly different.
    let maxChroma = 18;
    for (const record of records) {
      const swatchLab = visibleSwatchLab(record) || record.lab;
      const [, C] = labToOklch(swatchLab);
      if (C > maxChroma) maxChroma = C;
    }
    const aliasEntries = xrayMatchAliasEntries(stats);
    for (const entry of aliasEntries) {
      const [, C] = labToOklch(entry.featureLab);
      if (C > maxChroma) maxChroma = C;
    }
    const radiusFor = C => (C / maxChroma) * maxR;

    // Concentric chroma rings at quarter-fractions of max, plus an outer rim.
    // Labels sit on the right meridian so they don't fight any axis text.
    const rings = [];
    for (let i = 1; i <= 4; i++) {
      const frac = i / 4;
      const r = maxR * frac;
      const major = i === 4 || i === 2;
      const opacity = major ? 0.22 : 0.10;
      rings.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="rgba(184,196,214,${opacity})"/>`);
    }
    const chromaLabelAngle = TAU / 8;
    const chromaLabelX = cx + Math.cos(chromaLabelAngle) * (maxR + 9);
    const chromaLabelY = cy - Math.sin(chromaLabelAngle) * (maxR + 9);
    const chromaLabel = `<text x="${chromaLabelX.toFixed(1)}" y="${(chromaLabelY - 2).toFixed(1)}" text-anchor="middle" class="xray-axis">max C ${maxChroma.toFixed(0)}</text>`;

    // Cardinal hue stops around the rim with their actual OKLCh colors —
    // same six anchors the scatter uses, just laid out polar.
    const hueStops = [
      {h: 0,                 name: "R"},
      {h: TAU * (60 / 360),  name: "Y"},
      {h: TAU * (140 / 360), name: "G"},
      {h: TAU * (190 / 360), name: "C"},
      {h: TAU * (260 / 360), name: "B"},
      {h: TAU * (330 / 360), name: "M"}
    ];
    // SVG y grows downward, so negate sin to keep the math intuitive (CCW
    // positive). 0° lands on the right meridian, matching OKLab convention.
    const polar = (radius, h) => [cx + Math.cos(h) * radius, cy - Math.sin(h) * radius];
    const hueMarks = hueStops.map(stop => {
      const [tx, ty] = polar(maxR + 7, stop.h);
      const [mx, my] = polar(maxR, stop.h);
      const hueLab = fitLabToSrgb(oklchToLab([62, 26, stop.h]));
      const hex = labToHex(hueLab);
      const labelOffset = stop.name === "R"
        ? {dx: -8, dy: -8, anchor: "end"}
        : (stop.name === "C"
          ? {dx: 9, dy: 11, anchor: "start"}
          : {dx: 0, dy: Math.sin(stop.h) > 0.3 ? -5 : (Math.sin(stop.h) < -0.3 ? 9 : 3), anchor: "middle"});
      return `<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${mx.toFixed(1)}" y2="${my.toFixed(1)}" stroke="rgba(184,196,214,.06)"/>
        <circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="2" fill="${hex}" stroke="rgba(8,10,13,.6)" stroke-width="0.5"/>
        <text x="${(tx + labelOffset.dx).toFixed(1)}" y="${(ty + labelOffset.dy).toFixed(1)}" text-anchor="${labelOffset.anchor}" class="xray-axis">${stop.name}</text>`;
    }).join("");

    // Neutral cluster lives inside the NEUTRAL_CHROMA_EPSILON ring. Shading
    // it makes the collapse legible — neutrals lose their hue, so they all
    // pile up at the center; without the ring it looks like a dense bug.
    const neutralRadius = radiusFor(NEUTRAL_CHROMA_EPSILON);
    const neutralRing = `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${neutralRadius.toFixed(1)}" fill="rgba(184,196,214,.06)" stroke="rgba(184,196,214,.18)" stroke-dasharray="1.5 2"/>`;

    // Family arcs: same per-family ribbon as the scatter, but in polar
    // coordinates. Tints and shades of a single family typically stack at the
    // same hue, so the polyline becomes a near-radial segment — readable as
    // "this family lives at this hue, varying in chroma".
    const familyGroups = new Map();
    records.forEach(record => {
      if (record.familyId === null || record.familyId === undefined) return;
      const key = String(record.familyId);
      if (!familyGroups.has(key)) familyGroups.set(key, []);
      familyGroups.get(key).push(record);
    });
    const familyLines = [];
    for (const group of familyGroups.values()) {
      const ordered = group.slice().sort((a, b) => (a.variantIndex ?? 0) - (b.variantIndex ?? 0));
      if (ordered.length < 2) continue;
      const pts = ordered.map(record => {
        const swatchLab = visibleSwatchLab(record) || record.lab;
        const [, C, h] = labToOklch(swatchLab);
        const r = radiusFor(C);
        const [px, py] = polar(r, h);
        return `${px.toFixed(1)},${py.toFixed(1)}`;
      }).join(" ");
      familyLines.push(`<polyline points="${pts}" fill="none" stroke="rgba(184,196,214,.25)" stroke-width="1"/>`);
    }

    // Manual matcher aliases: draw the extra matching coordinate on the same
    // polar scale as the visible swatch chips. Anchors can be more saturated
    // than the rendered chip, so maxChroma above includes these alias labs;
    // otherwise a perfectly valid anchor can get shoved beyond the rim.
    const aliasMarks = aliasEntries.map(entry => {
      const record = entry.sourceRecord;
      const swatchLab = visibleSwatchLab(record) || record.lab;
      const [, sourceC, sourceH] = labToOklch(swatchLab);
      const [, aliasC, aliasH] = labToOklch(entry.featureLab);
      const [x1, y1] = polar(radiusFor(sourceC), sourceH);
      const [x2, y2] = polar(radiusFor(aliasC), aliasH);
      const hex = labToHex(entry.featureLab);
      return `<g class="xray-match-anchor" aria-hidden="true"><title>${xrayMatchAliasTitle(entry, records)}</title><line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(255,255,255,.24)" stroke-dasharray="2 2"/><rect x="${(x2-3.2).toFixed(1)}" y="${(y2-3.2).toFixed(1)}" width="6.4" height="6.4" fill="${hex}" stroke="rgba(255,255,255,.62)" stroke-width="0.8" transform="rotate(45 ${x2.toFixed(1)} ${y2.toFixed(1)})"/></g>`;
    }).join("");

    // Swatches are positioned from the visible chip, not the internal matcher
    // coordinate. Harmony tonal modes can deliberately move/fit the displayed
    // chip; the wheel should show the color users actually see.
    const points = records.map((record, index) => {
      const swatchLab = visibleSwatchLab(record) || record.lab;
      const [, C, h] = labToOklch(swatchLab);
      const r = radiusFor(C);
      const [px, py] = polar(r, h);
      const dotR = clamp(3.8 + C / 22, 4.2, 7.2);
      const stroke = record.locked ? "#ffffff" : "rgba(3,5,7,.82)";
      const dash = cycleTagged(record) ? " stroke-dasharray=\"2 1\"" : "";
      const hex = record.hex || labToHex(swatchLab);
      const slash = record.muted ? mutedCircleSlash(px, py, dotR) : "";
      return `<g class="${graphSwatchClass(record, index)}" ${swatchGraphAttrs(index, record.displayIndex ?? index)}><title>${graphSwatchTitle(record, index, swatchLab)}</title><circle class="xray-swatch-fill" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${dotR.toFixed(1)}" fill="${hex}" stroke="${stroke}" stroke-width="1.1"${dash}></circle>${slash}</g>`;
    }).join("");

    return `<svg class="xray-plot xray-square" viewBox="0 0 ${width} ${height}" data-xray-plot-mode="wheel" data-xray-view-box="0 0 ${width} ${height}" role="group" aria-label="Hue wheel with clickable palette swatches">
      <rect x="0" y="0" width="${width}" height="${height}" rx="4" fill="rgba(255,255,255,.015)"/>
      ${rings.join("")}
      ${neutralRing}
      ${hueMarks}
      ${chromaLabel}
      ${familyLines.join("")}${aliasMarks}${points}
    </svg>`;
  }

  function renderXrayTonalRamp(stats) {
    // 1D plot of Lightness only. Sorting by L and showing the gaps between
    // consecutive values is the cleanest way to surface tonal coverage —
    // the 2D scatter can mask a missing midtone band because dots in
    // unrelated hues fill the visual space at that L. This view collapses
    // that ambiguity.
    const records = stats?.records || [];
    const width = 320;
    const height = 180;
    const padX = 22;
    const padY = 30;
    const trackY = padY + 36;
    const trackH = 48;
    const xFor = L => padX + clamp(L / 100, 0, 1) * (width - padX * 2);

    // Grayscale backdrop: L=0..L=100 gradient under the track makes the
    // tonal axis self-explanatory and gives each swatch a luminance
    // reference. Built from a few stops since SVG linearGradient is overkill
    // for this resolution and we want the grayscale to live in OKLab L too.
    const backdropStops = 6;
    const backdrop = [];
    for (let i = 0; i < backdropStops; i++) {
      const L0 = (i / backdropStops) * 100;
      const L1 = ((i + 1) / backdropStops) * 100;
      const Lmid = (L0 + L1) / 2;
      const hex = labToHex(oklchToLab([Lmid, 0, 0]));
      const x0 = xFor(L0);
      const x1 = xFor(L1);
      backdrop.push(`<rect x="${x0.toFixed(1)}" y="${trackY.toFixed(1)}" width="${(x1 - x0 + 0.5).toFixed(1)}" height="${trackH}" fill="${hex}"/>`);
    }

    // Tick marks at 0/25/50/75/100 with the cardinal labels. The 50 tick
    // gets a bolder line because the band-need scoring uses midtone as its
    // anchor and reading midtone presence quickly is the whole point.
    const lightnessTicks = [0, 25, 50, 75, 100].map(L => {
      const x = xFor(L);
      const major = L === 0 || L === 50 || L === 100;
      const stroke = major ? "rgba(184,196,214,.42)" : "rgba(184,196,214,.18)";
      const label = `<text x="${x.toFixed(1)}" y="${(trackY + trackH + 10).toFixed(1)}" text-anchor="middle" class="xray-axis">${L}</text>`;
      return `<line x1="${x.toFixed(1)}" y1="${(trackY - 3).toFixed(1)}" x2="${x.toFixed(1)}" y2="${(trackY + trackH + 3).toFixed(1)}" stroke="${stroke}" stroke-width="${major ? 0.8 : 0.5}"/>${label}`;
    }).join("");

    if (!records.length) {
      return `<svg class="xray-plot xray-tonal" viewBox="0 0 ${width} ${height}" aria-hidden="true">
        <rect x="0" y="0" width="${width}" height="${height}" rx="4" fill="rgba(255,255,255,.015)"/>
        ${backdrop.join("")}${lightnessTicks}
      </svg>`;
    }

    // Sort by L and find the largest gap between consecutive swatches.
    // Endpoints to L=0 and L=100 count, since "no swatch near black" or
    // "no swatch near white" is just as meaningful a gap as a hole in the
    // middle. Highlighting the biggest gap directly is a real piece of
    // information you cannot read off the scatter at a glance.
    const sorted = records.map((record, index) => ({record, index})).sort((a, b) => a.record.lab[0] - b.record.lab[0]);
    const Ls = sorted.map(item => item.record.lab[0]);
    let biggestGap = {start: 0, end: 0, size: 0};
    const considerGap = (start, end) => {
      const size = end - start;
      if (size > biggestGap.size) biggestGap = {start, end, size};
    };
    considerGap(0, Ls[0]);
    for (let i = 1; i < Ls.length; i++) considerGap(Ls[i - 1], Ls[i]);
    considerGap(Ls[Ls.length - 1], 100);

    // A gap is only worth flagging if it would push a need-band off-balance.
    // 18 L-units is roughly a whole tonal step on a 5-band split, so use
    // that as the threshold for drawing the highlight.
    const gapHighlight = biggestGap.size >= 18
      ? `<rect x="${xFor(biggestGap.start).toFixed(1)}" y="${(trackY - 2).toFixed(1)}" width="${(xFor(biggestGap.end) - xFor(biggestGap.start)).toFixed(1)}" height="${(trackH + 4).toFixed(1)}" fill="rgba(255,100,80,.10)" stroke="rgba(255,140,120,.45)" stroke-dasharray="2 2" stroke-width="0.8"/>
        <text x="${((xFor(biggestGap.start) + xFor(biggestGap.end)) / 2).toFixed(1)}" y="${(trackY - 5).toFixed(1)}" text-anchor="middle" class="xray-axis" fill="rgba(255,170,150,.85)">gap ${biggestGap.size.toFixed(0)}</text>`
      : "";

    // Manual matcher aliases: projected into the same 1D lightness axis as
    // the tonal ramp. The dashed leader makes the alias read as an extra
    // matching coordinate, not as a new output swatch.
    const aliasMarks = xrayMatchAliasEntries(stats).map(entry => {
      const record = entry.sourceRecord;
      const sourceLab = Array.isArray(record?.lab) ? record.lab : (visibleSwatchLab(record) || entry.renderLab || entry.featureLab);
      const x1 = xFor(sourceLab[0]);
      const x2 = xFor(entry.featureLab[0]);
      const y1 = trackY - 8;
      const y2 = trackY - 18;
      const hex = labToHex(entry.featureLab);
      return `<g class="xray-match-anchor" aria-hidden="true"><title>${xrayMatchAliasTitle(entry, records)}</title><line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(255,255,255,.24)" stroke-dasharray="2 2"/><rect x="${(x2-3.2).toFixed(1)}" y="${(y2-3.2).toFixed(1)}" width="6.4" height="6.4" fill="${hex}" stroke="rgba(255,255,255,.62)" stroke-width="0.8" transform="rotate(45 ${x2.toFixed(1)} ${y2.toFixed(1)})"/></g>`;
    }).join("");

    // Swatch markers: a tall vertical bar at the swatch's L position, in the
    // swatch's actual color. Bars instead of dots so adjacent-L swatches
    // remain distinguishable even when they pile up. Stems extend below the
    // strip into a lollipop ring whose stroke encodes lock/cycle state.
    const markers = sorted.map(({record, index}) => {
      const x = xFor(record.lab[0]);
      const hex = record.hex || labToHex(record.lab);
      const [, C] = labToOklch(record.lab);
      const dotR = clamp(2.4 + C / 24, 2.6, 4.6);
      const stroke = record.locked ? "#ffffff" : "rgba(3,5,7,.82)";
      const dash = cycleTagged(record) ? " stroke-dasharray=\"2 1\"" : "";
      const lollipopY = trackY + trackH + 14;
      const slash = record.muted ? mutedCircleSlash(x, lollipopY, dotR) : "";
      return `<g class="${graphSwatchClass(record, index)}" ${swatchGraphAttrs(index, record.displayIndex ?? index)}><title>${graphSwatchTitle(record, index, record.lab)}</title><rect class="xray-swatch-fill" x="${(x - 2.2).toFixed(1)}" y="${trackY.toFixed(1)}" width="4.4" height="${trackH}" fill="${hex}" stroke="rgba(3,5,7,.55)" stroke-width="0.5"/>
        <line x1="${x.toFixed(1)}" y1="${(trackY + trackH).toFixed(1)}" x2="${x.toFixed(1)}" y2="${lollipopY.toFixed(1)}" stroke="rgba(184,196,214,.35)" stroke-width="0.6"/>
        <circle class="xray-swatch-fill" cx="${x.toFixed(1)}" cy="${lollipopY.toFixed(1)}" r="${dotR.toFixed(1)}" fill="${hex}" stroke="${stroke}" stroke-width="1"${dash}></circle>${slash}</g>`;
    }).join("");

    const axisLabel = `<text x="${padX}" y="${(padY - 4).toFixed(1)}" text-anchor="start" class="xray-axis">Lightness</text>`;

    return `<svg class="xray-plot xray-tonal" viewBox="0 0 ${width} ${height}" data-xray-plot-mode="ramp" data-xray-view-box="0 0 ${width} ${height}" role="group" aria-label="Lightness ramp with clickable palette swatches">
      <rect x="0" y="0" width="${width}" height="${height}" rx="4" fill="rgba(255,255,255,.015)"/>
      ${backdrop.join("")}
      ${gapHighlight}
      ${lightnessTicks}
      ${axisLabel}
      ${aliasMarks}
      ${markers}
    </svg>`;
  }

  function renderXrayProximity(stats) {
    // N×N pairwise weighted-distance matrix. Every other mode answers
    // "where does each swatch sit?". This one answers "how do swatches
    // relate to each other?", which is what the collision/crowding scoring
    // actually optimizes against. Cells warm toward red as the pair gets
    // closer than the collision threshold; cool/dim cells are well-separated.
    const records = stats?.records || [];
    const config = getConfig();
    const width = 240;
    const height = 240;
    const padTop = 15;
    const padLeft = 15;
    const padRight = 7;
    const padBottom = 22;
    const n = records.length;

    if (n < 2) {
      return `<svg class="xray-plot xray-square" viewBox="0 0 ${width} ${height}" aria-hidden="true">
        <rect x="0" y="0" width="${width}" height="${height}" rx="4" fill="rgba(255,255,255,.015)"/>
        <text x="${(width / 2).toFixed(1)}" y="${(height / 2).toFixed(1)}" text-anchor="middle" class="xray-axis" fill="rgba(184,196,214,.55)">Need at least two swatches</text>
      </svg>`;
    }

    // Compute every pairwise weighted distance and track max/threshold so
    // the color scale anchors to meaningful values. The collision threshold
    // (already computed by metrics.js for the summary) is the natural "warm"
    // anchor — closer than that and we'd flag it in the summary.
    const cell = Math.min(
      (width - padLeft - padRight) / n,
      (height - padTop - padBottom) / n
    );
    const gridW = cell * n;
    const startX = padLeft + ((width - padLeft - padRight) - gridW) / 2;
    const startY = padTop + ((height - padTop - padBottom) - gridW) / 2;

    const distances = [];
    let maxDistance = 0;
    for (let i = 0; i < n; i++) {
      distances.push([]);
      for (let j = 0; j < n; j++) {
        if (i === j) { distances[i].push(0); continue; }
        const aParts = labDistanceComponents(records[i].lab);
        const bParts = labDistanceComponents(records[j].lab);
        const parts = cpuDistanceBreakdown(
          aParts.lightness,
          aParts.chroma,
          aParts.scaledHue,
          bParts.lightness,
          bParts.chroma,
          bParts.scaledHue,
          config
        );
        distances[i].push(parts.total);
        if (parts.total > maxDistance) maxDistance = parts.total;
      }
    }
    const threshold = Number.isFinite(stats?.collisions?.threshold)
      ? stats.collisions.threshold
      : Math.max(8, (Number(config.minDistance) || 18) * 0.55);
    const scaleAnchor = Math.max(maxDistance, threshold * 2.5, 1);

    // Color ramp: dim navy → warm orange → hot red, parameterized by t in
    // [0,1] where t<thresholdRatio means "too close". The ramp lives in sRGB
    // because cells are tiny and we want maximum perceptual contrast at the
    // warm end where collisions live, not perceptual uniformity.
    const thresholdRatio = clamp(threshold / scaleAnchor, 0.05, 0.9);
    const cellColor = distance => {
      const t = clamp(distance / scaleAnchor, 0, 1);
      if (t <= thresholdRatio) {
        // Warm half: red (#d24a3a) at 0, orange (#e0a04a) at threshold.
        const k = t / Math.max(thresholdRatio, 1e-6);
        const r = Math.round(210 + (224 - 210) * k);
        const g = Math.round(74 + (160 - 74) * k);
        const b = Math.round(58 + (74 - 58) * k);
        return `rgb(${r},${g},${b})`;
      }
      // Cool half: muted slate (#6b7a8c) at threshold, deep panel (#1a2330) at far.
      const k = (t - thresholdRatio) / Math.max(1 - thresholdRatio, 1e-6);
      const r = Math.round(107 + (26 - 107) * k);
      const g = Math.round(122 + (35 - 122) * k);
      const b = Math.round(140 + (48 - 140) * k);
      return `rgb(${r},${g},${b})`;
    };

    // Header chips: one row of swatch chips above the matrix, one column to
    // the left. They are the "axis labels" — without them you cannot tell
    // which swatch a hot cell refers to. Chip size is capped so a 32-swatch
    // palette still fits.
    const chipSize = Math.min(cell - 1, 6);
    const chips = [];
    for (let i = 0; i < n; i++) {
      const record = records[i];
      const hex = record.hex || labToHex(record.lab);
      const cellMid = startX + (i + 0.5) * cell;
      const rowMid = startY + (i + 0.5) * cell;
      const chipMarkup = (x, y) => {
        const slash = record.muted ? mutedRectSlash(x, y, chipSize, chipSize, Math.min(1.3, chipSize * 0.24)) : "";
        return `<g class="${graphSwatchClass(record, i)}" ${swatchGraphAttrs(i, record.displayIndex ?? i)}><title>${graphSwatchTitle(record, i, record.lab)}</title><rect class="xray-swatch-fill" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${chipSize}" height="${chipSize}" rx="0.8" fill="${hex}" stroke="rgba(8,10,13,.55)" stroke-width="0.4"/>${slash}</g>`;
      };
      // Top header
      chips.push(chipMarkup(cellMid - chipSize / 2, startY - chipSize - 1));
      // Left header
      chips.push(chipMarkup(startX - chipSize - 1, rowMid - chipSize / 2));
    }

    // Cells. Diagonal stays muted (a swatch's distance to itself is zero by
    // definition; coloring it red would be a misleading "every palette has
    // collisions" signal). Below the threshold gets a thin outline so the
    // user can spot collisions even on a tiny matrix.
    const cells = [];
    let closestPair = null;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = startX + j * cell;
        const y = startY + i * cell;
        if (i === j) {
          cells.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" fill="rgba(184,196,214,.08)"/>`);
          continue;
        }
        const distance = distances[i][j];
        const fill = cellColor(distance);
        const below = distance < threshold && i < j;
        if (below && (!closestPair || distance < closestPair.distance)) {
          closestPair = {i, j, distance};
        }
        const outline = below ? ` stroke="rgba(255,255,255,.55)" stroke-width="0.5"` : "";
        cells.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" fill="${fill}"${outline}><title>${(records[i].displayIndex ?? 0) + 1} ↔ ${(records[j].displayIndex ?? 0) + 1} · Δ ${formatDistance(distance)}</title></rect>`);
      }
    }

    const legendY = height - 5;
    const legendX = padLeft;
    const legendW = 74;
    const legendStops = 16;
    const legend = [];
    for (let k = 0; k < legendStops; k++) {
      const t = k / (legendStops - 1);
      const fill = cellColor(t * scaleAnchor);
      legend.push(`<rect x="${(legendX + (k / legendStops) * legendW).toFixed(1)}" y="${(legendY - 4).toFixed(1)}" width="${(legendW / legendStops + 0.4).toFixed(1)}" height="3" fill="${fill}"/>`);
    }
    const legendLabel = `<text x="${(legendX + legendW + 4).toFixed(1)}" y="${(legendY - 1).toFixed(1)}" text-anchor="start" class="xray-axis">closer → farther</text>`;
    const closestNote = closestPair
      ? `<text x="${(width - padRight).toFixed(1)}" y="${(legendY - 1).toFixed(1)}" text-anchor="end" class="xray-axis" fill="rgba(255,170,150,.85)">closest Δ ${formatDistance(closestPair.distance)}</text>`
      : `<text x="${(width - padRight).toFixed(1)}" y="${(legendY - 1).toFixed(1)}" text-anchor="end" class="xray-axis" fill="rgba(184,196,214,.6)">no collisions</text>`;

    return `<svg class="xray-plot xray-square" viewBox="0 0 ${width} ${height}" data-xray-plot-mode="proximity" data-xray-view-box="0 0 ${width} ${height}" role="group" aria-label="Swatch proximity matrix with clickable palette headers">
      <rect x="0" y="0" width="${width}" height="${height}" rx="4" fill="rgba(255,255,255,.015)"/>
      ${chips.join("")}
      ${cells.join("")}
      ${legend.join("")}
      ${legendLabel}
      ${closestNote}
    </svg>`;
  }

  function renderXrayCylinder(stats) {
    // 3D OKLCh cylinder: Lightness climbs the vertical axis, Chroma moves
    // outward from the center, and Hue wraps around the circumference. The
    // SVG is an orthographic projection with a draggable orbit; it is not a
    // fake wheel with extra shadows. The point coordinates are the actual
    // L/C/H tuple projected through yaw/pitch, then depth-sorted so the front
    // of the cylinder reads over the back.
    const records = stats?.records || [];
    const width = 320;
    const height = 286;
    const cx = width / 2;
    const cy = height / 2 + 4;
    const radiusScale = 86;
    const lightnessScale = 178;
    const cosYaw = Math.cos(xrayCylinderYaw);
    const sinYaw = Math.sin(xrayCylinderYaw);
    const cosPitch = Math.cos(xrayCylinderPitch);
    const sinPitch = Math.sin(xrayCylinderPitch);

    let maxChroma = 24;
    for (const record of records) {
      const swatchLab = visibleSwatchLab(record) || record.lab;
      const [, C] = labToOklch(swatchLab);
      if (C > maxChroma) maxChroma = C;
    }
    for (const entry of xrayMatchAliasEntries(stats)) {
      const [, C] = labToOklch(entry.featureLab);
      if (C > maxChroma) maxChroma = C;
    }
    maxChroma = Math.max(1, Math.ceil(maxChroma / 4) * 4);

    const project = (L, C, h) => {
      const r = clamp(C / maxChroma, 0, 1);
      const x = Math.cos(h) * r;
      const z = Math.sin(h) * r;
      const y = clamp(L / 100, 0, 1) - 0.5;
      const yawX = x * cosYaw + z * sinYaw;
      const yawZ = -x * sinYaw + z * cosYaw;
      // Keep the cylinder readable at the full +/-90° tilt. Lightness uses
      // the taller vertical scale while chroma/hue use the radial scale, so
      // a top-down view becomes a clean disk instead of a clipped spear.
      const pitchY = y * cosPitch * lightnessScale - yawZ * sinPitch * radiusScale;
      const depth = y * sinPitch + yawZ * cosPitch;
      return {
        x: cx + yawX * radiusScale,
        y: cy - pitchY,
        depth
      };
    };

    const ringPath = (L, C, steps = 72) => {
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const h = (i / steps) * TAU;
        const p = project(L, C, h);
        pts.push(`${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`);
      }
      return `${pts.join(" ")} Z`;
    };

    const rings = [0, 50, 100].map(L => {
      const stroke = L === 50 ? "rgba(184,196,214,.18)" : "rgba(184,196,214,.26)";
      const labelPoint = project(L, maxChroma, TAU * 0.02);
      const label = `<text x="${(labelPoint.x + 4).toFixed(1)}" y="${(labelPoint.y + 3).toFixed(1)}" class="xray-axis">L${L}</text>`;
      return `<path d="${ringPath(L, maxChroma, 56)}" fill="none" stroke="${stroke}" stroke-width="0.65"/>${label}`;
    }).join("");

    const chromaDecks = [0.5].flatMap(frac => {
      const C = maxChroma * frac;
      return [0, 100].map(L => `<path d="${ringPath(L, C, 56)}" fill="none" stroke="rgba(184,196,214,.045)" stroke-width="0.4"/>`);
    }).join("");

    const hueStops = [
      {h: 0,                 name: "R"},
      {h: TAU * (60 / 360),  name: "Y"},
      {h: TAU * (140 / 360), name: "G"},
      {h: TAU * (190 / 360), name: "C"},
      {h: TAU * (260 / 360), name: "B"},
      {h: TAU * (330 / 360), name: "M"}
    ];

    const ribs = [];
    for (let i = 0; i < 6; i++) {
      const h = (i / 6) * TAU;
      const bottom = project(0, maxChroma, h);
      const top = project(100, maxChroma, h);
      const opacity = clamp(0.08 + ((bottom.depth + top.depth) / 2 + 1) * 0.07, 0.05, 0.22);
      ribs.push(`<line x1="${bottom.x.toFixed(1)}" y1="${bottom.y.toFixed(1)}" x2="${top.x.toFixed(1)}" y2="${top.y.toFixed(1)}" stroke="rgba(184,196,214,${opacity.toFixed(3)})" stroke-width="0.5"/>`);
    }

    const axisBottom = project(0, 0, 0);
    const axisTop = project(100, 0, 0);
    const axisMid = project(50, 0, 0);
    const cAxis = project(50, maxChroma, 0);
    const axis = `<line x1="${axisBottom.x.toFixed(1)}" y1="${axisBottom.y.toFixed(1)}" x2="${axisTop.x.toFixed(1)}" y2="${axisTop.y.toFixed(1)}" stroke="rgba(255,255,255,.38)" stroke-width="0.85"/>
      <line x1="${axisMid.x.toFixed(1)}" y1="${axisMid.y.toFixed(1)}" x2="${cAxis.x.toFixed(1)}" y2="${cAxis.y.toFixed(1)}" stroke="rgba(184,196,214,.16)" stroke-dasharray="2 3"/>
      <text x="${(axisTop.x + 4).toFixed(1)}" y="${(axisTop.y - 4).toFixed(1)}" class="xray-axis">L</text>
      <text x="${(cAxis.x + 4).toFixed(1)}" y="${(cAxis.y + 3).toFixed(1)}" class="xray-axis">C ${maxChroma.toFixed(0)}</text>`;

    const hueMarks = hueStops.map(stop => {
      const p = project(104, maxChroma, stop.h);
      const hueLab = fitLabToSrgb(oklchToLab([62, Math.min(maxChroma * 0.72, 30), stop.h]));
      const hex = labToHex(hueLab);
      return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.2" fill="${hex}" stroke="rgba(8,10,13,.62)" stroke-width="0.55"/>
        <text x="${p.x.toFixed(1)}" y="${(p.y - 4).toFixed(1)}" text-anchor="middle" class="xray-axis">${stop.name}</text>`;
    }).join("");

    const familyGroups = new Map();
    records.forEach(record => {
      if (record.familyId === null || record.familyId === undefined) return;
      const key = String(record.familyId);
      if (!familyGroups.has(key)) familyGroups.set(key, []);
      familyGroups.get(key).push(record);
    });
    const familyLines = [];
    for (const group of familyGroups.values()) {
      const ordered = group.slice().sort((a, b) => (a.variantIndex ?? 0) - (b.variantIndex ?? 0));
      if (ordered.length < 2) continue;
      const pts = ordered.map(record => {
        const swatchLab = visibleSwatchLab(record) || record.lab;
        const [L, C, h] = labToOklch(swatchLab);
        const p = project(L, C, h);
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      }).join(" ");
      familyLines.push(`<polyline points="${pts}" fill="none" stroke="rgba(184,196,214,.18)" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round"/>`);
    }

    const aliasMarks = xrayMatchAliasEntries(stats).map(entry => {
      const record = entry.sourceRecord;
      const sourceLab = visibleSwatchLab(record) || record.lab || entry.renderLab || entry.featureLab;
      const [sourceL, sourceC, sourceH] = labToOklch(sourceLab);
      const [aliasL, aliasC, aliasH] = labToOklch(entry.featureLab);
      const sourcePoint = project(sourceL, sourceC, sourceH);
      const aliasPoint = project(aliasL, aliasC, aliasH);
      const hex = labToHex(entry.featureLab);
      const opacity = clamp(0.50 + (aliasPoint.depth + 1) * 0.23, 0.42, 0.98);
      return {
        depth: Math.min(sourcePoint.depth, aliasPoint.depth) - 0.01,
        markup: `<g class="xray-match-anchor" aria-hidden="true"><title>${xrayMatchAliasTitle(entry, records)}</title><line x1="${sourcePoint.x.toFixed(1)}" y1="${sourcePoint.y.toFixed(1)}" x2="${aliasPoint.x.toFixed(1)}" y2="${aliasPoint.y.toFixed(1)}" stroke="rgba(255,255,255,.24)" stroke-dasharray="2 2"/><rect x="${(aliasPoint.x-3.2).toFixed(1)}" y="${(aliasPoint.y-3.2).toFixed(1)}" width="6.4" height="6.4" fill="${hex}" opacity="${opacity.toFixed(2)}" stroke="rgba(255,255,255,.62)" stroke-width="0.8" transform="rotate(45 ${aliasPoint.x.toFixed(1)} ${aliasPoint.y.toFixed(1)})"/></g>`
      };
    });

    const points = records.map((record, index) => {
      const swatchLab = visibleSwatchLab(record) || record.lab;
      const [L, C, h] = labToOklch(swatchLab);
      const p = project(L, C, h);
      const hex = record.hex || labToHex(swatchLab);
      const radius = clamp(4.0 + C / 20, 4.4, 8.8);
      const opacity = clamp(0.50 + (p.depth + 1) * 0.23, 0.42, 0.98);
      const stroke = record.locked ? "#ffffff" : "rgba(3,5,7,.86)";
      const dash = cycleTagged(record) ? " stroke-dasharray=\"2 1\"" : "";
      const slash = record.muted ? mutedCircleSlash(p.x, p.y, radius) : "";
      return {depth: p.depth, markup: `<g class="${graphSwatchClass(record, index)}" ${swatchGraphAttrs(index, record.displayIndex ?? index)}><title>${graphSwatchTitle(record, index, swatchLab)}</title><circle class="xray-swatch-fill" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${radius.toFixed(1)}" fill="${hex}" opacity="${opacity.toFixed(2)}" stroke="${stroke}" stroke-width="1.15"${dash}></circle>${slash}</g>`};
    }).concat(aliasMarks).sort((a, b) => a.depth - b.depth).map(item => item.markup).join("");

    const yawDeg = ((xrayCylinderYaw * 180 / Math.PI) % 360 + 360) % 360;
    const pitchDeg = xrayCylinderPitch * 180 / Math.PI;
    const readout = `<text x="${(width - 8).toFixed(1)}" y="${(height - 10).toFixed(1)}" text-anchor="end" class="xray-axis">drag to rotate · yaw ${yawDeg.toFixed(0)}° · tilt ${pitchDeg.toFixed(0)}°</text>`;

    return `<svg class="xray-plot xray-square xray-cylinder" viewBox="0 0 ${width} ${height}" data-xray-plot-mode="cylinder" data-xray-view-box="0 0 ${width} ${height}" data-xray-cylinder tabindex="0" focusable="true" role="img" aria-label="Rotatable LCH cylinder. Drag to orbit hue and chroma around the lightness axis with tilt from -90 to 90 degrees; use arrow keys to rotate.">
      <rect x="0" y="0" width="${width}" height="${height}" rx="4" fill="rgba(255,255,255,.015)"/>
      ${chromaDecks}
      ${rings}
      ${ribs.join("")}
      ${axis}
      ${hueMarks}
      ${familyLines.join("")}
      ${points}
      ${readout}
    </svg>`;
  }

  function renderDiagnosticsXray(stats) {
    if (!els.diagnosticsXray) return;
    const diagnostic = getState().diagnostics || {};
    if (stats) diagnostic.xrayStats = stats;
    else if (Object.prototype.hasOwnProperty.call(diagnostic, "xrayStats")) diagnostic.xrayStats = null;
    bindXrayModeEvents();
    const records = stats?.records || [];
    if (!records.length) {
      // Preserve the original empty-state behavior: when there are no
      // records, the panel collapses entirely rather than showing inert
      // mode tabs. Anyone who has used the panel before expects the slot
      // to be empty pre-generation.
      els.diagnosticsXray.innerHTML = "";
      return;
    }
    let svg;
    if (xrayMode === "wheel") svg = renderXrayWheel(stats);
    else if (xrayMode === "ramp") svg = renderXrayTonalRamp(stats);
    else if (xrayMode === "proximity") svg = renderXrayProximity(stats);
    else if (xrayMode === "cylinder") svg = renderXrayCylinder(stats);
    else svg = renderXrayScatter(stats);
    els.diagnosticsXray.innerHTML = `${xrayModeBarHtml()}${svg}`;
  }

  function renderDiagnosticsSummary(stats) {
    if (!els.diagnosticsSummary) return;
    const state = getState();
    const sample = stats?.sample;
    if (!sample) {
      els.diagnosticsSummary.innerHTML = `<div class="diagnostics-summary-empty">${state.imageData ? "Palette diagnostics are waiting for a valid palette." : "Open an image to audit palette coverage."}</div>`;
      return;
    }
    const collisions = stats.collisions;
    const closest = collisions?.closest || null;
    const recordCount = stats.records?.length || 0;

    // The "mean" cell carries the principled per-axis breakdown of error.
    // Because the distance metric is a weighted sum lumaW·|ΔL| +
    // chromaW·|ΔC| + hueW·hueBias, the means of the L/C/H components sum
    // to the mean of the total, so this is a true decomposition of where
    // the error lives — not a side-statistic.
    const meanBreakdown = `<small>ΔL ${formatDistance(sample.meanLuma)} · ΔC ${formatDistance(sample.meanChroma)} · ΔH ${formatDistance(sample.meanHue)}</small>`;

    let collisionLine = "";
    if (closest) {
      const a = closest.a;
      const b = closest.b;
      const aHex = a.hex || labToHex(a.lab);
      const bHex = b.hex || labToHex(b.lab);
      const aIndex = (a.displayIndex ?? closest.i) + 1;
      const bIndex = (b.displayIndex ?? closest.j) + 1;
      const tight = closest.distance <= collisions.threshold;
      collisionLine = `<dt title="Closest palette pair in weighted OKLab distance. Below ${formatDistance(collisions.threshold)} swatches may be hard to distinguish in matching.">closest</dt>
        <dd class="diagnostics-summary-pair${tight ? " is-warning" : ""}">
          <i style="background:${aHex}" title="${colorInfoLabel(aHex, a.lab)}"></i><i style="background:${bHex}" title="${colorInfoLabel(bHex, b.lab)}"></i>
          <span>${formatDistance(closest.distance)}</span>
          <small>#${aIndex} ↔ #${bIndex}</small>
        </dd>`;
    }

    els.diagnosticsSummary.innerHTML = `<dl class="diagnostics-summary-grid">
        <dt>samples</dt><dd>${sample.sampleCount.toLocaleString()}<small>step ${sample.step}px</small></dd>
        <dt title="Mean weighted OKLab distance between sampled pixels and their assigned palette swatch.">mean</dt><dd>${formatDistance(sample.meanDistance)}${meanBreakdown}</dd>
        <dt title="95th percentile distance: how bad the long tail of mismatches gets.">p95</dt><dd>${formatDistance(sample.p95Distance)}</dd>
        <dt title="Normalized contribution entropy. 1.00 means usage is perfectly even across swatches; near 0 means a single swatch dominates.">uniformity</dt><dd>${sample.coverageEntropy.toFixed(2)}<small>${recordCount} swatches</small></dd>
        <dt title="Sampled pixels whose best-vs-second-best distance gap is small enough to count as a tie.">ambiguous</dt><dd>${formatUsagePercent(sample.ambiguousPercent)}</dd>
        ${collisionLine}
      </dl>`;
  }

  function renderDiagnosticsSelection() {
    if (!els.diagnosticsSelection) return;
    const state = getState();
    const trace = state.paletteSelectionTrace;
    if (!trace || !isGeneratedPaletteMode() || !activePaletteImageData()) {
      els.diagnosticsSelection.innerHTML = `<div class="diagnostics-summary-empty">Generate from an image to inspect selection forces.</div>`;
      return;
    }

    const weights = trace.weights || {};
    const constants = trace.constants || {};
    const expansion = trace.expansion || {};
    const sample = trace.sample || {};
    const spacingMode = trace.spacingMode === "color" || trace.tintShadeFamilies === false ? "color" : "family";
    const spacingLabel = spacingMode === "color" ? "color" : "family";
    const spacingPlural = spacingMode === "color" ? "colors" : "families";
    const expansionLine = spacingMode === "family"
      ? `<div><span>expansion</span><b>ΔL ${formatScore(expansion.deltaL)}</b><small>chroma ${formatScore(expansion.chromaExp)}</small></div>`
      : `<div><span>expansion</span><b>off</b><small>direct color picks</small></div>`;
    const lockNote = syncGeneratedLocks().length
      ? `<div class="selection-note">Locked ${spacingPlural} are seeded first, so automatic picks are scored around those anchors.</div>`
      : "";
    const targetText = (trace.tonalTargets || []).map(target => `${target.band} ${target.count}`).join(" · ");
    const rules = `<div class="selection-rules">
        <div><span>source</span><b>${trace.sourceLabel || "image"}</b></div>
        <div><span>${spacingPlural}</span><b>${trace.selectionCount ?? trace.baseCount}</b><small>${trace.finalPaletteSize || trace.requestedSize || "—"} swatches</small></div>
        <div><span>sample</span><b>${sample.count ?? trace.candidateCount}</b><small>${sample.samplingMode || "random"}, block ${sample.blockSize ?? "—"}</small></div>
        <div><span>weights</span><b>C ${formatScore(weights.chroma)}</b><small>O ${formatScore(weights.outlier)} · M ${formatScore(weights.midtone)}</small></div>
        <div><span>tonal zone</span><b>×${formatScore(constants.tonalZoneWeight ?? 1)}</b><small>need ${formatScore(constants.tonalNeedBonus)} · crowd ${formatScore(constants.tonalCrowdingPenalty)}</small></div>
        <div><span>width bonus</span><b>×${formatScore(constants.widthBonus ?? 1)}</b><small>range ${formatScore(constants.rangeExpansionBonus)} · novelty ${formatScore(constants.noveltyBonus)}</small></div>
        <div><span>hue spread</span><b>${formatScore(constants.hueSpreadBonus)}</b><small>seed hue anchors, C ${formatScore(constants.hueReliabilityChromaLow)}–${formatScore(constants.hueReliabilityChromaHigh)}</small></div>
        <div><span>${spacingLabel} spacing</span><b>${formatDistance(trace.colorSpacing ?? trace.familySpacing)}</b><small>${spacingMode === "family" ? "whole footprint" : "direct picks"}</small></div>
        ${expansionLine}
        <div><span>tonal target</span><b>${targetText || "—"}</b></div>
        <div><span>lottery</span><b>${formatScore(constants.topBandRatio)}</b><small>or −${formatScore(constants.topBandAbsWindow)}</small></div>
      </div>${lockNote}`;

    const rounds = (trace.rounds || []).map((round, i) => {
      const picked = round.picked || {};
      const parts = picked.parts || {};
      const spacing = round.spacing || {};
      const familyHexes = picked.familyHexes || [picked.hex].filter(Boolean);
      const familySeedReadout = familySeedReadoutHtml(picked);
      const badges = (picked.badges || []).map(badge => `<em>${badge}</em>`).join("");
      const pickedDistance = Number.isFinite(spacing.nearestAcceptedDistance) ? formatDistance(spacing.nearestAcceptedDistance) : "first pick";
      const bestDistance = Number.isFinite(spacing.bestAvailableDistance) ? formatDistance(spacing.bestAvailableDistance) : "—";
      const spacingSatisfaction = Number.isFinite(spacing.pickedSatisfaction) ? `${Math.round(spacing.pickedSatisfaction * 100)}%` : "—";
      const requestedTarget = formatDistance(spacing.requested);
      const effectiveTarget = Number.isFinite(spacing.effectiveTarget) ? formatDistance(spacing.effectiveTarget) : requestedTarget;
      const belowTargetCount = spacing.belowTargetCandidateCount ?? spacing.blockedCandidateCount ?? 0;
      const belowEffectiveCount = spacing.belowEffectiveTargetCandidateCount ?? spacing.blockedCandidateCount ?? 0;
      const relaxationPct = Number.isFinite(spacing.relaxationRatio) ? Math.round(spacing.relaxationRatio * 100) : 90;
      const spacingLine = spacing.relaxed
        ? `<div class="selection-warning">${capitalize(spacingLabel)} spacing relaxed: no candidates met target ${requestedTarget}; new target ${effectiveTarget} (${relaxationPct}% of best available ${bestDistance}); picked ${pickedDistance} (${spacingSatisfaction}). ${belowTargetCount} below original target, ${belowEffectiveCount} still blocked, pool ${spacing.poolSize || 0}.</div>`
        : `<div class="selection-note">${capitalize(spacingLabel)} spacing enforced: picked ${pickedDistance} of target ${requestedTarget} (${spacingSatisfaction}); best available ${bestDistance}. ${spacing.legalCandidateCount ?? "—"} legal, ${spacing.blockedCandidateCount ?? 0} blocked.</div>`;
      const crowding = round.crowding || {};
      const crowdingLine = `<div class="selection-note">Crowding pressure: ${crowding.penalizedCandidateCount || 0} of ${crowding.poolSize || 0} scored candidates penalized; max ${formatSignedScore(-(crowding.maxPenalty || 0))}; picked ${formatSignedScore(-(parts.crowdingPenalty || 0))}.</div>`;
      const hue = round.hue || {};
      const hueLine = `<div class="selection-note">Hue-spread pressure: ${hue.positiveCandidateCount || 0} of ${hue.poolSize || 0} scored candidates got hue credit; ${hue.reliableAnchorCount || 0} reliable prior anchors; max ${formatSignedScore(hue.maxContribution || 0)}; picked ${formatSignedScore(parts.hueSpreadContribution || 0)}.</div>`;
      const lottery = round.lottery || {};
      const scoreRows = [
        scorePartRow("chroma", parts.chromaContribution || 0, `raw ${formatScore(parts.chromaRaw)} × weight ${formatScore(weights.chroma)}`),
        scorePartRow("outlier", parts.outlierContribution || 0, `raw ${formatScore(parts.outlierRaw)} · mean distance ${formatDistance(parts.outlierDistance)}`),
        scorePartRow("midtone", parts.midtoneContribution || 0, `raw ${formatScore(parts.midtoneRaw)} · L ${formatScore(parts.L)}`),
        scorePartRow("tonal need", parts.tonalNeedContribution || 0, `${parts.band || picked.band || "band"} need ${formatScore(parts.bandNeed)}`),
        scorePartRow("crowding", -(parts.crowdingPenalty || 0), `selected ${formatScore(parts.crowding)} · round max ${formatSignedScore(-(crowding.maxPenalty || 0))}`),
        scorePartRow("range", parts.rangeExpansionContribution || 0, `range expand ${formatScore(parts.rangeExpansion)}`),
        scorePartRow("novelty", parts.noveltyContribution || 0, `nearest family ${formatDistance(picked.nearestFamilyDistance)}`),
        scorePartRow("hue spread", parts.hueSpreadContribution || 0, `seed C ${formatScore(parts.hueCandidateChroma)} · nearest hue ${Number.isFinite(parts.hueNearestDistanceDegrees) ? Math.round(parts.hueNearestDistanceDegrees) + "°" : "—"} · candidate ${formatScore(parts.hueReliability)} · anchor ${formatScore(parts.hueAnchorReliability)}`),
        scorePartRow("seed noise", parts.noiseContribution || 0, `max ${formatScore(SELECTION_NOISE_AMOUNT)}`)
      ].join("");
      return `<details class="selection-round" ${i < 2 ? "open" : ""}>
          <summary>
            <span class="selection-round-title">Family ${i + 1}</span>
            <span class="selection-round-swatches">${swatchListHtml(familyHexes)}</span>
            ${familySeedReadout}
            <span class="selection-round-score">score ${formatScore(picked.marginalScore ?? picked.baseScore)}</span>
            <span class="selection-round-rank">rank ${lottery.pickedRank ? `#${lottery.pickedRank}` : "—"}</span>
          </summary>
          <div class="selection-badges">${badges}</div>
          ${spacingLine}
          ${crowdingLine}
          ${hueLine}
          <div class="selection-lottery">Tie window ${lottery.topBandSize ?? "—"} candidates · threshold ${formatScore(lottery.threshold)} · ${lottery.pickedBySeedTieBreak ? "picked by seeded tie-break" : "highest-ranked candidate"}</div>
          <div class="selection-score-grid">${scoreRows}</div>
          <div class="selection-subtitle">Near misses</div>
          <div class="selection-alt-list">${alternativeRowsHtml(round.nearMisses || [], picked.index)}</div>
          ${round.blockedNearMisses?.length ? `<div class="selection-subtitle">Closest blocked by spacing</div><div class="selection-alt-list">${alternativeRowsHtml(round.blockedNearMisses, picked.index)}</div>` : ""}
        </details>`;
    }).join("");

    els.diagnosticsSelection.innerHTML = `${rules}<div class="selection-rounds">${rounds || `<div class="diagnostics-summary-empty">No selection rounds recorded.</div>`}</div>`;
  }

  function updatePixelActionButtons(pixel, config) {
    const manualCount = Array.isArray(config?.manualPalette) ? config.manualPalette.length : 0;
    const full = manualCount >= MAX_PALETTE_SIZE;
    const sourceButton = els.addPixelSourceToManualPalette;
    if (sourceButton) {
      sourceButton.disabled = !pixel || full;
      sourceButton.title = !pixel
        ? "Inspect a pixel first"
        : (full ? "Manual palette is already full" : `Add ${colorInfoLabel(pixel.sourceHex)} to the manual palette`);
    }
    if (els.copyPixelSource) {
      els.copyPixelSource.disabled = !pixel;
      els.copyPixelSource.title = pixel ? `Copy ${colorInfoLabel(pixel.sourceHex)}` : "Inspect a pixel first";
    }
    if (els.copyPixelFinal) {
      const blendAmount = Number(config?.blendAmount);
      const blendActive = Math.abs((Number.isFinite(blendAmount) ? blendAmount : 1) - 1) > 1e-6;
      const label = blendActive ? "Copy blend" : "Copy fx";
      els.copyPixelFinal.disabled = !pixel;
      els.copyPixelFinal.textContent = label;
      els.copyPixelFinal.title = pixel ? `${label} ${colorInfoLabel(blendActive ? pixel.finalHex : (pixel.fxHex || pixel.finalHex))}` : "Inspect a pixel first";
    }
    if (els.clearPixelInspector) els.clearPixelInspector.disabled = !pixel;
  }

  function updateDiagnosticsPixel() {
    if (!els.diagnosticsPixel) return;
    const state = getState();
    const config = getConfig();
    const pixel = state.diagnostics?.pixel;
    updatePixelActionButtons(pixel, config);
    if (!pixel) {
      els.diagnosticsPixel.textContent = state.imageData ? "Click the preview to interrogate a pixel." : "Open an image, then click the preview to interrogate a pixel.";
      return;
    }

    // Build per-match rows annotated with the actual mix weight from
    // assignmentWeights. In nearest mode only the winner has a non-zero
    // weight; in blend mode the top-k carry the normalized inverse-distance
    // weights; in dither mode the best and second carry (1 - share) and
    // share respectively. Non-contributing matches are dimmed but kept on
    // screen so users can see the near-misses that didn't make the cut.
    const winnerWeight = pixel.weights[0] || 0;
    const rows = pixel.matches.map((match, index) => {
      const weight = pixel.weights[index] || 0;
      const isContributing = weight > 0;
      const isWinner = index === 0 && winnerWeight > 0;
      const cls = `diagnostics-pixel-match${isWinner ? " is-winner" : ""}${isContributing ? "" : " is-inactive"}`;
      const aliasFlag = match.alias ? ` <em class="diagnostics-pixel-flag">alias</em>` : "";
      const parts = `<em>ΔL ${formatDistance(match.parts.luma)} · ΔC ${formatDistance(match.parts.chroma)} · ΔH ${formatHueDistance(match.parts)}</em>`;
      const weightCell = isContributing
        ? `<b title="mix weight">${formatUsagePercent(weight)}</b>`
        : `<b class="is-inactive" title="weighted distance">${formatDistance(match.distance)}</b>`;
      const swatchNumber = pixelInspectorSwatchNumber(match, config);
      const swatchTitle = pixelInspectorSwatchTitle(match, config);
      const matchColorInfo = colorInfoLabel(match.hex, match.record?.lab);
      return `<div class="${cls}" title="${swatchTitle} ${matchColorInfo}"><i style="background:${match.hex}" title="${matchColorInfo}"></i><span>#${index + 1} swatch ${swatchNumber}${aliasFlag} ${parts}</span>${weightCell}</div>`;
    }).join("");

    const fxHex = pixel.fxHex || pixel.finalHex;
    const blendAmount = Number(config?.blendAmount);
    const blendActive = Math.abs((Number.isFinite(blendAmount) ? blendAmount : 1) - 1) > 1e-6;
    const displayDelta = deltaFromPixel(pixel, {blendActive, config});
    const deltaTitle = blendActive ? "blended output delta from source" : "mapped fx delta from source";
    const deltaText = displayDelta
      ? `ΔL ${formatDistance(displayDelta.luma)} · ΔC ${formatDistance(displayDelta.chroma)} · ΔH ${formatHueDistance(displayDelta)}`
      : `ΔL — · ΔC — · ΔH —`;
    const blendStage = blendActive
      ? `<span class="diagnostics-pixel-arrow">→</span>
        <span class="diagnostics-pixel-stage" title="blended output ${colorInfoLabel(pixel.finalHex)}"><i class="diagnostics-pixel-chip" style="background:${pixel.finalHex}" title="${colorInfoLabel(pixel.finalHex)}"></i><small>blend</small><strong>${pixel.finalHex}</strong></span>`
      : "";
    const header = `<div class="diagnostics-pixel-header">
        <span class="diagnostics-pixel-stage" title="source color ${colorInfoLabel(pixel.sourceHex)}"><i class="diagnostics-pixel-chip" style="background:${pixel.sourceHex}" title="${colorInfoLabel(pixel.sourceHex)}"></i><small>src</small><strong>${pixel.sourceHex}</strong></span>
        <span class="diagnostics-pixel-arrow">→</span>
        <span class="diagnostics-pixel-stage" title="mapped color before blend ${colorInfoLabel(fxHex)}"><i class="diagnostics-pixel-chip" style="background:${fxHex}" title="${colorInfoLabel(fxHex)}"></i><small>fx</small><strong>${fxHex}</strong></span>
        ${blendStage}
        <span class="diagnostics-pixel-delta" title="${deltaTitle}">${deltaText}</span>
        <span class="diagnostics-pixel-coord">@ ${pixel.x},${pixel.y}</span>
      </div>`;

    els.diagnosticsPixel.innerHTML = `${header}${rows}`;
  }

  function renderDiagnosticsPanel(stats = getState().diagnostics?.stats) {
    renderDiagnosticsSelection();
    if (els.diagnosticsContributionPanel) els.diagnosticsContributionPanel.hidden = false;
    renderDiagnosticsSummary(stats);
    renderDiagnosticsOverlayControls(stats);
    renderDiagnosticsUsage(stats);
    updateDiagnosticsPixel();
  }

  return {
    renderDiagnosticsSummary,
    renderDiagnosticsSelection,
    renderDiagnosticsUsage,
    renderHistogramPanel,
    renderDiagnosticsOverlayControls,
    renderDiagnosticsXray,
    renderDiagnosticsPanel,
    activeHistogramTab,
    updateDiagnosticsPixel
  };
}
