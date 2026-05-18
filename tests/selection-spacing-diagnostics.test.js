import test from "node:test";
import assert from "node:assert/strict";
import {selectTopNScoredSwatches} from "../src/palette/selection.js";
import {createDiagnosticsPanel} from "../src/ui/diagnostics-panel.js";

function element() {
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

function ownedElement() {
  const el = element();
  el.classList.owner = el;
  return el;
}

test("selection trace treats below-target candidates as eligible after spacing relaxation", () => {
  const trace = [];
  selectTopNScoredSwatches(
    [[20, 0, 0], [21, 0, 0], [22, 0, 0], [23, 0, 0]],
    {chroma: 1, outlier: 0.7, midtone: 0.25},
    3,
    999,
    1,
    {trace}
  );

  const relaxedRound = trace[0].rounds.find(round => round.spacing.relaxed);
  assert.ok(relaxedRound, "expected an over-constrained spacing round to relax");
  assert.equal(relaxedRound.spacing.blockedCandidateCount, 0);
  assert.ok(relaxedRound.spacing.belowTargetCandidateCount > 0);
  assert.equal(relaxedRound.blockedNearMisses.length, 0);
  assert.equal(relaxedRound.picked.blockedBySpacing, false);
  assert.equal(relaxedRound.picked.belowSpacingTarget, true);
  assert.equal(relaxedRound.picked.reason, "eligible after spacing relaxation");
  assert.ok(relaxedRound.nearMisses.length > 0);
  assert.ok(relaxedRound.nearMisses.every(item => item.blockedBySpacing === false));
  assert.ok(relaxedRound.nearMisses.some(item => item.belowSpacingTarget === true));
});

test("diagnostics panel labels relaxed spacing without reporting active blocks", () => {
  const els = {
    diagnosticsSummary: ownedElement(),
    diagnosticsUsage: ownedElement(),
    diagnosticsUsageHeading: ownedElement(),
    diagnosticsXray: ownedElement(),
    diagnosticsSelection: ownedElement(),
    diagnosticsPixel: ownedElement()
  };
  const trace = [];
  selectTopNScoredSwatches(
    [[20, 0, 0], [21, 0, 0], [22, 0, 0], [23, 0, 0]],
    {chroma: 1, outlier: 0.7, midtone: 0.25},
    3,
    999,
    1,
    {trace}
  );

  const panel = createDiagnosticsPanel({
    els,
    getConfig: () => ({assignMode: "nearest"}),
    getState: () => ({
      imageData: {width: 1, height: 1},
      diagnostics: {},
      paletteSelectionTrace: trace[0]
    }),
    isGeneratedPaletteMode: () => true,
    activePaletteImageData: () => ({width: 1, height: 1, data: new Uint8ClampedArray(4)})
  });

  panel.renderDiagnosticsPanel({records: [], entries: [], sample: null});

  assert.match(els.diagnosticsSelection.innerHTML, /Family spacing relaxed/);
  assert.match(els.diagnosticsSelection.innerHTML, /below target/);
  assert.doesNotMatch(els.diagnosticsSelection.innerHTML, /0 blocked, fallback pool/);
  assert.doesNotMatch(els.diagnosticsSelection.innerHTML, /Closest blocked by spacing/);
  assert.doesNotMatch(els.diagnosticsSelection.innerHTML, /blocked by family spacing/);
});
