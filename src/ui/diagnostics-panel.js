import {
  MAX_PALETTE_SIZE,
  SELECTION_NOISE_AMOUNT,
  TAU,
  NEUTRAL_CHROMA_EPSILON
} from "../constants.js";
import {
  clamp,
  hexToByteRgb,
  labToHex,
  labToOklch,
  oklchToLab,
  fitLabToSrgb,
  rgb8ToLab
} from "../color-utils.js";
import { cpuDistanceBreakdown } from "../diagnostics/metrics.js";

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
  return cpuDistanceBreakdown(sourceLab, targetLab, config);
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
  return hexes.map(hex => `<i class="selection-swatch" style="background:${hex}" title="${hex}"></i>`).join("");
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
  setDiagnosticOverlay = () => {}
} = {}) {
  const overlayBoundElements = new WeakSet();

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
        els.diagnosticsOverlayStatus.textContent = `${swatchText}: #${overlay.swatchIndex + 1}.`;
      } else {
        els.diagnosticsOverlayStatus.textContent = "";
      }
    }
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
    const rows = usage
      .slice()
      .sort((a, b) => b.percent - a.percent || b.territoryPercent - a.territoryPercent || a.index - b.index)
      .map(item => {
        const pct = clamp(item.percent * 100, 0, 100);
        const territoryNote = showTerritoryColumn
          ? `<small title="Nearest-only territory: ${formatUsagePercent(item.territoryPercent)}">${formatUsagePercent(item.territoryPercent)}</small>`
          : "";
        const aliasNote = item.aliasPercent > 0
          ? ` · alias ${formatUsagePercent(item.aliasPercent)}`
          : "";
        const titleParts = [`swatch ${item.index + 1}`, `contribution ${formatUsagePercent(item.percent)}`];
        if (showTerritoryColumn) titleParts.push(`nearest ${formatUsagePercent(item.territoryPercent)}`);
        if (item.aliasPercent > 0) titleParts.push(`alias ${formatUsagePercent(item.aliasPercent)}`);
        if (item.load !== "balanced") titleParts.push(item.load);
        const overlayActive = overlay.mode === "swatch" && overlay.swatchIndex === item.index;
        return `<div class="diagnostic-usage-row is-${item.load}${overlayActive ? " is-overlay-target" : ""}" title="${titleParts.join(" · ")}${aliasNote}">
          <button type="button" class="diagnostic-usage-swatch-button" data-diagnostic-swatch-index="${item.index}" aria-pressed="${overlayActive}" title="Show ${config.assignMode === "blend" ? "blend contribution heatmap" : "assignment mask"} for swatch ${item.index + 1}">
            <i class="diagnostic-usage-swatch" style="background:${item.hex}"></i>
          </button>
          <span class="diagnostic-usage-track"><span class="diagnostic-usage-fill" style="--usage-pct:${pct}%"></span></span>
          <b>${formatUsagePercent(item.percent)}</b>
          ${territoryNote}
        </div>`;
      }).join("");
    els.diagnosticsUsage.classList.toggle("has-territory", showTerritoryColumn);
    els.diagnosticsUsage.innerHTML = rows;
  }

  function renderDiagnosticsXray(stats) {
    if (!els.diagnosticsXray) return;
    const records = stats?.records || [];
    const entries = stats?.entries || [];
    if (!records.length) {
      els.diagnosticsXray.innerHTML = "";
      return;
    }
    const width = 280;
    const height = 144;
    const pad = 18;
    const plotLeft = pad + 8; // neutral column lives between pad and plotLeft
    const plotRight = width - pad;

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
    const points = records.map(record => {
      const [, C] = labToOklch(record.lab);
      const x = hueXForPlot(record.lab, plotLeft, plotRight, pad);
      const y = lightnessY(record.lab, height, pad);
      const r = clamp(2.6 + C / 18, 3, 7);
      const stroke = record.locked ? "#ffffff" : "rgba(3,5,7,.82)";
      const dash = cycleTagged(record) ? " stroke-dasharray=\"2 1\"" : "";
      const hex = record.hex || labToHex(record.lab);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${hex}" stroke="${stroke}" stroke-width="1.2"${dash}><title>swatch ${(record.displayIndex ?? 0) + 1} · ${hex} · L ${record.lab[0].toFixed(1)} · C ${C.toFixed(1)}</title></circle>`;
    }).join("");

    els.diagnosticsXray.innerHTML = `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <rect x="0" y="0" width="${width}" height="${height}" rx="4" fill="rgba(255,255,255,.015)"/>
      ${neutralBand}
      ${lightnessTicks}
      <line x1="${plotLeft}" y1="${pad}" x2="${plotLeft}" y2="${height-pad}" stroke="rgba(184,196,214,.22)"/>
      ${hueMarks}
      <text x="${pad - 4}" y="${(pad - 6).toFixed(1)}" text-anchor="end" class="xray-axis">L</text>
      ${familyLines.join("")}${aliasMarks}${points}
    </svg>`;
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
          <i style="background:${aHex}"></i><i style="background:${bHex}"></i>
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
    const lockNote = syncGeneratedLocks().length
      ? `<div class="selection-note">Shows automatic seed selection before locked families replace claimed slots.</div>`
      : "";
    const targetText = (trace.tonalTargets || []).map(target => `${target.band} ${target.count}`).join(" · ");
    const rules = `<div class="selection-rules">
        <div><span>source</span><b>${trace.sourceLabel || "image"}</b></div>
        <div><span>families</span><b>${trace.baseCount}</b><small>${trace.finalPaletteSize || trace.requestedSize || "—"} swatches</small></div>
        <div><span>sample</span><b>${sample.count ?? trace.candidateCount}</b><small>${sample.samplingMode || "random"}, block ${sample.blockSize ?? "—"}</small></div>
        <div><span>weights</span><b>C ${formatScore(weights.chroma)}</b><small>O ${formatScore(weights.outlier)} · M ${formatScore(weights.midtone)}</small></div>
        <div><span>hue spread</span><b>${formatScore(constants.hueSpreadBonus)}</b><small>seed hue anchors, C ${formatScore(constants.hueReliabilityChromaLow)}–${formatScore(constants.hueReliabilityChromaHigh)}</small></div>
        <div><span>family spacing</span><b>${formatDistance(trace.familySpacing)}</b><small>whole footprint</small></div>
        <div><span>expansion</span><b>ΔL ${formatScore(expansion.deltaL)}</b><small>chroma ${formatScore(expansion.chromaExp)}</small></div>
        <div><span>tonal target</span><b>${targetText || "—"}</b></div>
        <div><span>lottery</span><b>${formatScore(constants.topBandRatio)}</b><small>or −${formatScore(constants.topBandAbsWindow)}</small></div>
      </div>${lockNote}`;

    const rounds = (trace.rounds || []).map((round, i) => {
      const picked = round.picked || {};
      const parts = picked.parts || {};
      const spacing = round.spacing || {};
      const familyHexes = picked.familyHexes || [picked.hex].filter(Boolean);
      const badges = (picked.badges || []).map(badge => `<em>${badge}</em>`).join("");
      const pickedDistance = Number.isFinite(spacing.nearestAcceptedDistance) ? formatDistance(spacing.nearestAcceptedDistance) : "first pick";
      const bestDistance = Number.isFinite(spacing.bestAvailableDistance) ? formatDistance(spacing.bestAvailableDistance) : "—";
      const spacingSatisfaction = Number.isFinite(spacing.pickedSatisfaction) ? `${Math.round(spacing.pickedSatisfaction * 100)}%` : "—";
      const belowTargetCount = spacing.belowTargetCandidateCount ?? spacing.blockedCandidateCount ?? 0;
      const spacingLine = spacing.relaxed
        ? `<div class="selection-warning">Family spacing relaxed: no candidates met target ${formatDistance(spacing.requested)}; best available ${bestDistance}; picked ${pickedDistance} (${spacingSatisfaction}). ${belowTargetCount} below target, fallback pool ${spacing.poolSize || 0}.</div>`
        : `<div class="selection-note">Family spacing enforced: picked ${pickedDistance} of target ${formatDistance(spacing.requested)} (${spacingSatisfaction}); best available ${bestDistance}. ${spacing.legalCandidateCount ?? "—"} legal, ${spacing.blockedCandidateCount ?? 0} blocked.</div>`;
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
            <span class="selection-round-score">score ${formatScore(picked.marginalScore ?? picked.baseScore)}</span>
            <span class="selection-round-rank">rank ${lottery.pickedRank ? `#${lottery.pickedRank}` : "—"}</span>
          </summary>
          <div class="selection-badges">${badges}</div>
          ${spacingLine}
          ${crowdingLine}
          ${hueLine}
          <div class="selection-lottery">Top band ${lottery.topBandSize ?? "—"} candidates · threshold ${formatScore(lottery.threshold)} · ${lottery.pickedByWeightedLottery ? "picked by seeded lottery" : "highest-ranked candidate"}</div>
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
        : (full ? "Manual palette is already full" : `Add ${pixel.sourceHex} to the manual palette`);
    }
    if (els.copyPixelSource) {
      els.copyPixelSource.disabled = !pixel;
      els.copyPixelSource.title = pixel ? `Copy ${pixel.sourceHex}` : "Inspect a pixel first";
    }
    if (els.copyPixelFinal) {
      const blendAmount = Number(config?.blendAmount);
      const blendActive = Math.abs((Number.isFinite(blendAmount) ? blendAmount : 1) - 1) > 1e-6;
      const label = blendActive ? "Copy blend" : "Copy fx";
      els.copyPixelFinal.disabled = !pixel;
      els.copyPixelFinal.textContent = label;
      els.copyPixelFinal.title = pixel ? `${label} ${blendActive ? pixel.finalHex : (pixel.fxHex || pixel.finalHex)}` : "Inspect a pixel first";
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
      return `<div class="${cls}" title="${swatchTitle} ${match.hex}"><i style="background:${match.hex}" title="${match.hex}"></i><span>#${index + 1} swatch ${swatchNumber}${aliasFlag} ${parts}</span>${weightCell}</div>`;
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
        <span class="diagnostics-pixel-stage" title="blended output ${pixel.finalHex}"><i class="diagnostics-pixel-chip" style="background:${pixel.finalHex}" title="${pixel.finalHex}"></i><small>blend</small><strong>${pixel.finalHex}</strong></span>`
      : "";
    const header = `<div class="diagnostics-pixel-header">
        <span class="diagnostics-pixel-stage" title="source color ${pixel.sourceHex}"><i class="diagnostics-pixel-chip" style="background:${pixel.sourceHex}" title="${pixel.sourceHex}"></i><small>src</small><strong>${pixel.sourceHex}</strong></span>
        <span class="diagnostics-pixel-arrow">→</span>
        <span class="diagnostics-pixel-stage" title="mapped color before blend ${fxHex}"><i class="diagnostics-pixel-chip" style="background:${fxHex}" title="${fxHex}"></i><small>fx</small><strong>${fxHex}</strong></span>
        ${blendStage}
        <span class="diagnostics-pixel-delta" title="${deltaTitle}">${deltaText}</span>
        <span class="diagnostics-pixel-coord">@ ${pixel.x},${pixel.y}</span>
      </div>`;

    els.diagnosticsPixel.innerHTML = `${header}${rows}`;
  }

  function renderDiagnosticsPanel(stats = getState().diagnostics?.stats) {
    renderDiagnosticsSummary(stats);
    renderDiagnosticsOverlayControls(stats);
    renderDiagnosticsSelection();
    renderDiagnosticsUsage(stats);
    renderDiagnosticsXray(stats);
    updateDiagnosticsPixel();
  }

  return {
    renderDiagnosticsSummary,
    renderDiagnosticsSelection,
    renderDiagnosticsUsage,
    renderDiagnosticsOverlayControls,
    renderDiagnosticsXray,
    renderDiagnosticsPanel,
    updateDiagnosticsPixel
  };
}
