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
    classList: {
      toggle(name, value) {
        this.owner.toggles.push([name, value]);
      }
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

  assert.match(els.diagnosticsPixel.innerHTML, /title="manual swatch 4 #abcdef"/);
  assert.match(els.diagnosticsPixel.innerHTML, />#1 swatch 4/);
  assert.doesNotMatch(els.diagnosticsPixel.innerHTML, />#1 swatch 1/);
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
  assert.match(els.diagnosticsXray.innerHTML, /stroke-dasharray/);
  assert.match(els.diagnosticsSelection.innerHTML, /Generate from an image/);
  assert.match(els.diagnosticsPixel.innerHTML, /#222222/);
  assert.match(els.diagnosticsPixel.innerHTML, /ΔL [0-9]/);
  assert.doesNotMatch(els.diagnosticsPixel.innerHTML, /ΔL —/);
  assert.match(els.diagnosticsPixel.innerHTML, /ΔH ~/);
});
