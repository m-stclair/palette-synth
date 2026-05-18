import test from "node:test";
import assert from "node:assert/strict";
import { createRenderedCanvasController, paletteUniformDataForOffset } from "../src/export/rendered-canvas.js";

test("paletteUniformDataForOffset builds export uniforms and caps visible palette size", () => {
  const records = Array.from({length: 70}, (_, index) => ({lab: [index, index + 1, index + 2]}));
  const out = paletteUniformDataForOffset(records, 3, {
    manualCycleModeEnabled: () => true,
    applyManualCycle: (paletteRecords, offset) => paletteRecords.map(record => [record.lab[0] + offset, 0, 0]),
    paletteUniformEntries: (paletteRecords, renderLabs) => paletteRecords.map((record, index) => ({
      featureLab: record.lab,
      renderLab: renderLabs[index]
    })),
    preprocessPaletteEntries: entries => ({
      paletteBlock: new Float32Array(entries.length * 4),
      paletteFeatures: new Float32Array(entries.length * 4)
    })
  });

  assert.equal(out.paletteSize, 70);
  assert.equal(out.visiblePaletteSize, 64);
  assert.equal(out.paletteBlock.length, 280);
  assert.equal(out.paletteFeatures.length, 280);
});

test("rendered canvas controller wires offscreen export rendering", () => {
  const calls = [];
  const exportCanvas = {width: 0, height: 0};
  const texture = {id: "texture"};
  const state = {
    imageData: {width: 8, height: 4},
    sourceCanvas: {width: 8, height: 4},
    paletteRecords: [{lab: [50, 0, 0]}]
  };
  const gl = {
    finish: () => calls.push("finish"),
    deleteTexture: value => calls.push(["deleteTexture", value])
  };
  const controller = createRenderedCanvasController({
    state,
    config: {cycleOffset: 4, pixelPerfect: true},
    document: {createElement: tag => {
      calls.push(["createElement", tag]);
      return exportCanvas;
    }},
    ensurePalette: () => calls.push("ensurePalette"),
    getPaletteRecords: () => [{lab: [60, 1, 2]}],
    fallbackPaletteRecords: () => [{lab: [0, 0, 0]}],
    paletteUniformEntries: (records, renderLabs) => records.map((record, index) => ({featureLab: record.lab, renderLab: renderLabs[index]})),
    preprocessPaletteEntries: entries => ({
      paletteBlock: new Float32Array(entries.length * 4),
      paletteFeatures: new Float32Array(entries.length * 4)
    }),
    manualCycleModeEnabled: () => false,
    applyManualCycle: records => records.map(record => record.lab),
    normalizedCycleOffset: offset => Number(offset) + 1,
    buildProgramForContext: (renderGl, cache, overrides) => {
      calls.push(["buildProgram", renderGl, cache, overrides]);
      return "program";
    },
    renderPaletteProgram: (renderGl, program, options) => calls.push(["render", renderGl, program, options]),
    createWebgl2ContextFn: canvas => {
      calls.push(["webgl", canvas]);
      return gl;
    },
    createTextureFn: renderGl => {
      calls.push(["texture", renderGl]);
      return texture;
    },
    uploadCanvasTextureFn: (renderGl, uploadedTexture, canvas, options) => calls.push(["upload", renderGl, uploadedTexture, canvas, options]),
    clearFramebufferFn: (renderGl, width, height) => calls.push(["clear", renderGl, width, height]),
    disposeCachedProgramFn: (renderGl, cache) => calls.push(["dispose", renderGl, cache])
  });

  assert.equal(controller.renderProcessedCanvas({width: 3.2, height: 2.7, showPalette: "right", cycleOffset: 9}), exportCanvas);
  assert.equal(exportCanvas.width, 3);
  assert.equal(exportCanvas.height, 3);
  assert.deepEqual(calls[0], ["createElement", "canvas"]);
  assert.deepEqual(calls[3], ["upload", gl, texture, state.sourceCanvas, {pixelPerfect: true}]);
  const buildCall = calls.find(call => Array.isArray(call) && call[0] === "buildProgram");
  assert.deepEqual(buildCall[3], {showPalette: "right"});
  const renderCall = calls.find(call => Array.isArray(call) && call[0] === "render");
  assert.equal(renderCall[1], gl);
  assert.equal(renderCall[2], "program");
  assert.equal(renderCall[3].cycleOffset, 10);
  assert.equal(renderCall[3].paletteSize, 1);
  assert.deepEqual(calls.at(-3), "finish");
  assert.deepEqual(calls.at(-2), ["deleteTexture", texture]);
  assert.equal(calls.at(-1)[0], "dispose");

  calls.length = 0;
  assert.equal(controller.renderFullImageCanvas(), exportCanvas);
  assert.equal(calls[0], "ensurePalette");
});

test("rendered canvas controller returns null before an image is available", () => {
  const controller = createRenderedCanvasController({
    state: {imageData: null, sourceCanvas: {width: 0, height: 0}, paletteRecords: []},
    config: {},
    document: {createElement: () => ({})},
    getPaletteRecords: () => [],
    fallbackPaletteRecords: () => [],
    paletteUniformEntries: () => [],
    preprocessPaletteEntries: () => ({paletteBlock: new Float32Array(), paletteFeatures: new Float32Array()}),
    buildProgramForContext: () => "program",
    renderPaletteProgram: () => {}
  });

  assert.equal(controller.renderProcessedCanvas(), null);
});

test("rendered canvas controller composites compare split exports without post-process", () => {
  const calls = [];
  const exportCanvas = {width: 0, height: 0};
  const texture = {id: "texture"};
  const gl = {
    NEAREST: "NEAREST",
    LINEAR: "LINEAR",
    bindFramebuffer: (...args) => calls.push(["bindFramebuffer", ...args]),
    finish: () => calls.push("finish"),
    deleteTexture: value => calls.push(["deleteTexture", value])
  };
  const state = {
    imageData: {width: 8, height: 4},
    sourceCanvas: {width: 8, height: 4},
    paletteRecords: [{lab: [50, 0, 0]}]
  };
  const controller = createRenderedCanvasController({
    state,
    config: {cycleOffset: 0, pixelPerfect: false, despeckleEnabled: false},
    document: {createElement: () => exportCanvas},
    getPaletteRecords: () => state.paletteRecords,
    fallbackPaletteRecords: () => state.paletteRecords,
    paletteUniformEntries: (records, renderLabs) => records.map((record, index) => ({featureLab: record.lab, renderLab: renderLabs[index]})),
    preprocessPaletteEntries: entries => ({
      paletteBlock: new Float32Array(entries.length * 4),
      paletteFeatures: new Float32Array(entries.length * 4)
    }),
    applyManualCycle: records => records.map(record => record.lab),
    buildProgramForContext: () => "program",
    renderPaletteProgram: (_gl, _program, options) => calls.push(["render", options]),
    vertexSource: "v",
    viewCompositeFragmentSource: "comp",
    createWebgl2ContextFn: () => gl,
    createTextureFn: () => texture,
    uploadCanvasTextureFn: () => calls.push("upload"),
    configureTextureFn: (...args) => calls.push(["configure", ...args]),
    clearFramebufferFn: (_gl, width, height) => calls.push(["clear", width, height]),
    ensureOffscreenPaletteTargetFn: (_gl, _cache, width, height) => {
      calls.push(["offscreen", width, height]);
      return {framebuffer: "fb", texture: "offscreenTex", width, height};
    },
    ensureViewCompositeProgramFn: () => {
      calls.push("compositeProgram");
      return "compositeProgram";
    },
    renderViewCompositeFn: (_gl, _program, options) => calls.push(["composite", options]),
    disposeCachedProgramFn: () => calls.push("disposeProgram"),
    disposeOffscreenPaletteTargetFn: () => calls.push("disposeOffscreen"),
    disposePostProcessCacheFn: () => calls.push("disposePost"),
    disposeViewCompositeCacheFn: () => calls.push("disposeComposite")
  });

  assert.equal(controller.renderProcessedCanvas({compareSplit: 0.4}), exportCanvas);

  const renderCall = calls.find(call => Array.isArray(call) && call[0] === "render");
  assert.equal(renderCall[1].compareSplit, undefined);
  assert.equal(calls.find(call => Array.isArray(call) && call[0] === "postPasses"), undefined);
  const composite = calls.find(call => Array.isArray(call) && call[0] === "composite");
  assert.ok(composite, "compare export should use the composite pass");
  assert.equal(composite[1].processedTexture, "offscreenTex");
  const configure = calls.find(call => Array.isArray(call) && call[0] === "configure");
  assert.deepEqual(configure, ["configure", gl, "offscreenTex", {filter: "LINEAR"}]);
  assert.equal(composite[1].compareSplit, 0.4);
  assert.equal(composite[1].compareEnabled, true);
});
