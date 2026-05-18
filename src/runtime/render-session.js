import { paletteLabs } from "../color-utils.js";
import { MAX_PALETTE_SIZE } from "../constants.js";
import { MASK_BEHAVIOR_CYCLE_WITHIN, MASK_BEHAVIOR_FORBID_COLORS, maskBehaviorCode, maskForbiddenSourceFlags } from "../ui/cycle-mask.js";
import { clearFramebuffer, resizeDrawingBuffer } from "../gl/context.js";
import { renderPalettePass } from "../gl/palette-renderer.js";
import { blockSamplePassNeeded, blockSampleTextureSize, renderBlockSamplePass } from "../gl/block-sampler.js";
import { buildStaticProgram } from "../gl/programs.js";
import { configureTexture, createTexture, uploadCanvasTexture } from "../gl/textures.js";
import {
  postProcessActive,
  postProcessSettingsFromConfig,
  renderPostProcessPasses
} from "../gl/post-process-renderer.js";
import { ensureOffscreenPaletteTarget } from "../gl/offscreen-palette-target.js";
import {
  ensureViewCompositeProgram,
  renderViewComposite
} from "../gl/view-composite-renderer.js";

function fallbackPaletteSourceIndices(entries = []) {
  const out = new Int32Array(MAX_PALETTE_SIZE);
  out.fill(-1);
  const safeEntries = Array.isArray(entries) ? entries : [];
  for (let i = 0; i < Math.min(safeEntries.length, MAX_PALETTE_SIZE); i++) {
    const record = safeEntries[i]?.sourceRecord;
    out[i] = Number.isInteger(record?.displayIndex) ? record.displayIndex : i;
  }
  return out;
}

export function renderSettingsFromConfig(config) {
  return {
    blendK: config.blendK,
    softness: config.softness,
    lumaWeight: config.lumaWeight,
    chromaWeight: config.chromaWeight,
    hueWeight: config.hueWeight,
    maxDistanceEnabled: config.maxDistanceEnabled,
    maxDistance: config.maxDistance,
    blendAmount: config.blendAmount,
    shadowCutoff: config.shadowCutoff,
    highlightCutoff: config.highlightCutoff,
    ditherScale: config.ditherScale,
    ditherAngle: config.ditherAngle,
    ditherLumaAmount: config.ditherLumaAmount,
    pixelBlockSize: config.pixelBlockSize ?? 1,
    pixelBlockSampleMode: config.pixelBlockSampleMode ?? "center"
  };
}

export function createRenderSession({
  els,
  state,
  config,
  ensureLevelAdjustedSources,
  getPaletteRecords,
  paletteUniformEntries,
  renderPaletteLabs,
  preprocessPaletteEntries,
  renderSwatches,
  manualCycleModeEnabled,
  normalizedCycleOffset,
  getCanvasRenderSize,
  getViewRect,
  getViewSpan,
  buildProgram,
  vertexSource = "",
  blockSampleFragmentSource = "",
  postProcessFragmentSource = "",
  viewCompositeFragmentSource = "",
  updatePaletteRegionOverlay,
  updateCycleMaskOverlay = () => {},
  syncCycleMaskUi = () => {},
  updateDiagnostics,
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
  createTextureFn = createTexture,
  uploadCanvasTextureFn = uploadCanvasTexture,
  configureTextureFn = configureTexture,
  resizeDrawingBufferFn = resizeDrawingBuffer,
  clearFramebufferFn = clearFramebuffer,
  renderPalettePassFn = renderPalettePass,
  renderBlockSamplePassFn = renderBlockSamplePass,
  buildStaticProgramFn = buildStaticProgram,
  ensureOffscreenPaletteTargetFn = ensureOffscreenPaletteTarget,
  renderPostProcessPassesFn = renderPostProcessPasses,
  ensureViewCompositeProgramFn = ensureViewCompositeProgram,
  renderViewCompositeFn = renderViewComposite
}) {
  function markCompositeCachesDirty() {
    if (!state.postProcess) return;
    if (state.postProcess.offscreen) state.postProcess.offscreen.dirty = true;
    if (state.postProcess.pipeline) state.postProcess.pipeline.dirty = true;
  }

  function markTextureDirty() {
    state.textureDirty = true;
    markCompositeCachesDirty();
    if (state.diagnostics) {
      state.diagnostics.signature = "";
      state.diagnostics.pixel = null;
    }
    if (state.blockSample) state.blockSample.dirty = true;
  }

  function markPaletteDirty({swatches = true} = {}) {
    state.paletteDirty = true;
    markCompositeCachesDirty();
    if (state.diagnostics) state.diagnostics.signature = "";
    if (swatches) state.swatchesDirty = true;
  }

  function markMaskDirty() {
    const mask = state.mask || state.cycleMask;
    if (mask) mask.textureDirty = true;
    markCompositeCachesDirty();
    if (state.diagnostics) {
      state.diagnostics.signature = "";
      state.diagnostics.pixel = null;
    }
  }

  function markLevelsDirty() {
    state.sourceLevelsDirty = true;
    state.referenceLevelsDirty = true;
    markTextureDirty();
    markPaletteDirty();
  }

  function markEverythingDirty() {
    markLevelsDirty();
  }

  function ensureTexture() {
    ensureLevelAdjustedSources();
    const gl = state.gl;
    if (!state.texture) {
      state.texture = createTextureFn(gl);
      state.textureDirty = true;
    }
    if (!state.textureDirty) return;
    uploadCanvasTextureFn(gl, state.texture, state.sourceCanvas, {pixelPerfect: config.pixelPerfect});
    if (state.blockSample) state.blockSample.dirty = true;
    state.textureVersion = (Number(state.textureVersion) || 0) + 1;
    markCompositeCachesDirty();
    state.textureDirty = false;
  }

  function currentMask() {
    const mask = state.mask || state.cycleMask;
    if (mask && state.mask !== mask) state.mask = mask;
    if (mask && state.cycleMask !== mask) state.cycleMask = mask;
    return mask;
  }

  function maskApplies() {
    const mask = currentMask();
    if (!mask?.enabled || !mask.canvas?.width || !mask.canvas?.height) return false;
    return true;
  }

  function ensureMaskTexture(gl) {
    const mask = currentMask();
    if (!mask?.canvas?.width || !mask?.canvas?.height) return null;
    if (!mask.texture || mask.gl !== gl) {
      mask.texture = createTextureFn(gl);
      mask.gl = gl;
      mask.textureDirty = true;
    }
    if (mask.textureDirty) {
      uploadCanvasTextureFn(gl, mask.texture, mask.canvas, {pixelPerfect: true});
      mask.textureDirty = false;
    }
    return mask.texture;
  }

  function ensurePalette() {
    ensureLevelAdjustedSources();
    if (state.paletteDirty || !state.paletteBlock || !state.paletteFeatures) {
      state.paletteRecords = getPaletteRecords();
      state.palette = paletteLabs(state.paletteRecords);
      const uniformEntries = paletteUniformEntries(state.paletteRecords, renderPaletteLabs(state.paletteRecords));
      const {paletteBlock, paletteBaseBlock, paletteFeatures, paletteSourceIndices} = preprocessPaletteEntries(uniformEntries);
      state.paletteBlock = paletteBlock;
      state.paletteBaseBlock = paletteBaseBlock || paletteBlock;
      state.paletteFeatures = paletteFeatures;
      state.paletteSourceIndices = paletteSourceIndices || fallbackPaletteSourceIndices(uniformEntries);
      state.paletteEntryCount = uniformEntries.length;
      state.paletteVersion = (Number(state.paletteVersion) || 0) + 1;
      markCompositeCachesDirty();
      state.paletteDirty = false;
      state.swatchesDirty = true;
    }
    if (state.swatchesDirty) {
      renderSwatches();
      syncCycleMaskUi();
      state.swatchesDirty = false;
    }
  }

  function currentRenderSettings() {
    return renderSettingsFromConfig(config);
  }

  function ensureBlockSampleTexture(gl, sourceTexture, {sourceImageSize, settings, cache = state.blockSample} = {}) {
    if (!blockSamplePassNeeded(settings)) {
      return {texture: sourceTexture, blockSampledInput: false};
    }
    if (!blockSampleFragmentSource || !vertexSource) {
      throw new Error("Block sampling shader source is missing.");
    }

    const sourceWidth = Math.max(1, Math.round(Number(sourceImageSize?.[0]) || state.sourceCanvas.width || 1));
    const sourceHeight = Math.max(1, Math.round(Number(sourceImageSize?.[1]) || state.sourceCanvas.height || 1));
    const blockSize = Math.max(1, Math.round(Number(settings.pixelBlockSize) || 1));
    const sampleMode = settings.pixelBlockSampleMode || "center";
    const targetSize = blockSampleTextureSize(sourceWidth, sourceHeight, blockSize);
    const sampleCache = cache || {};

    if (!sampleCache.texture) sampleCache.texture = createTextureFn(gl);
    if (!sampleCache.framebuffer) sampleCache.framebuffer = gl.createFramebuffer();
    if (!sampleCache.program) {
      sampleCache.program = buildStaticProgramFn(gl, sampleCache, {
        vertexSource,
        fragmentSource: blockSampleFragmentSource,
        linkErrorMessage: "block sample shader failed"
      });
    }

    const dirty = sampleCache.dirty
      || sampleCache.width !== targetSize.width
      || sampleCache.height !== targetSize.height
      || sampleCache.blockSize !== blockSize
      || sampleCache.sampleMode !== sampleMode
      || sampleCache.sourceTexture !== sourceTexture;

    if (dirty) {
      renderBlockSamplePassFn(gl, sampleCache.program, {
        sourceTexture,
        targetTexture: sampleCache.texture,
        framebuffer: sampleCache.framebuffer,
        sourceSize: [sourceWidth, sourceHeight],
        targetSize,
        blockSize,
        sampleMode
      });
      sampleCache.width = targetSize.width;
      sampleCache.height = targetSize.height;
      sampleCache.blockSize = blockSize;
      sampleCache.sampleMode = sampleMode;
      sampleCache.sourceTexture = sourceTexture;
      sampleCache.dirty = false;
    }

    return {texture: sampleCache.texture, blockSampledInput: true};
  }

  function renderPaletteProgram(gl, program, options) {
    const settings = currentRenderSettings();
    const sourceImageSize = options.sourceImageSize ?? [state.sourceCanvas.width || 1, state.sourceCanvas.height || 1];
    const input = ensureBlockSampleTexture(gl, options.texture, {
      sourceImageSize,
      settings,
      cache: options.blockSampleCache ?? state.blockSample
    });

    const canUseStateMaskTexture = gl === state.gl;
    const optionHasMaskTexture = Object.prototype.hasOwnProperty.call(options, "maskTexture") || Object.prototype.hasOwnProperty.call(options, "cycleMaskTexture");
    const optionHasMaskEnabled = Object.prototype.hasOwnProperty.call(options, "maskEnabled") || Object.prototype.hasOwnProperty.call(options, "cycleMaskEnabled");
    const mask = currentMask() || {};
    const maskTexture = optionHasMaskTexture
      ? (options.maskTexture ?? options.cycleMaskTexture)
      : (canUseStateMaskTexture && maskApplies() ? ensureMaskTexture(gl) : null);
    const maskEnabled = optionHasMaskEnabled
      ? !!(options.maskEnabled ?? options.cycleMaskEnabled)
      : (canUseStateMaskTexture && maskApplies());
    const maskBehavior = options.maskBehavior ?? maskBehaviorCode(mask);
    const maskForbiddenFlags = options.maskForbiddenSourceFlags ?? maskForbiddenSourceFlags(mask);

    renderPalettePassFn(gl, program, {
      ...options,
      texture: input.texture,
      maskTexture,
      maskEnabled,
      maskBehavior,
      maskForbiddenSourceFlags: maskForbiddenFlags,
      sourceImageSize,
      blockSampledInput: input.blockSampledInput,
      paletteBlock: options.paletteBlock ?? state.paletteBlock,
      paletteFeatures: options.paletteFeatures ?? state.paletteFeatures,
      paletteBaseBlock: options.paletteBaseBlock ?? state.paletteBaseBlock ?? state.paletteBlock,
      paletteSourceIndices: options.paletteSourceIndices ?? state.paletteSourceIndices,
      paletteSize: options.paletteSize ?? (state.paletteEntryCount || state.palette.length),
      visiblePaletteSize: options.visiblePaletteSize ?? state.palette.length,
      cycleOffset: options.cycleOffset ?? (manualCycleModeEnabled() ? 0 : normalizedCycleOffset(config.cycleOffset, state.paletteRecords)),
      manualCycleEnabled: options.manualCycleEnabled ?? manualCycleModeEnabled(),
      diagnosticOverlayMode: options.diagnosticOverlayMode ?? (state.diagnostics?.overlay?.mode || "none"),
      diagnosticOverlaySwatch: options.diagnosticOverlaySwatch ?? state.diagnostics?.overlay?.swatchIndex ?? -1,
      settings
    });
  }

  function ensurePostProcessCaches() {
    if (!state.postProcess) {
      state.postProcess = {
        offscreen: {framebuffer: null, texture: null, width: 0, height: 0, dirty: true},
        pipeline: {
          textureA: {texture: null, width: 0, height: 0},
          textureB: {texture: null, width: 0, height: 0},
          framebuffer: null,
          despeckleProgram: {program: null},
          dirty: true
        },
        composite: {program: null, programKey: ""}
      };
    }
    return state.postProcess;
  }

  function compareCompositeActive(overlay = {}) {
    if (overlay && overlay.mode && overlay.mode !== "none") return false;
    return !!config.compareEnabled;
  }

  function drawWithCompositePass(gl, program, {canvas, viewRect, runPostProcess}) {
    if (!viewCompositeFragmentSource || !vertexSource || (runPostProcess && !postProcessFragmentSource)) {
      throw new Error("Composite shader source is missing.");
    }
    const caches = ensurePostProcessCaches();
    const sourceWidth = Math.max(1, Math.round(state.sourceCanvas.width || 1));
    const sourceHeight = Math.max(1, Math.round(state.sourceCanvas.height || 1));

    // Step 1: render the palette pass at source resolution with no view
    // transform and no overlay into the offscreen target. The compare split
    // is always handled later by the composite pass.
    const target = ensureOffscreenPaletteTargetFn(gl, caches.offscreen, sourceWidth, sourceHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    renderPaletteProgram(gl, program, {
      texture: state.texture,
      viewport: {x: 0, y: 0, w: target.width, h: target.height},
      resolution: [target.width, target.height],
      viewportOrigin: [0, 0],
      viewCenter: [0.5, 0.5],
      viewSpan: [1, 1],
      sourceImageSize: [sourceWidth, sourceHeight],
      diagnosticOverlayMode: "none",
      diagnosticOverlaySwatch: -1
    });

    // Step 2: optionally despeckle at source resolution.
    let processedTexture = target.texture;
    if (runPostProcess) {
      const settings = postProcessSettingsFromConfig(config);
      processedTexture = renderPostProcessPassesFn(gl, caches.pipeline, {
        inputTexture: target.texture,
        width: target.width,
        height: target.height,
        vertexSource,
        fragmentSource: postProcessFragmentSource,
        settings,
        pixelBlockSize: Math.max(1, Math.round(Number(config.pixelBlockSize) || 1))
      });
    }

    // Step 3: composite to the actual canvas with the view transform and,
    // when enabled, the before/after split overlay. Match the final display
    // texture's sampler to the requested preview interpolation mode.
    configureTextureFn(gl, processedTexture, {filter: config.pixelPerfect ? gl.NEAREST : gl.LINEAR});
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    clearFramebufferFn(gl, canvas.width, canvas.height);
    const compositeProgram = ensureViewCompositeProgramFn(gl, caches.composite, {
      vertexSource,
      fragmentSource: viewCompositeFragmentSource
    });
    const [viewSpanX, viewSpanY] = getViewSpan(viewRect.w, viewRect.h);
    renderViewCompositeFn(gl, compositeProgram, {
      processedTexture,
      sourceTexture: state.texture,
      viewport: viewRect,
      resolution: [viewRect.w, viewRect.h],
      viewportOrigin: [viewRect.x, viewRect.y],
      viewCenter: [state.view.centerX, state.view.centerY],
      viewSpan: [viewSpanX, viewSpanY],
      compareSplit: config.compareEnabled ? config.compareSplit : -1,
      compareEnabled: !!config.compareEnabled
    });
  }

  function draw() {
    if (!state.gl || !state.imageData) return;
    const gl = state.gl;
    const canvas = gl.canvas;
    const target = getCanvasRenderSize();
    resizeDrawingBufferFn(canvas, target.width, target.height);
    const viewRect = getViewRect(canvas.width, canvas.height);
    ensureTexture();
    ensurePalette();

    let program;
    try {
      program = buildProgram();
      els.error.hidden = true;
    } catch (err) {
      els.error.textContent = `Shader failed: ${err.message}`;
      els.error.hidden = false;
      throw err;
    }

    const overlay = state.diagnostics?.overlay || {mode: "none"};
    const runPostProcess = postProcessActive(config, overlay);
    const runCompositePass = runPostProcess || compareCompositeActive(overlay);
    if (runCompositePass) {
      try {
        drawWithCompositePass(gl, program, {canvas, viewRect, runPostProcess});
        if (state.postProcessFailureMessage) {
          state.postProcessFailureMessage = "";
          if (els.error) els.error.hidden = true;
        }
        return;
      } catch (err) {
        // Fall back to the direct path on composite failure so the preview
        // never blacks out due to an unsupported FBO state.
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        state.postProcessFailureMessage = err?.message || String(err);
        if (els.error) {
          els.error.textContent = `Composite pass disabled: ${state.postProcessFailureMessage}`;
          els.error.hidden = false;
        }
      }
    } else if (state.postProcessFailureMessage) {
      // User disabled the composite-only features after a failure — clear the stale warning.
      state.postProcessFailureMessage = "";
      if (els.error) els.error.hidden = true;
    }

    clearFramebufferFn(gl, canvas.width, canvas.height);
    const [viewSpanX, viewSpanY] = getViewSpan(viewRect.w, viewRect.h);
    renderPaletteProgram(gl, program, {
      texture: state.texture,
      viewport: viewRect,
      resolution: [viewRect.w, viewRect.h],
      viewportOrigin: [viewRect.x, viewRect.y],
      viewCenter: [state.view.centerX, state.view.centerY],
      viewSpan: [viewSpanX, viewSpanY],
      sourceImageSize: [state.sourceCanvas.width || 1, state.sourceCanvas.height || 1]
    });
  }

  function queueRender() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    const schedule = requestFrame || (callback => callback(0));
    schedule(() => {
      state.renderQueued = false;
      draw();
      updatePaletteRegionOverlay();
      updateCycleMaskOverlay();
      updateDiagnostics();
    });
  }

  return {
    markTextureDirty,
    markPaletteDirty,
    markMaskDirty,
    markLevelsDirty,
    markEverythingDirty,
    ensureTexture,
    ensurePalette,
    currentRenderSettings,
    renderPaletteProgram,
    draw,
    queueRender
  };
}
