import test from "node:test";
import assert from "node:assert/strict";
import { createRenderSession, renderSettingsFromConfig } from "../src/runtime/render-session.js";

function makeConfig(overrides = {}) {
  return {
    pixelPerfect: false,
    cycleOffset: 0,
    compareEnabled: false,
    compareSplit: 0.5,
    blendK: 2,
    softness: 0.3,
    lumaWeight: 1,
    chromaWeight: 1.5,
    hueWeight: 0.75,
    maxDistanceEnabled: false,
    maxDistance: 30,
    blendAmount: 0.8,
    shadowCutoff: 20,
    highlightCutoff: 90,
    ditherScale: 4,
    ditherAngle: 30,
    ditherLumaAmount: 0.6,
    pixelBlockSize: 3,
    pixelBlockSampleMode: "center",
    ...overrides
  };
}

function makeState(overrides = {}) {
  return {
    gl: {canvas: {width: 10, height: 10}},
    texture: null,
    textureDirty: true,
    paletteDirty: true,
    swatchesDirty: true,
    sourceCanvas: {width: 10, height: 10},
    imageData: {width: 10, height: 10},
    paletteRecords: [],
    palette: [],
    paletteBlock: null,
    paletteFeatures: null,
    paletteEntryCount: 0,
    diagnostics: {signature: "old", pixel: {x: 1}},
    renderQueued: false,
    view: {centerX: 0.5, centerY: 0.5},
    ...overrides
  };
}

function makeSession(overrides = {}) {
  const calls = [];
  const records = [{lab: [50, 1, 2]}];
  const state = overrides.state ?? makeState();
  const config = overrides.config ?? makeConfig();
  const stubGlBindFramebuffer = () => calls.push("bindFb");
  if (state.gl && typeof state.gl.bindFramebuffer !== "function") {
    state.gl.bindFramebuffer = stubGlBindFramebuffer;
  }
  const session = createRenderSession({
    els: overrides.els ?? {error: {hidden: false, textContent: ""}},
    state,
    config,
    ensureLevelAdjustedSources: () => calls.push("ensureLevels"),
    getPaletteRecords: () => records,
    paletteUniformEntries: (paletteRecords, renderLabs) => paletteRecords.map((record, index) => ({
      featureLab: record.lab,
      renderLab: renderLabs[index] ?? record.lab
    })),
    renderPaletteLabs: paletteRecords => paletteRecords.map(record => record.lab),
    preprocessPaletteEntries: entries => ({
      paletteBlock: new Float32Array(entries.length * 4),
      paletteFeatures: new Float32Array(entries.length * 4)
    }),
    renderSwatches: () => calls.push("renderSwatches"),
    manualCycleModeEnabled: () => overrides.manualCycleModeEnabled?.() ?? false,
    normalizedCycleOffset: offset => Number(offset) || 0,
    getCanvasRenderSize: () => ({width: 200, height: 100}),
    getViewRect: () => ({x: 10, y: 5, w: 180, h: 90}),
    getViewSpan: () => [0.5, 0.25],
    buildProgram: () => "program",
    vertexSource: overrides.vertexSource ?? "",
    postProcessFragmentSource: overrides.postProcessFragmentSource ?? "",
    viewCompositeFragmentSource: overrides.viewCompositeFragmentSource ?? "",
    updatePaletteRegionOverlay: () => calls.push("overlay"),
    updateDiagnostics: options => calls.push(["diagnostics", options]),
    requestFrame: callback => calls.push(["requestFrame", callback]),
    createTextureFn: () => ({id: "texture"}),
    uploadCanvasTextureFn: (...args) => calls.push(["upload", ...args]),
    configureTextureFn: (...args) => calls.push(["configure", ...args]),
    resizeDrawingBufferFn: (canvas, width, height) => {
      calls.push(["resize", width, height]);
      canvas.width = width;
      canvas.height = height;
    },
    clearFramebufferFn: (...args) => calls.push(["clear", ...args.slice(1)]),
    renderPalettePassFn: (_gl, _program, options) => calls.push(["render", options]),
    ensureOffscreenPaletteTargetFn: overrides.ensureOffscreenPaletteTargetFn
      ?? ((_gl, _cache, width, height) => {
        calls.push(["offscreen", width, height]);
        return {framebuffer: "fb", texture: "offscreenTex", width, height};
      }),
    renderPostProcessPassesFn: overrides.renderPostProcessPassesFn
      ?? ((_gl, _cache, options) => {
        calls.push(["postPasses", {
          width: options.width,
          height: options.height,
          settings: options.settings,
          pixelBlockSize: options.pixelBlockSize
        }]);
        return "processedTex";
      }),
    ensureViewCompositeProgramFn: overrides.ensureViewCompositeProgramFn
      ?? (() => {
        calls.push("compositeProgram");
        return "compositeProgram";
      }),
    renderViewCompositeFn: overrides.renderViewCompositeFn
      ?? ((_gl, _program, options) => calls.push(["composite", options]))
  });
  return {session, state, config, calls};
}

test("renderSettingsFromConfig selects only shader render settings", () => {
  assert.deepEqual(renderSettingsFromConfig(makeConfig({unrelated: "ignored"})), {
    blendK: 2,
    softness: 0.3,
    lumaWeight: 1,
    chromaWeight: 1.5,
    hueWeight: 0.75,
    maxDistanceEnabled: false,
    maxDistance: 30,
    blendAmount: 0.8,
    shadowCutoff: 20,
    highlightCutoff: 90,
    ditherScale: 4,
    ditherAngle: 30,
    ditherLumaAmount: 0.6,
    pixelBlockSize: 3,
    pixelBlockSampleMode: "center"
  });
});

test("render session dirty flags invalidate only the right cached pieces", () => {
  const state = makeState({
    postProcess: {
      offscreen: {dirty: false},
      pipeline: {dirty: false},
      composite: {program: null, programKey: ""}
    }
  });
  const {session} = makeSession({state});

  session.markTextureDirty();
  assert.equal(state.textureDirty, true);
  assert.equal(state.postProcess.offscreen.dirty, true);
  assert.equal(state.postProcess.pipeline.dirty, true);
  assert.equal(state.diagnostics.signature, "");
  assert.equal(state.diagnostics.pixel, null);

  state.postProcess.offscreen.dirty = false;
  state.postProcess.pipeline.dirty = false;
  state.swatchesDirty = false;
  session.markPaletteDirty({swatches: false});
  assert.equal(state.paletteDirty, true);
  assert.equal(state.postProcess.offscreen.dirty, true);
  assert.equal(state.postProcess.pipeline.dirty, true);
  assert.equal(state.swatchesDirty, false);

  session.markPaletteDirty();
  assert.equal(state.swatchesDirty, true);

  state.textureDirty = false;
  state.paletteDirty = false;
  state.sourceLevelsDirty = false;
  state.referenceLevelsDirty = false;
  state.postProcess.offscreen.dirty = false;
  state.postProcess.pipeline.dirty = false;
  session.markLevelsDirty();
  assert.equal(state.sourceLevelsDirty, true);
  assert.equal(state.referenceLevelsDirty, true);
  assert.equal(state.textureDirty, true);
  assert.equal(state.paletteDirty, true);
  assert.equal(state.postProcess.offscreen.dirty, true);
  assert.equal(state.postProcess.pipeline.dirty, true);
});

test("ensureTexture bumps the source texture version after a levels upload", () => {
  const state = makeState({
    texture: {id: "existingTexture"},
    textureDirty: true,
    textureVersion: 4,
    postProcess: {
      offscreen: {dirty: false},
      pipeline: {dirty: false},
      composite: {program: null, programKey: ""}
    }
  });
  const {session} = makeSession({state});

  session.ensureTexture();

  assert.equal(state.textureDirty, false);
  assert.equal(state.textureVersion, 5);
  assert.equal(state.postProcess.offscreen.dirty, true);
  assert.equal(state.postProcess.pipeline.dirty, true);
});


test("ensurePalette refreshes records, uniforms, and swatches once", () => {
  const {session, state, calls} = makeSession();

  session.ensurePalette();
  assert.equal(state.paletteRecords.length, 1);
  assert.deepEqual(state.palette, [[50, 1, 2]]);
  assert.equal(state.paletteEntryCount, 1);
  assert.equal(state.paletteDirty, false);
  assert.equal(state.swatchesDirty, false);
  assert.deepEqual(calls.filter(call => call === "renderSwatches"), ["renderSwatches"]);

  session.ensurePalette();
  assert.deepEqual(calls.filter(call => call === "renderSwatches"), ["renderSwatches"]);
});

test("palette-only refresh keeps existing swatch buttons mounted", () => {
  const {session, state, calls} = makeSession();

  session.ensurePalette();
  calls.length = 0;
  const previousPaletteVersion = state.paletteVersion;

  session.markPaletteDirty({swatches: false});
  session.ensurePalette();

  assert.equal(state.paletteDirty, false);
  assert.equal(state.swatchesDirty, false);
  assert.equal(state.paletteVersion, previousPaletteVersion + 1);
  assert.deepEqual(calls.filter(call => call === "renderSwatches"), []);
});

test("queueRender coalesces frames and runs draw plus after-render hooks", () => {
  const {session, state, calls} = makeSession();

  session.queueRender();
  session.queueRender();
  assert.equal(state.renderQueued, true);
  const frames = calls.filter(call => Array.isArray(call) && call[0] === "requestFrame");
  assert.equal(frames.length, 1);

  frames[0][1](77);
  assert.equal(state.renderQueued, false);
  assert.equal(calls.some(call => Array.isArray(call) && call[0] === "render"), true);
  assert.equal(calls.includes("overlay"), true);
  assert.deepEqual(calls.filter(call => Array.isArray(call) && call[0] === "diagnostics"), [
    ["diagnostics", {immediate: true, frameTime: 77}]
  ]);
});

test("renderPaletteProgram supplies cached palette defaults and render settings", () => {
  const state = makeState({
    paletteBlock: new Float32Array([1, 2, 3, 4]),
    paletteFeatures: new Float32Array([5, 6, 7, 8]),
    paletteEntryCount: 1,
    palette: [[50, 1, 2]],
    paletteRecords: [{lab: [50, 1, 2]}]
  });
  const config = makeConfig({compareEnabled: true, compareSplit: 0.25, cycleOffset: 3});
  const {session, calls} = makeSession({state, config});

  session.renderPaletteProgram(state.gl, "program", {
    texture: {id: "texture"},
    viewport: {x: 0, y: 0, w: 10, h: 10},
    resolution: [10, 10],
    viewportOrigin: [0, 0],
    viewCenter: [0.5, 0.5],
    viewSpan: [1, 1]
  });

  const renderCall = calls.find(call => Array.isArray(call) && call[0] === "render");
  assert.equal(renderCall[1].paletteBlock, state.paletteBlock);
  assert.equal(renderCall[1].paletteFeatures, state.paletteFeatures);
  assert.equal(renderCall[1].paletteSize, 1);
  assert.equal(renderCall[1].visiblePaletteSize, 1);
  assert.equal(renderCall[1].cycleOffset, 3);
  assert.equal(renderCall[1].compareSplit, undefined);
  assert.deepEqual(renderCall[1].settings, renderSettingsFromConfig(config));
});

test("renderPaletteProgram keeps cycle-within mask active for manual cycle tags", () => {
  const paletteBaseBlock = new Float32Array([9, 8, 7, 6]);
  const state = makeState({
    mask: {
      enabled: true,
      behavior: "cycleWithin",
      canvas: {width: 2, height: 2},
      textureDirty: true
    },
    paletteBlock: new Float32Array([1, 2, 3, 4]),
    paletteBaseBlock,
    paletteFeatures: new Float32Array([5, 6, 7, 8]),
    paletteEntryCount: 1,
    palette: [[50, 1, 2]],
    paletteRecords: [{lab: [50, 1, 2]}]
  });
  const {session, calls} = makeSession({
    state,
    manualCycleModeEnabled: () => true
  });

  session.renderPaletteProgram(state.gl, "program", {
    texture: {id: "texture"},
    viewport: {x: 0, y: 0, w: 10, h: 10},
    resolution: [10, 10],
    viewportOrigin: [0, 0],
    viewCenter: [0.5, 0.5],
    viewSpan: [1, 1]
  });

  const renderCall = calls.find(call => Array.isArray(call) && call[0] === "render");
  assert.equal(renderCall[1].maskEnabled, true);
  assert.equal(renderCall[1].manualCycleEnabled, true);
  assert.equal(renderCall[1].cycleOffset, 0);
  assert.equal(renderCall[1].paletteBaseBlock, paletteBaseBlock);
  assert.ok(renderCall[1].maskTexture, "manual mask should still be uploaded and bound");
});

test("draw runs the post-process pipeline when enabled and overlay is off", () => {
  const state = makeState({
    diagnostics: {signature: "", pixel: null, overlay: {mode: "none"}},
    gl: {canvas: {width: 10, height: 10}, NEAREST: "NEAREST", LINEAR: "LINEAR"}
  });
  const config = makeConfig({
    despeckleEnabled: true,
    despeckleStrength: 2,
    pixelBlockSize: 4
  });
  const {session, calls} = makeSession({
    state,
    config,
    vertexSource: "v",
    postProcessFragmentSource: "post",
    viewCompositeFragmentSource: "comp"
  });

  session.draw();

  const offscreen = calls.find(call => Array.isArray(call) && call[0] === "offscreen");
  assert.ok(offscreen, "offscreen palette target should be ensured");
  const offscreenRender = calls.find(call =>
    Array.isArray(call) && call[0] === "render" && call[1].viewCenter[0] === 0.5 && call[1].viewSpan[0] === 1
  );
  assert.ok(offscreenRender, "palette pass should run with identity view");
  assert.equal(offscreenRender[1].compareSplit, undefined);
  assert.equal(offscreenRender[1].diagnosticOverlayMode, "none");

  const postPasses = calls.find(call => Array.isArray(call) && call[0] === "postPasses");
  assert.ok(postPasses, "post-process passes should run");
  assert.equal(postPasses[1].settings.despeckleEnabled, true);
  assert.equal(postPasses[1].settings.despeckleStrength, 2);
  assert.equal(postPasses[1].pixelBlockSize, 4);

  const composite = calls.find(call => Array.isArray(call) && call[0] === "composite");
  assert.ok(composite, "view composite should run");
  assert.equal(composite[1].processedTexture, "processedTex");
  assert.equal(composite[1].sourceTexture, state.texture);
  const configure = calls.find(call => Array.isArray(call) && call[0] === "configure");
  assert.deepEqual(configure, ["configure", state.gl, "processedTex", {filter: state.gl.LINEAR}]);

  // Direct palette pass at viewport coordinates should NOT have run.
  const directRender = calls.find(call =>
    Array.isArray(call) && call[0] === "render" && call[1].viewport && call[1].viewport.w === 180
  );
  assert.equal(directRender, undefined);
});

test("draw keeps compare split on the direct palette path without despeckle", () => {
  const state = makeState({
    diagnostics: {signature: "", pixel: null, overlay: {mode: "none"}},
    gl: {canvas: {width: 10, height: 10}, NEAREST: "NEAREST", LINEAR: "LINEAR"}
  });
  const config = makeConfig({
    compareEnabled: true,
    compareSplit: 0.3,
    despeckleEnabled: false
  });
  const {session, calls} = makeSession({
    state,
    config,
    vertexSource: "v",
    viewCompositeFragmentSource: "comp"
  });

  session.draw();

  assert.equal(calls.find(call => Array.isArray(call) && call[0] === "postPasses"), undefined);
  assert.equal(calls.find(call => Array.isArray(call) && call[0] === "composite"), undefined);
  assert.equal(calls.find(call => Array.isArray(call) && call[0] === "configure"), undefined);

  const directRender = calls.find(call =>
    Array.isArray(call) && call[0] === "render" && call[1].viewport && call[1].viewport.w === 180
  );
  assert.ok(directRender, "compare split without post-processing should use the normal direct path");
  assert.equal(directRender[1].compareSplit, 0.3);
  assert.equal(directRender[1].compareEnabled, true);
});

test("draw bypasses post-process when a diagnostic overlay is active", () => {
  const state = makeState({
    diagnostics: {signature: "", pixel: null, overlay: {mode: "difference"}}
  });
  const config = makeConfig({
    despeckleEnabled: true,
    despeckleStrength: 1
  });
  const {session, calls} = makeSession({
    state,
    config,
    vertexSource: "v",
    postProcessFragmentSource: "post",
    viewCompositeFragmentSource: "comp"
  });

  session.draw();

  assert.equal(calls.find(call => Array.isArray(call) && call[0] === "postPasses"), undefined);
  assert.equal(calls.find(call => Array.isArray(call) && call[0] === "composite"), undefined);
  const directRender = calls.find(call =>
    Array.isArray(call) && call[0] === "render" && call[1].viewport && call[1].viewport.w === 180
  );
  assert.ok(directRender, "direct render should run when overlay is active");
});

test("draw falls back to direct path when post-process shaders are missing", () => {
  const state = makeState({
    diagnostics: {signature: "", pixel: null, overlay: {mode: "none"}}
  });
  const config = makeConfig({despeckleEnabled: true, despeckleStrength: 1});
  const els = {error: {hidden: true, textContent: ""}};
  const {session, calls} = makeSession({
    state,
    config,
    els,
    // No vertexSource / postProcessFragmentSource / viewCompositeFragmentSource.
    ensureOffscreenPaletteTargetFn: () => {
      throw new Error("should not be reached when shaders are missing");
    }
  });

  session.draw();

  assert.equal(state.postProcessFailureMessage, "Composite shader source is missing.");
  assert.equal(els.error.hidden, false);
  const directRender = calls.find(call =>
    Array.isArray(call) && call[0] === "render" && call[1].viewport && call[1].viewport.w === 180
  );
  assert.ok(directRender, "direct render should run as fallback");
});

test("draw clears the post-process failure message after a clean direct frame", () => {
  const state = makeState({
    diagnostics: {signature: "", pixel: null, overlay: {mode: "none"}},
    postProcessFailureMessage: "stale"
  });
  const els = {error: {hidden: false, textContent: "stale"}};
  const config = makeConfig({despeckleEnabled: false});
  const {session} = makeSession({state, config, els});

  session.draw();

  assert.equal(state.postProcessFailureMessage, "");
  assert.equal(els.error.hidden, true);
});
