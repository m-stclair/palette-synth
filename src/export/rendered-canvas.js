import { MAX_PALETTE_SIZE } from "../constants.js";
import { maskBehaviorCode, maskForbiddenSourceFlags } from "../ui/cycle-mask.js";
import { paletteLabs } from "../color-utils.js";
import { createWebgl2Context, clearFramebuffer } from "../gl/context.js";
import { disposeCachedProgram } from "../gl/programs.js";
import { configureTexture, createTexture, uploadCanvasTexture } from "../gl/textures.js";
import { disposeBlockSampleCache } from "../gl/block-sampler.js";
import {
  postProcessActive,
  postProcessSettingsFromConfig,
  renderPostProcessPasses,
  disposePostProcessCache
} from "../gl/post-process-renderer.js";
import {
  ensureOffscreenPaletteTarget,
  disposeOffscreenPaletteTarget
} from "../gl/offscreen-palette-target.js";
import {
  ensureViewCompositeProgram,
  renderViewComposite,
  disposeViewCompositeCache
} from "../gl/view-composite-renderer.js";

export function paletteUniformDataForOffset(records, offset, {
  fallbackPaletteRecords = () => [],
  manualCycleModeEnabled = () => false,
  applyManualCycle = (_records, _offset) => [],
  paletteUniformEntries,
  preprocessPaletteEntries
} = {}) {
  const safeRecords = Array.isArray(records) && records.length ? records : fallbackPaletteRecords();
  const basePalette = paletteLabs(safeRecords);
  const renderPalette = manualCycleModeEnabled()
    ? applyManualCycle(safeRecords, offset)
    : basePalette;
  const uniformEntries = paletteUniformEntries(safeRecords, renderPalette);
  const {paletteBlock, paletteBaseBlock, paletteFeatures, paletteSourceIndices} = preprocessPaletteEntries(uniformEntries);
  return {
    paletteBlock,
    paletteBaseBlock: paletteBaseBlock || paletteBlock,
    paletteFeatures,
    paletteSourceIndices,
    paletteSize: uniformEntries.length,
    visiblePaletteSize: Math.min(basePalette.length, MAX_PALETTE_SIZE)
  };
}

export function createRenderedCanvasController({
  state,
  config,
  document,
  ensurePalette = () => {},
  ensureLevelAdjustedPreviewSource = () => state.previewSourceCanvas || state.sourceCanvas,
  getPaletteRecords,
  fallbackPaletteRecords,
  paletteUniformEntries,
  preprocessPaletteEntries,
  manualCycleModeEnabled = () => false,
  applyManualCycle,
  normalizedCycleOffset = offset => Number(offset) || 0,
  buildProgramForContext,
  renderPaletteProgram,
  vertexSource = "",
  postProcessFragmentSource = "",
  viewCompositeFragmentSource = "",
  createWebgl2ContextFn = createWebgl2Context,
  createTextureFn = createTexture,
  uploadCanvasTextureFn = uploadCanvasTexture,
  configureTextureFn = configureTexture,
  clearFramebufferFn = clearFramebuffer,
  disposeCachedProgramFn = disposeCachedProgram,
  ensureOffscreenPaletteTargetFn = ensureOffscreenPaletteTarget,
  renderPostProcessPassesFn = renderPostProcessPasses,
  ensureViewCompositeProgramFn = ensureViewCompositeProgram,
  renderViewCompositeFn = renderViewComposite,
  disposeOffscreenPaletteTargetFn = disposeOffscreenPaletteTarget,
  disposePostProcessCacheFn = disposePostProcessCache,
  disposeViewCompositeCacheFn = disposeViewCompositeCache
} = {}) {
  if (!state || !config || !document) {
    throw new TypeError("createRenderedCanvasController requires state, config, and document dependencies");
  }

  function paletteUniformData(records, offset) {
    return paletteUniformDataForOffset(records, offset, {
      fallbackPaletteRecords,
      manualCycleModeEnabled,
      applyManualCycle,
      paletteUniformEntries,
      preprocessPaletteEntries
    });
  }

  function renderProcessedCanvas({
    width = state.sourceCanvas.width,
    height = state.sourceCanvas.height,
    records = state.paletteRecords,
    cycleOffset = config.cycleOffset,
    showPalette = "none",
    compareSplit = -1,
    viewCenter = [0.5, 0.5],
    viewSpan = [1, 1],
    viewportOrigin = [0, 0],
    readPixels = false
  } = {}) {
    const sourceCanvas = ensureLevelAdjustedPreviewSource() || state.previewSourceCanvas || state.sourceCanvas;
    if (!state.imageData || !sourceCanvas?.width || !sourceCanvas?.height) return null;
    const safeRecords = Array.isArray(records) && records.length ? records : getPaletteRecords();
    const sourceWidth = sourceCanvas.width || state.sourceCanvas.width || 1;
    const sourceHeight = sourceCanvas.height || state.sourceCanvas.height || 1;
    const safeWidth = Math.max(1, Math.round(Number(width) || sourceWidth || 1));
    const safeHeight = Math.max(1, Math.round(Number(height) || sourceHeight || 1));
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = safeWidth;
    exportCanvas.height = safeHeight;
    const gl = createWebgl2ContextFn(exportCanvas, "WebGL2 is required for export rendering.");

    const texture = createTextureFn(gl);
    uploadCanvasTextureFn(gl, texture, sourceCanvas, {pixelPerfect: config.pixelPerfect});
    const mask = state.mask || {};
    const maskEnabled = !!(mask.enabled && mask.canvas?.width && mask.canvas?.height);
    const maskTexture = maskEnabled ? createTextureFn(gl) : null;
    const maskBehavior = maskBehaviorCode(mask);
    const maskForbiddenFlags = maskForbiddenSourceFlags(mask);
    if (maskTexture) uploadCanvasTextureFn(gl, maskTexture, mask.canvas, {pixelPerfect: true});
    clearFramebufferFn(gl, safeWidth, safeHeight);

    const cache = {program: null, programKey: ""};
    const blockSampleCache = {texture: null, framebuffer: null, program: null, programKey: "", dirty: true};
    const program = buildProgramForContext(gl, cache, {showPalette});
    const paletteData = paletteUniformData(safeRecords, cycleOffset);
    const manualCycleEnabled = manualCycleModeEnabled();
    const resolvedCycleOffset = manualCycleEnabled ? 0 : normalizedCycleOffset(cycleOffset, safeRecords);

    const exportPostProcess = postProcessActive(config, {mode: "none"});
    const exportCompareSplit = Number.isFinite(Number(compareSplit)) && Number(compareSplit) >= 0;
    const exportComposite = (exportPostProcess || exportCompareSplit)
      && viewCompositeFragmentSource
      && vertexSource
      && (!exportPostProcess || postProcessFragmentSource);

    let offscreenCache = null;
    let postProcessCache = null;
    let viewCompositeCache = null;
    let renderedImageData = null;

    try {
      if (exportComposite) {
        offscreenCache = {framebuffer: null, texture: null, width: 0, height: 0};
        postProcessCache = {
          textureA: {texture: null, width: 0, height: 0},
          textureB: {texture: null, width: 0, height: 0},
          framebuffer: null,
          despeckleProgram: {program: null}
        };
        viewCompositeCache = {program: null, programKey: ""};

        // Pass 1: palette render into source-resolution FBO. Compare split
        // is always handled by the final composite pass.
        const target = ensureOffscreenPaletteTargetFn(gl, offscreenCache, safeWidth, safeHeight);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        renderPaletteProgram(gl, program, {
          texture,
          maskTexture,
          maskEnabled,
          maskBehavior,
          maskForbiddenSourceFlags: maskForbiddenFlags,
          viewport: {x: 0, y: 0, w: target.width, h: target.height},
          resolution: [target.width, target.height],
          viewportOrigin: [0, 0],
          viewCenter: [0.5, 0.5],
          viewSpan: [1, 1],
          sourceImageSize: [sourceWidth, sourceHeight],
          blockSampleCache,
          paletteBlock: paletteData.paletteBlock,
          paletteFeatures: paletteData.paletteFeatures,
          paletteBaseBlock: paletteData.paletteBaseBlock,
          paletteSourceIndices: paletteData.paletteSourceIndices,
          paletteSize: paletteData.paletteSize,
          visiblePaletteSize: paletteData.visiblePaletteSize,
          cycleOffset: resolvedCycleOffset,
          manualCycleEnabled,
          diagnosticOverlayMode: "none",
          diagnosticOverlaySwatch: -1
        });

        // Pass 2: optional despeckle at source resolution.
        let processedTexture = target.texture;
        if (exportPostProcess) {
          const settings = postProcessSettingsFromConfig(config);
          processedTexture = renderPostProcessPassesFn(gl, postProcessCache, {
            inputTexture: target.texture,
            width: target.width,
            height: target.height,
            vertexSource,
            fragmentSource: postProcessFragmentSource,
            settings,
            pixelBlockSize: Math.max(1, Math.round(Number(config.pixelBlockSize) || 1))
          });
        }

        // Pass 3: composite to the default framebuffer (=canvas), including
        // before/after split overlay when requested. Match the final display
        // texture's sampler to the requested preview interpolation mode.
        configureTextureFn(gl, processedTexture, {filter: config.pixelPerfect ? gl.NEAREST : gl.LINEAR});
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        clearFramebufferFn(gl, safeWidth, safeHeight);
        const compositeProgram = ensureViewCompositeProgramFn(gl, viewCompositeCache, {
          vertexSource,
          fragmentSource: viewCompositeFragmentSource
        });
        renderViewCompositeFn(gl, compositeProgram, {
          processedTexture,
          sourceTexture: texture,
          viewport: {x: 0, y: 0, w: safeWidth, h: safeHeight},
          resolution: [safeWidth, safeHeight],
          viewportOrigin: [0, 0],
          viewCenter,
          viewSpan,
          compareSplit: exportCompareSplit ? Number(compareSplit) : -1,
          compareEnabled: exportCompareSplit
        });
      } else {
        renderPaletteProgram(gl, program, {
          texture,
          maskTexture,
          maskEnabled,
          maskBehavior,
          maskForbiddenSourceFlags: maskForbiddenFlags,
          viewport: {x: 0, y: 0, w: safeWidth, h: safeHeight},
          resolution: [safeWidth, safeHeight],
          viewportOrigin,
          viewCenter,
          viewSpan,
          sourceImageSize: [sourceWidth, sourceHeight],
          blockSampleCache,
          paletteBlock: paletteData.paletteBlock,
          paletteFeatures: paletteData.paletteFeatures,
          paletteBaseBlock: paletteData.paletteBaseBlock,
          paletteSourceIndices: paletteData.paletteSourceIndices,
          paletteSize: paletteData.paletteSize,
          visiblePaletteSize: paletteData.visiblePaletteSize,
          cycleOffset: resolvedCycleOffset,
          manualCycleEnabled,
          diagnosticOverlayMode: "none",
          diagnosticOverlaySwatch: -1
        });
      }

      gl.finish();
      if (readPixels) {
        const raw = new Uint8Array(safeWidth * safeHeight * 4);
        gl.readPixels(0, 0, safeWidth, safeHeight, gl.RGBA, gl.UNSIGNED_BYTE, raw);
        const flipped = new Uint8ClampedArray(raw.length);
        const rowStride = safeWidth * 4;
        for (let y = 0; y < safeHeight; y++) {
          const sourceOffset = (safeHeight - 1 - y) * rowStride;
          const targetOffset = y * rowStride;
          flipped.set(raw.subarray(sourceOffset, sourceOffset + rowStride), targetOffset);
        }
        renderedImageData = {width: safeWidth, height: safeHeight, data: flipped};
      }
    } finally {
      gl.deleteTexture(texture);
      if (maskTexture) gl.deleteTexture(maskTexture);
      disposeBlockSampleCache(gl, blockSampleCache);
      disposeCachedProgramFn(gl, cache);
      if (offscreenCache) disposeOffscreenPaletteTargetFn(gl, offscreenCache);
      if (postProcessCache) disposePostProcessCacheFn(gl, postProcessCache);
      if (viewCompositeCache) disposeViewCompositeCacheFn(gl, viewCompositeCache);
    }
    return readPixels ? renderedImageData : exportCanvas;
  }

  function renderFullImageCanvas({cycleOffset = config.cycleOffset, records = state.paletteRecords} = {}) {
    ensurePalette();
    return renderProcessedCanvas({
      width: state.sourceCanvas.width,
      height: state.sourceCanvas.height,
      records,
      cycleOffset,
      showPalette: "none",
      compareSplit: -1,
      viewCenter: [0.5, 0.5],
      viewSpan: [1, 1],
      viewportOrigin: [0, 0]
    });
  }

  function renderFullImageData({cycleOffset = config.cycleOffset, records = state.paletteRecords} = {}) {
    ensurePalette();
    return renderProcessedCanvas({
      width: state.sourceCanvas.width,
      height: state.sourceCanvas.height,
      records,
      cycleOffset,
      showPalette: "none",
      compareSplit: -1,
      viewCenter: [0.5, 0.5],
      viewSpan: [1, 1],
      viewportOrigin: [0, 0],
      readPixels: true
    });
  }

  return {
    paletteUniformDataForOffset: paletteUniformData,
    renderProcessedCanvas,
    renderFullImageCanvas,
    renderFullImageData
  };
}
