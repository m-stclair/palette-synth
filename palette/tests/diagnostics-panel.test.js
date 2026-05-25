import test from "node:test";
import assert from "node:assert/strict";
import {
  createDiagnosticsPanel,
  formatDistance,
  formatUsagePercent
} from "../src/ui/diagnostics-panel.js";
import { labToHex, oklchToLab } from "../src/color-utils.js";

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


test("X-Ray renders five distinct modes and switches between them on click", () => {
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
  assert.match(xray.innerHTML, /data-xray-mode="cylinder"/);
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

  clickMode("cylinder");
  assert.match(xray.innerHTML, /data-xray-mode="cylinder"[^>]*aria-selected="true"/);
  assert.match(xray.innerHTML, /class="xray-plot xray-square xray-cylinder"/);
  assert.match(xray.innerHTML, /Rotatable LCH cylinder/);
  assert.match(xray.innerHTML, /drag to rotate/);

  clickMode("scatter");
  assert.match(xray.innerHTML, /data-xray-mode="scatter"[^>]*aria-selected="true"/);
});

test("graph swatch markers show muted state with slash indicators", () => {
  const xray = element();
  const histogramEl = element();
  const tabs = element();
  const records = [
    {lab: [25, 12, 4], hex: "#4a3328", displayIndex: 0, muted: true},
    {lab: [72, -18, -14], hex: "#62aeb8", displayIndex: 1}
  ];
  const stats = {records, entries: [], collisions: {threshold: 10}};
  const histogram = {
    channel: "luma",
    axisLabel: "L",
    bins: [1, 2, 1],
    segments: {neutral: [1, 1, 0], muted: [0, 1, 0], vivid: [0, 0, 1]},
    segmentNames: ["neutral", "muted", "vivid"],
    max: 2,
    total: 4,
    step: 1,
    domain: {min: 0, max: 100},
    stats: {p10: 10, median: 40, p90: 80, mean: 45, mode: 30, max: 90, saturatedPercent: 0}
  };
  const state = {
    imageData: {width: 1, height: 1},
    diagnostics: {
      stats,
      histogramTab: "luma",
      histogramStats: {
        "source-luma": {records, histogram},
        "output-luma": {records, histogram: {...histogram}}
      }
    }
  };
  const panel = createDiagnosticsPanel({
    els: {diagnosticsXray: xray, diagnosticsHistogram: histogramEl, diagnosticsTabs: tabs},
    getConfig: () => ({assignMode: "nearest", lumaWeight: 1, chromaWeight: 1, hueWeight: 1}),
    getState: () => state
  });

  panel.renderDiagnosticsXray(stats);
  assert.match(xray.innerHTML, /class="xray-swatch-marker is-muted"/);
  assert.match(xray.innerHTML, /xray-swatch-muted-slash/);
  assert.match(xray.innerHTML, /#4a3328 · LCH .* · muted/);

  for (const mode of ["wheel", "ramp", "proximity", "cylinder"]) {
    xray.dispatch("click", {target: {closest: sel => sel === "[data-xray-mode]" ? {dataset: {xrayMode: mode}} : null}});
    assert.match(xray.innerHTML, /class="xray-swatch-marker is-muted"/);
    assert.match(xray.innerHTML, /xray-swatch-muted-slash/);
  }

  panel.renderHistogramPanel(state.diagnostics.histogramStats);
  assert.match(histogramEl.innerHTML, /class="diagnostics-graph-swatch is-muted"/);
  assert.match(histogramEl.innerHTML, /diagnostics-histogram-muted-slash/);
  assert.match(histogramEl.innerHTML, /swatch 1 · L .* · #4a3328 · LCH .* · muted/);
});

test("X-Ray swatch markers delegate clicks to the palette swatch action", () => {
  const xray = element();
  const records = [
    {lab: [25, 12, 4], hex: "#4a3328", displayIndex: 0},
    {lab: [72, -18, -14], hex: "#62aeb8", displayIndex: 1}
  ];
  const stats = {records, entries: []};
  const calls = [];
  const panel = createDiagnosticsPanel({
    els: {diagnosticsXray: xray},
    getConfig: () => ({}),
    getState: () => ({diagnostics: {stats}}),
    onPaletteSwatchClick: (record, index, event) => {
      calls.push({record, index, shiftKey: !!event.shiftKey});
    }
  });

  panel.renderDiagnosticsXray(stats);

  assert.match(xray.innerHTML, /data-palette-graph-swatch-index="1"/);
  const target = {
    dataset: {paletteGraphSwatchIndex: "1"},
    closest(selector) {
      return selector === "[data-palette-graph-swatch-index]" ? this : null;
    }
  };
  let prevented = false;
  let stopped = false;
  xray.dispatch("click", {
    target,
    shiftKey: true,
    preventDefault() { prevented = true; },
    stopPropagation() { stopped = true; }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].record, records[1]);
  assert.equal(calls[0].index, 1);
  assert.equal(calls[0].shiftKey, true);
  assert.equal(prevented, true);
  assert.equal(stopped, true);
});


test("X-Ray marks selected swatches and alt-drags editable graph swatches", () => {
  const xray = element();
  const records = [
    {lab: [50, 12, 0], hex: "#8b756b", displayIndex: 0, source: "manual", swatchId: "manual-a"},
    {lab: [72, -18, -14], hex: "#62aeb8", displayIndex: 1, source: "manual", swatchId: "manual-b"}
  ];
  const stats = {records, entries: []};
  const calls = [];
  const state = {manualEditor: {swatchId: "manual-b"}, diagnostics: {stats}};
  const panel = createDiagnosticsPanel({
    els: {diagnosticsXray: xray},
    getConfig: () => ({paletteMode: "manual"}),
    getState: () => state,
    onGraphSwatchReposition: (record, lab, meta) => {
      calls.push({record, index: meta.index, lab, phase: meta.phase, mode: meta.mode});
      return true;
    }
  });

  panel.renderDiagnosticsXray(stats);
  assert.match(xray.innerHTML, /class="xray-swatch-marker is-selected"/);
  assert.match(xray.innerHTML, /selected/);

  const svg = {
    dataset: {xrayPlotMode: "scatter", xrayViewBox: "0 0 360 220"},
    getAttribute(name) { return name === "viewBox" ? "0 0 360 220" : null; },
    getBoundingClientRect() { return {left: 100, top: 50, width: 720, height: 440}; },
    createSVGPoint() {
      return {x: 0, y: 0, matrixTransform() { return {x: this.x, y: this.y}; }};
    },
    getScreenCTM() { return {inverse() { return {}; }}; }
  };
  let captured = false;
  let released = false;
  const target = {
    dataset: {paletteGraphSwatchIndex: "0"},
    closest(selector) {
      if (selector === "[data-palette-graph-swatch-index]") return this;
      if (selector === "svg.xray-plot" || selector === ".xray-plot") return svg;
      return null;
    },
    setPointerCapture() { captured = true; },
    releasePointerCapture() { released = true; }
  };
  let prevented = false;
  let stopped = false;
  const baseEvent = {
    target,
    altKey: true,
    pointerId: 9,
    // ViewBox point 24,110 mapped through the rendered rect. If drag mapping
    // accidentally uses page/client coordinates, this would immediately clamp
    // the swatch toward an axis extreme instead of staying near mid-lightness.
    clientX: 148,
    clientY: 270,
    preventDefault() { prevented = true; },
    stopPropagation() { stopped = true; }
  };
  const movedEvent = {...baseEvent, clientX: 474, clientY: 270}; // ViewBox point 187,110.

  xray.dispatch("pointerdown", baseEvent);
  xray.dispatch("pointermove", movedEvent);
  xray.dispatch("pointerup", movedEvent);

  assert.equal(captured, true);
  assert.equal(released, true);
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.deepEqual(calls.map(call => call.phase), ["start", "move", "end"]);
  assert.equal(calls[0].record, records[0]);
  assert.equal(calls[0].index, 0);
  assert.equal(calls[0].mode, "scatter");
  assert.equal(Array.isArray(calls[0].lab), true);
  assert.notEqual(typeof calls[0].lab, "number");
  assert.ok(calls[1].lab[0] > 45 && calls[1].lab[0] < 55);
  assert.ok(calls.at(-1).lab[0] > 45 && calls.at(-1).lab[0] < 55);
});

test("X-Ray alt-shift drag drops a match anchor before moving", () => {
  const xray = element();
  const records = [
    {lab: [50, 12, 0], hex: "#8b756b", displayIndex: 0, source: "manual", swatchId: "manual-a"}
  ];
  const stats = {records, entries: []};
  const calls = [];
  const panel = createDiagnosticsPanel({
    els: {diagnosticsXray: xray},
    getState: () => ({diagnostics: {stats}}),
    onGraphSwatchReposition: (record, lab, meta) => {
      calls.push({record, lab, phase: meta.phase, anchorHex: meta.anchorHex, matchAnchorDropped: meta.matchAnchorDropped});
      return true;
    }
  });

  panel.renderDiagnosticsXray(stats);

  const svg = {
    dataset: {xrayPlotMode: "scatter", xrayViewBox: "0 0 360 220"},
    getAttribute(name) { return name === "viewBox" ? "0 0 360 220" : null; },
    getBoundingClientRect() { return {left: 0, top: 0, width: 360, height: 220}; }
  };
  const target = {
    dataset: {paletteGraphSwatchIndex: "0"},
    closest(selector) {
      if (selector === "[data-palette-graph-swatch-index]") return this;
      if (selector === "svg.xray-plot" || selector === ".xray-plot") return svg;
      return null;
    },
    setPointerCapture() {},
    releasePointerCapture() {}
  };
  const baseEvent = {target, altKey: true, shiftKey: true, pointerId: 7, clientX: 24, clientY: 110, preventDefault() {}, stopPropagation() {}};
  const movedEvent = {...baseEvent, clientX: 90, clientY: 110};

  xray.dispatch("pointerdown", baseEvent);
  xray.dispatch("pointermove", movedEvent);
  xray.dispatch("pointerup", movedEvent);

  assert.deepEqual(calls.map(call => call.phase), ["start", "anchor", "move", "end"]);
  assert.equal(calls[1].anchorHex, "#8b756b");
  assert.equal(Array.isArray(calls[1].lab), true);
  assert.equal(calls.at(-1).matchAnchorDropped, true);
});

test("X-Ray alt-shift double-click promotes a graph swatch match anchor", () => {
  const xray = element();
  const records = [{lab: [50, 12, 0], hex: "#8b756b", displayIndex: 0, source: "manual", swatchId: "manual-a"}];
  const stats = {records, entries: []};
  const clicks = [];
  const promotions = [];
  const panel = createDiagnosticsPanel({
    els: {diagnosticsXray: xray},
    getState: () => ({diagnostics: {stats}}),
    onPaletteSwatchClick: (record, index, event) => clicks.push({record, index, shiftKey: event.shiftKey}),
    onGraphSwatchPromoteAnchor: (record, meta) => {
      promotions.push({record, index: meta.index});
      return true;
    }
  });

  panel.renderDiagnosticsXray(stats);
  const target = {
    dataset: {paletteGraphSwatchIndex: "0"},
    closest(selector) { return selector === "[data-palette-graph-swatch-index]" ? this : null; }
  };
  let clickPrevented = false;
  xray.dispatch("click", {target, altKey: true, shiftKey: true, preventDefault() { clickPrevented = true; }, stopPropagation() {}});
  xray.dispatch("dblclick", {target, altKey: true, shiftKey: true, preventDefault() {}, stopPropagation() {}});

  assert.equal(clickPrevented, true);
  assert.deepEqual(clicks, []);
  assert.equal(promotions.length, 1);
  assert.equal(promotions[0].record, records[0]);
  assert.equal(promotions[0].index, 0);
});

test("X-Ray cylinder rotates with drag and keyboard controls", () => {
  const xray = element();
  const records = [
    {lab: [30, 22, 4], hex: "#634c2f", displayIndex: 0},
    {lab: [68, -18, -16], hex: "#54a6b0", displayIndex: 1}
  ];
  const stats = {records, entries: []};
  const panel = createDiagnosticsPanel({
    els: {diagnosticsXray: xray},
    getConfig: () => ({}),
    getState: () => ({diagnostics: {stats}})
  });

  panel.renderDiagnosticsXray(stats);
  xray.dispatch("click", {target: {closest: sel => sel === "[data-xray-mode]" ? {dataset: {xrayMode: "cylinder"}} : null}});
  const before = xray.innerHTML.match(/yaw ([0-9]+)°/)?.[1];
  assert.match(xray.innerHTML, /data-xray-cylinder/);

  const cylinderTarget = {
    closest: sel => sel === "[data-xray-cylinder]" ? {setPointerCapture() {}, releasePointerCapture() {}} : null
  };
  xray.dispatch("pointerdown", {target: cylinderTarget, pointerId: 1, clientX: 10, clientY: 10, preventDefault() {}});
  xray.dispatch("pointermove", {target: cylinderTarget, pointerId: 1, clientX: 80, clientY: 25});
  const afterDrag = xray.innerHTML.match(/yaw ([0-9]+)°/)?.[1];
  assert.notEqual(afterDrag, before);

  xray.dispatch("keydown", {target: cylinderTarget, key: "ArrowRight", preventDefault() {}});
  const afterKey = xray.innerHTML.match(/yaw ([0-9]+)°/)?.[1];
  assert.notEqual(afterKey, afterDrag);

  xray.dispatch("pointerdown", {target: cylinderTarget, pointerId: 2, clientX: 0, clientY: 0, preventDefault() {}});
  xray.dispatch("pointermove", {target: cylinderTarget, pointerId: 2, clientX: 0, clientY: -500});
  assert.match(xray.innerHTML, /tilt 90°/);
  xray.dispatch("pointerup", {target: cylinderTarget, pointerId: 2});

  xray.dispatch("pointerdown", {target: cylinderTarget, pointerId: 3, clientX: 0, clientY: 0, preventDefault() {}});
  xray.dispatch("pointermove", {target: cylinderTarget, pointerId: 3, clientX: 0, clientY: 500});
  assert.match(xray.innerHTML, /tilt -90°/);
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

test("X-Ray wheel displays match anchor aliases", () => {
  const xray = element();
  const swatchLab = oklchToLab([58, 4, 0]);
  const anchorLab = oklchToLab([62, 42, Math.PI * 0.72]);
  const record = {lab: swatchLab, hex: labToHex(swatchLab), displayIndex: 0, swatchId: "anchor-test"};
  const anchorHex = labToHex(anchorLab);
  const stats = {
    records: [record],
    entries: [{alias: true, sourceRecord: record, featureLab: anchorLab, renderLab: swatchLab}]
  };
  const panel = createDiagnosticsPanel({
    els: {diagnosticsXray: xray},
    getConfig: () => ({}),
    getState: () => ({diagnostics: {stats}})
  });

  panel.renderDiagnosticsXray(stats);
  xray.dispatch("click", {target: {closest: sel => sel === "[data-xray-mode]" ? {dataset: {xrayMode: "wheel"}} : null}});

  assert.match(xray.innerHTML, /class="xray-match-anchor"/);
  assert.match(xray.innerHTML, /match anchor for swatch 1/);
  assert.match(xray.innerHTML, new RegExp(`fill="${anchorHex}"`));
  assert.match(xray.innerHTML, /max C 42/);
});

test("X-Ray tonal ramp displays match anchor aliases", () => {
  const xray = element();
  const swatchLab = oklchToLab([34, 5, 0]);
  const anchorLab = oklchToLab([78, 12, Math.PI * 0.33]);
  const record = {lab: swatchLab, hex: labToHex(swatchLab), displayIndex: 0, swatchId: "tonal-anchor-test"};
  const anchorHex = labToHex(anchorLab);
  const stats = {
    records: [record],
    entries: [{alias: true, sourceRecord: record, featureLab: anchorLab, renderLab: swatchLab}]
  };
  const panel = createDiagnosticsPanel({
    els: {diagnosticsXray: xray},
    getConfig: () => ({}),
    getState: () => ({diagnostics: {stats}})
  });

  panel.renderDiagnosticsXray(stats);
  xray.dispatch("click", {target: {closest: sel => sel === "[data-xray-mode]" ? {dataset: {xrayMode: "ramp"}} : null}});

  assert.match(xray.innerHTML, /data-xray-mode="ramp"[^>]*aria-selected="true"/);
  assert.match(xray.innerHTML, /class="xray-match-anchor"/);
  assert.match(xray.innerHTML, /match anchor for swatch 1/);
  assert.match(xray.innerHTML, new RegExp(`fill="${anchorHex}"`));
});

test("X-Ray cylinder displays match anchor aliases", () => {
  const xray = element();
  const swatchLab = oklchToLab([52, 6, 0]);
  const anchorLab = oklchToLab([66, 44, Math.PI * 0.68]);
  const record = {lab: swatchLab, hex: labToHex(swatchLab), displayIndex: 0, swatchId: "cylinder-anchor-test"};
  const anchorHex = labToHex(anchorLab);
  const stats = {
    records: [record],
    entries: [{alias: true, sourceRecord: record, featureLab: anchorLab, renderLab: swatchLab}]
  };
  const panel = createDiagnosticsPanel({
    els: {diagnosticsXray: xray},
    getConfig: () => ({}),
    getState: () => ({diagnostics: {stats}})
  });

  panel.renderDiagnosticsXray(stats);
  xray.dispatch("click", {target: {closest: sel => sel === "[data-xray-mode]" ? {dataset: {xrayMode: "cylinder"}} : null}});

  assert.match(xray.innerHTML, /data-xray-mode="cylinder"[^>]*aria-selected="true"/);
  assert.match(xray.innerHTML, /class="xray-match-anchor"/);
  assert.match(xray.innerHTML, /match anchor for swatch 1/);
  assert.match(xray.innerHTML, new RegExp(`fill="${anchorHex}"`));
  assert.match(xray.innerHTML, /C 44/);
});

test("X-Ray mode switches keep the freshest X-Ray-only stats instead of old full diagnostics", () => {
  const xray = element();
  const oldRecord = {lab: [20, 0, 0], hex: "#111111", displayIndex: 0};
  const freshRecord = {lab: [80, 0, 0], hex: "#eeeeee", displayIndex: 0};
  const state = {diagnostics: {stats: {records: [oldRecord], entries: []}}};
  const panel = createDiagnosticsPanel({
    els: {diagnosticsXray: xray},
    getConfig: () => ({}),
    getState: () => state
  });

  panel.renderDiagnosticsXray({records: [freshRecord], entries: []});
  xray.dispatch("click", {target: {closest: sel => sel === "[data-xray-mode]" ? {dataset: {xrayMode: "wheel"}} : null}});

  assert.match(xray.innerHTML, /fill="#eeeeee"/);
  assert.doesNotMatch(xray.innerHTML, /fill="#111111"/);
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
