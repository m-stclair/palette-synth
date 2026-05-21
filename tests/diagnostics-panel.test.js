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
    diagnosticsHistogramHeading: element(),
    diagnosticsHistogram: element(),
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
  panel.renderDiagnosticsXray(stats);

  assert.equal(els.diagnosticsUsageHeading.textContent, "Blend contribution");
  assert.match(els.diagnosticsSummary.innerHTML, /samples/);
  assert.match(els.diagnosticsUsage.innerHTML, /diagnostic-usage-row/);
  assert.equal(els.diagnosticsHistogram.innerHTML, "");
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

test("histogram swatch markers use visible swatch color for placement and tooltip value", () => {
  const els = {
    diagnosticsTabs: element(),
    diagnosticsContributionPanel: element(),
    diagnosticsHistogramPanel: element(),
    diagnosticsHistogramHeading: element(),
    diagnosticsHistogram: element()
  };
  const records = [
    {lab: [0, 7.4, 0], hex: "#000003", displayIndex: 0}
  ];
  const histogram = {
    kind: "sourceChromaDetail",
    scope: "source",
    channel: "chroma",
    label: "source chroma",
    axisLabel: "C",
    bins: [1, 0, 0, 0],
    segments: {shadow: [1, 0, 0, 0], midtone: [0, 0, 0, 0], highlight: [0, 0, 0, 0]},
    segmentNames: ["shadow", "midtone", "highlight"],
    max: 1,
    total: 1,
    step: 1,
    domain: {min: 0, max: 16},
    stats: {p10: 3, median: 3, p90: 3, mean: 3, mode: 2, max: 3, saturatedPercent: 0}
  };
  const state = {
    imageData: {width: 1, height: 1},
    diagnostics: {
      histogramTab: "chroma",
      stats: {records},
      histogramStats: {
        "source-chroma": {records, histogram},
        "output-chroma": {records, histogram: {...histogram, kind: "outputChromaDetail", scope: "output", label: "output chroma"}}
      }
    }
  };
  const panel = createDiagnosticsPanel({
    els,
    getConfig: () => ({assignMode: "nearest"}),
    getState: () => state
  });

  panel.renderHistogramPanel(state.diagnostics.histogramStats);

  assert.match(els.diagnosticsHistogram.innerHTML, /swatch 1 · C 3\.04 · #000003 · LCH 4\.4 3\.0 264°/);
  assert.doesNotMatch(els.diagnosticsHistogram.innerHTML, /swatch 1 · C 7\.4/);
});

test("histogram inspector tab renders paired source and output charts from its active tab state", () => {
  const els = {
    diagnosticsTabs: element(),
    diagnosticsContributionPanel: element(),
    diagnosticsHistogramPanel: element(),
    diagnosticsHistogramHeading: element(),
    diagnosticsHistogram: element(),
    diagnosticsSelection: element(),
    diagnosticsPixel: element()
  };
  const records = [
    {lab: [20, 0, 0], hex: "#111111", displayIndex: 0},
    {lab: [80, 20, 0], hex: "#eeeeee", displayIndex: 1}
  ];
  const state = {
    imageData: {width: 1, height: 1},
    diagnostics: {
      histogramTab: "luma",
      stats: {records},
      histogramStats: {
        "source-luma": {
          records,
          histogram: {
            kind: "sourceLumaDetail",
            scope: "source",
            channel: "luma",
            label: "source luma",
            axisLabel: "L",
            bins: [0, 2, 6, 4, 0, 1],
            segments: {neutral: [0, 1, 3, 2, 0, 1], muted: [0, 1, 2, 1, 0, 0], vivid: [0, 0, 1, 1, 0, 0]},
            segmentNames: ["neutral", "muted", "vivid"],
            max: 6,
            total: 13,
            step: 4,
            domain: {min: 0, max: 100},
            stats: {p10: 18, median: 45, p90: 72, mean: 47, mode: 42, max: 90, saturatedPercent: 0.15}
          }
        },
        "output-luma": {
          records,
          histogram: {
            kind: "outputLumaDetail",
            scope: "output",
            channel: "luma",
            label: "output luma",
            axisLabel: "L",
            bins: [1, 4, 5, 3, 0, 0],
            segments: {neutral: [1, 2, 2, 1, 0, 0], muted: [0, 1, 2, 1, 0, 0], vivid: [0, 1, 1, 1, 0, 0]},
            segmentNames: ["neutral", "muted", "vivid"],
            max: 5,
            total: 13,
            step: 4,
            domain: {min: 0, max: 100},
            stats: {p10: 20, median: 48, p90: 74, mean: 49, mode: 45, max: 91, saturatedPercent: 0.18}
          }
        }
      }
    },
    paletteSelectionTrace: null
  };
  const panel = createDiagnosticsPanel({
    els,
    getConfig: () => ({assignMode: "nearest"}),
    getState: () => state
  });

  panel.renderHistogramPanel(state.diagnostics.histogramStats);

  assert.match(els.diagnosticsTabs.innerHTML, /data-histogram-tab="luma"[^>]*aria-selected="true"/);
  assert.equal(els.diagnosticsHistogramHeading.textContent, "Luma histograms");
  assert.match(els.diagnosticsHistogram.innerHTML, /Source/);
  assert.match(els.diagnosticsHistogram.innerHTML, /Output/);
  assert.match(els.diagnosticsHistogram.innerHTML, /diagnostics-histogram-plot/);
  assert.match(els.diagnosticsHistogram.innerHTML, /viewBox="0 0 360 112"/);
  assert.match(els.diagnosticsHistogram.innerHTML, /diagnostics-histogram-labels/);
  assert.match(els.diagnosticsHistogram.innerHTML, /diagnostics-histogram-axis-row/);
  assert.match(els.diagnosticsHistogram.innerHTML, /diagnostics-histogram-readouts/);
  assert.match(els.diagnosticsHistogram.innerHTML, /preserveAspectRatio="none"/);
  assert.match(els.diagnosticsHistogram.innerHTML, /diagnostics-histogram-bar/);
  assert.match(els.diagnosticsHistogram.innerHTML, /diagnostics-histogram-marker/);
  assert.match(els.diagnosticsHistogram.innerHTML, /diagnostics-histogram-mode/);
  assert.doesNotMatch(els.diagnosticsHistogram.innerHTML, /diagnostics-histogram-gap/);
  assert.doesNotMatch(els.diagnosticsHistogram.innerHTML, /gap L/);
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
  assert.match(xray.innerHTML, /class="xray-plot xray-scatter"/);
  assert.match(xray.innerHTML, />neutral</);
  assert.match(xray.innerHTML, />R</);

  // Drive the click handler that the panel binds on first render. Each mode
  // should produce visibly different markup, not just a relabelled scatter.
  const clickMode = mode => xray.dispatch("click", {target: {closest: sel => sel === `[data-xray-mode]` ? {dataset: {xrayMode: mode}} : null}});

  clickMode("wheel");
  assert.match(xray.innerHTML, /data-xray-mode="wheel"[^>]*aria-selected="true"/);
  assert.match(xray.innerHTML, /class="xray-plot xray-square"/);
  // Wheel mode reports max chroma as a label and draws concentric chroma rings.
  assert.match(xray.innerHTML, /C \d+/);

  clickMode("ramp");
  assert.match(xray.innerHTML, /data-xray-mode="ramp"[^>]*aria-selected="true"/);
  assert.match(xray.innerHTML, /class="xray-plot xray-tonal"/);
  // Ramp mode labels the lightness axis.
  assert.match(xray.innerHTML, />Lightness</);

  clickMode("proximity");
  assert.match(xray.innerHTML, /data-xray-mode="proximity"[^>]*aria-selected="true"/);
  assert.match(xray.innerHTML, /class="xray-plot xray-square"/);
  // Proximity mode shows a closer→farther legend and a collision readout
  // sourced from cpuDistanceBreakdown over every swatch pair.
  assert.match(xray.innerHTML, /closer → farther/);

  clickMode("scatter");
  assert.match(xray.innerHTML, /data-xray-mode="scatter"[^>]*aria-selected="true"/);
});

test("X-Ray wheel positions and labels visible swatch chips, not stale matcher Lab", () => {
  const xray = element();
  const els = {diagnosticsXray: xray};
  const record = {lab: [55, 26, 0], hex: "#2f6fff", displayIndex: 0, familyId: "harmony-a", variantIndex: 0};
  const stats = {records: [record], entries: []};
  const panel = createDiagnosticsPanel({
    els,
    getConfig: () => ({}),
    getState: () => ({diagnostics: {stats}})
  });

  panel.renderDiagnosticsXray(stats);
  xray.dispatch("click", {target: {closest: sel => sel === "[data-xray-mode]" ? {dataset: {xrayMode: "wheel"}} : null}});

  assert.match(xray.innerHTML, /data-xray-mode="wheel"[^>]*aria-selected="true"/);
  assert.match(xray.innerHTML, /fill="#2f6fff"/);
  assert.match(xray.innerHTML, /#2f6fff · LCH /);
  assert.doesNotMatch(xray.innerHTML, /#2f6fff · LCH 55\.0 26\.0 0°/);
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
