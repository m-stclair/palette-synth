import test from "node:test";
import assert from "node:assert/strict";
import {
  createDiagnosticsPanel,
  formatDistance,
  formatUsagePercent
} from "../src/ui/diagnostics-panel.js";

function fakeElement() {
  return {
    innerHTML: "",
    textContent: "",
    toggles: [],
    listeners: {},
    classList: {
      toggle(name, value) {
        this.owner.toggles.push([name, value]);
      }
    },
    addEventListener(name, handler) {
      (this.listeners[name] = this.listeners[name] || []).push(handler);
    },
    dispatch(name, event) {
      for (const handler of this.listeners[name] || []) handler(event);
    }
  };
}

function element() {
  const el = fakeElement();
  el.classList.owner = el;
  return el;
}

test("diagnostics panel formatters match runtime display rules", () => {
  assert.equal(formatDistance(Number.NaN), "—");
  assert.equal(formatDistance(123.45), "123");
  assert.equal(formatDistance(12.34), "12.3");
  assert.equal(formatDistance(1.234), "1.23");
  assert.equal(formatUsagePercent(0), "0%");
  assert.equal(formatUsagePercent(0.0005), "<0.1%");
  assert.equal(formatUsagePercent(0.034), "3.4%");
  assert.equal(formatUsagePercent(0.56), "56%");
});

test("pixel inspector uses manual palette numbering for manual swatches", () => {
  const els = {diagnosticsPixel: element()};
  const state = {
    imageData: {width: 1, height: 1},
    diagnostics: {
      pixel: {
        x: 0,
        y: 0,
        sourceHex: "#222222",
        fxHex: "#444444",
        finalHex: "#333333",
        weights: [1],
        matches: [{
          hex: "#abcdef",
          displayIndex: 0,
          record: {source: "manual", sourceIndex: 3, swatchId: "manual-four"},
          alias: false,
          parts: {luma: 1, chroma: 2, hue: 3},
          distance: 6
        }]
      }
    }
  };

  const panel = createDiagnosticsPanel({
    els,
    getConfig: () => ({paletteMode: "manual", assignMode: "nearest"}),
    getState: () => state
  });

  panel.updateDiagnosticsPixel();

  assert.match(els.diagnosticsPixel.innerHTML, /title="manual swatch 4 #abcdef · LCH /);
  assert.match(els.diagnosticsPixel.innerHTML, />#1 swatch 4/);
  assert.doesNotMatch(els.diagnosticsPixel.innerHTML, />#1 swatch 1/);
});

test("diagnostics usage sorts by contribution while keeping manual swatch labels", () => {
  const els = {
    diagnosticsSummary: element(),
    diagnosticsUsage: element(),
    diagnosticsUsageHeading: element(),
    diagnosticsOverlayControls: element(),
    diagnosticsOverlayStatus: element(),
    diagnosticsOverlayOff: element(),
    diagnosticsOverlayDifference: element()
  };
  const records = [
    {lab: [30, 0, 0], hex: "#333333", displayIndex: 0, source: "manual", sourceIndex: 2},
    {lab: [10, 0, 0], hex: "#111111", displayIndex: 1, source: "manual", sourceIndex: 0},
    {lab: [20, 0, 0], hex: "#222222", displayIndex: 2, source: "manual", sourceIndex: 1}
  ];
  const stats = {
    records,
    entries: [],
    sample: {
      usage: [
        {index: 0, percent: 0.7, territoryPercent: 0.7, aliasPercent: 0, load: "high", hex: "#333333"},
        {index: 1, percent: 0.2, territoryPercent: 0.2, aliasPercent: 0, load: "balanced", hex: "#111111"},
        {index: 2, percent: 0.1, territoryPercent: 0.1, aliasPercent: 0, load: "balanced", hex: "#222222"}
      ],
      sampleCount: 10,
      meanDistance: 0,
      meanLuma: 0,
      meanChroma: 0,
      meanHue: 0,
      p95Distance: 0,
      coverageEntropy: 1,
      ambiguousPercent: 0
    }
  };
  const state = {imageData: {width: 1, height: 1}, diagnostics: {overlay: {mode: "swatch", swatchIndex: 1}}};
  const panel = createDiagnosticsPanel({
    els,
    getConfig: () => ({paletteMode: "manual", assignMode: "blend", outputMode: "quantized"}),
    getState: () => state
  });

  panel.renderDiagnosticsPanel(stats);

  const html = els.diagnosticsUsage.innerHTML;
  const first = html.indexOf("manual swatch 3");
  const second = html.indexOf("manual swatch 1");
  const third = html.indexOf("manual swatch 2");
  assert.ok(first >= 0 && second > first && third > second);
  assert.match(els.diagnosticsOverlayStatus.textContent, /manual swatch 1/);
  assert.match(html, /data-diagnostic-swatch-index="1"/);
  assert.match(html, /title="Show blend contribution heatmap for manual swatch 1 · #111111 · LCH /);
});

test("diagnostics panel renders summary, usage, xray, selection fallback, and pixel inspector", () => {
  const els = {
    diagnosticsSummary: element(),
    diagnosticsUsage: element(),
    diagnosticsUsageHeading: element(),
    diagnosticsXray: element(),
    diagnosticsSelection: element(),
    diagnosticsPixel: element()
  };
  const config = {assignMode: "blend", outputMode: "quantized"};
  const records = [
    {lab: [20, 0, 0], hex: "#111111", displayIndex: 0, familyId: "a", variantIndex: 0},
    {lab: [80, 20, 0], hex: "#eeeeee", displayIndex: 1, familyId: "a", variantIndex: 1, locked: true}
  ];
  const stats = {
    records,
    entries: [],
    sample: {
      usage: [
        {index: 0, percent: 0.7, territoryPercent: 0.6, aliasPercent: 0, load: "high", hex: "#111111"},
        {index: 1, percent: 0.3, territoryPercent: 0.4, aliasPercent: 0.05, load: "balanced", hex: "#eeeeee"}
      ],
      sampleCount: 64,
      step: 4,
      meanDistance: 2.5,
      meanLuma: 1,
      meanChroma: 0.75,
      meanHue: 0.75,
      p95Distance: 8.25,
      coverageEntropy: 0.92,
      ambiguousPercent: 0.125
    },
    collisions: {
      threshold: 18,
      closest: {a: records[0], b: records[1], i: 0, j: 1, distance: 12.5}
    }
  };
  const state = {
    imageData: {width: 1, height: 1},
    diagnostics: {
      pixel: {
        x: 0,
        y: 0,
        sourceHex: "#222222",
        finalHex: "#333333",
        weights: [0.8, 0.2],
        matches: [
          {hex: "#111111", displayIndex: 0, alias: false, parts: {luma: 1, chroma: 2, hue: 3, hueSuppressed: true}, distance: 6},
          {hex: "#eeeeee", displayIndex: 1, alias: true, parts: {luma: 2, chroma: 3, hue: 4}, distance: 9}
        ]
      }
    },
    paletteSelectionTrace: null
  };

  const panel = createDiagnosticsPanel({
    els,
    getConfig: () => config,
    getState: () => state,
    cycleTagged: record => record.displayIndex === 1
  });

  panel.renderDiagnosticsPanel(stats);

  assert.equal(els.diagnosticsUsageHeading.textContent, "Blend contribution");
  assert.match(els.diagnosticsSummary.innerHTML, /samples/);
  assert.match(els.diagnosticsUsage.innerHTML, /diagnostic-usage-row/);
  assert.deepEqual(els.diagnosticsUsage.toggles, [["has-territory", true]]);
  assert.match(els.diagnosticsXray.innerHTML, /<svg/);
  assert.match(els.diagnosticsXray.innerHTML, /#111111 · LCH /);
  assert.match(els.diagnosticsXray.innerHTML, /stroke-dasharray/);
  assert.match(els.diagnosticsSelection.innerHTML, /Generate from an image/);
  assert.match(els.diagnosticsPixel.innerHTML, /#222222/);
  assert.match(els.diagnosticsPixel.innerHTML, /ΔL [0-9]/);
  assert.doesNotMatch(els.diagnosticsPixel.innerHTML, /ΔL —/);
  assert.match(els.diagnosticsPixel.innerHTML, /ΔH ~/);
});

test("X-Ray renders four distinct modes and switches between them on click", () => {
  const xray = element();
  const els = {diagnosticsXray: xray};
  const records = [
    {lab: [20, 8, -2],  hex: "#1a2230", displayIndex: 0, familyId: "a", variantIndex: 0},
    {lab: [55, -18, 22], hex: "#5e8a4a", displayIndex: 1, familyId: "a", variantIndex: 1},
    {lab: [82, 4,  14],  hex: "#dcc89a", displayIndex: 2, familyId: "b", variantIndex: 0, locked: true},
    {lab: [40, 30, 18],  hex: "#9b4a3a", displayIndex: 3, familyId: "c", variantIndex: 0}
  ];
  const stats = {
    records,
    entries: [],
    collisions: {threshold: 12, closest: {a: records[0], b: records[1], i: 0, j: 1, distance: 18.4}}
  };
  const state = {imageData: null, diagnostics: {stats}};
  const panel = createDiagnosticsPanel({
    els,
    getConfig: () => ({lumaWeight: 1, chromaWeight: 1, hueWeight: 1, minDistance: 18}),
    getState: () => state
  });

  // Default: scatter. Mode bar must include every mode so it's discoverable.
  panel.renderDiagnosticsXray(stats);
  assert.match(xray.innerHTML, /data-xray-mode="scatter"[^>]*aria-selected="true"/);
  assert.match(xray.innerHTML, /data-xray-mode="wheel"/);
  assert.match(xray.innerHTML, /data-xray-mode="ramp"/);
  assert.match(xray.innerHTML, /data-xray-mode="proximity"/);
  // Scatter-specific signatures: hue letter labels and the neutral column.
  assert.match(xray.innerHTML, />neutral</);
  assert.match(xray.innerHTML, />R</);

  // Drive the click handler that the panel binds on first render. Each mode
  // should produce visibly different markup, not just a relabelled scatter.
  const clickMode = mode => xray.dispatch("click", {target: {closest: sel => sel === `[data-xray-mode]` ? {dataset: {xrayMode: mode}} : null}});

  clickMode("wheel");
  assert.match(xray.innerHTML, /data-xray-mode="wheel"[^>]*aria-selected="true"/);
  // Wheel mode reports max chroma as a label and draws concentric chroma rings.
  assert.match(xray.innerHTML, /C \d+/);

  clickMode("ramp");
  assert.match(xray.innerHTML, /data-xray-mode="ramp"[^>]*aria-selected="true"/);
  // Ramp mode labels the lightness axis.
  assert.match(xray.innerHTML, />Lightness</);

  clickMode("proximity");
  assert.match(xray.innerHTML, /data-xray-mode="proximity"[^>]*aria-selected="true"/);
  // Proximity mode shows a closer→farther legend and a collision readout
  // sourced from cpuDistanceBreakdown over every swatch pair.
  assert.match(xray.innerHTML, /closer → farther/);

  clickMode("scatter");
  assert.match(xray.innerHTML, /data-xray-mode="scatter"[^>]*aria-selected="true"/);
});

test("X-Ray proximity mode degrades gracefully when there are not enough swatches", () => {
  const xray = element();
  const stats = {
    records: [{lab: [50, 0, 0], hex: "#808080", displayIndex: 0}],
    entries: []
  };
  const panel = createDiagnosticsPanel({
    els: {diagnosticsXray: xray},
    getConfig: () => ({lumaWeight: 1, chromaWeight: 1, hueWeight: 1}),
    getState: () => ({diagnostics: {stats}})
  });
  panel.renderDiagnosticsXray(stats);
  xray.dispatch("click", {target: {closest: sel => sel === "[data-xray-mode]" ? {dataset: {xrayMode: "proximity"}} : null}});
  assert.match(xray.innerHTML, /Need at least two swatches/);
});
