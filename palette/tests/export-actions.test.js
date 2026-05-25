import test from "node:test";
import assert from "node:assert/strict";
import { createExportActions } from "../src/export/export-actions.js";

test("export actions download the visible and full canvases", async () => {
  const calls = [];
  const visibleCanvas = {id: "visible"};
  const fullCanvas = {id: "full"};
  const actions = createExportActions({
    els: {canvas: visibleCanvas, error: {hidden: true, textContent: ""}},
    state: {palette: []},
    draw: () => calls.push(["draw"]),
    renderFullImageCanvas: () => fullCanvas,
    ensurePalette() {},
    getPaletteRecords: () => [],
    downloadCanvasAsPng: async (canvas, filename) => calls.push(["png", canvas.id, filename])
  });

  actions.downloadCanvas();
  actions.downloadFullImage();
  await Promise.resolve();

  assert.deepEqual(calls, [
    ["draw"],
    ["png", "visible", "palette-synth-view.png"],
    ["png", "full", "palette-synth-full.png"]
  ]);
});

test("export actions export the active palette and report failures", async () => {
  const error = {hidden: true, textContent: ""};
  const exports = [];
  const actions = createExportActions({
    els: {error},
    state: {palette: [[0, 0, 0]]},
    root: {getElementById: () => ({value: "json"})},
    draw() {},
    renderFullImageCanvas() { return null; },
    ensurePalette: () => exports.push(["ensure"]),
    getPaletteRecords: () => [],
    downloadCanvasAsPng: async () => {},
    downloadPaletteExport: async (format, colors) => exports.push(["palette", format, colors])
  });

  await actions.exportPalette();

  assert.equal(exports[0][0], "ensure");
  assert.equal(exports[1][0], "palette");
  assert.equal(exports[1][1], "json");
  assert.deepEqual(exports[1][2], ["#000000"]);

  const failing = createExportActions({
    els: {error},
    state: {palette: [[0, 0, 0]]},
    root: {getElementById: () => null},
    draw() {},
    renderFullImageCanvas() { return null; },
    ensurePalette() {},
    getPaletteRecords: () => [],
    downloadCanvasAsPng: async () => {},
    downloadPaletteExport: async () => { throw new Error("nope"); }
  });

  await failing.exportPalette();

  assert.equal(error.hidden, false);
  assert.equal(error.textContent, "Palette export failed: nope");
});
