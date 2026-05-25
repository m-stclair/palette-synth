import { DEFAULT_CONFIG } from "../state/config.js";
import {
  applyLevelsToCanvas as applyLevelsWithRenderer,
  renderLevelsPreviewCanvas as renderLevelsPreviewCanvasWithRenderer
} from "../gl/levels-renderer.js";
import { createLazyCanvasImageData } from "./lazy-image-data.js";

export function createLevelSourceController({
  state,
  config,
  vertexSource = "",
  fragmentSource = "",
  clarityLightnessBlurFragmentSource = "",
  claritySharpFragmentSource = "",
  claritySharpBlurFragmentSource = "",
  clarityFragmentSource = "",
  defaults = DEFAULT_CONFIG,
  applyLevelsToCanvasFn = applyLevelsWithRenderer,
  renderLevelsPreviewCanvasFn = renderLevelsPreviewCanvasWithRenderer
} = {}) {
  if (!state || !config) {
    throw new TypeError("createLevelSourceController requires state and config dependencies");
  }

  function levelRenderOptions(originalCanvas, sourceVersion = 0) {
    return {
      shaders: {
        vertexSource,
        fragmentSource,
        clarityLightnessBlurFragmentSource,
        claritySharpFragmentSource,
        claritySharpBlurFragmentSource,
        clarityFragmentSource
      },
      originalCanvas,
      sourceVersion,
      settings: config,
      defaults
    };
  }

  function applyLevelsToCanvas(originalCanvas, targetCanvas, targetCtx, sourceVersion = 0) {
    return applyLevelsToCanvasFn(state.levels, {
      ...levelRenderOptions(originalCanvas, sourceVersion),
      targetCanvas,
      targetCtx
    });
  }

  function ensureLevelAdjustedPreviewSource() {
    if (!state.originalCanvas?.width || !state.originalCanvas?.height) return null;
    if (!state.previewLevelsDirty && state.previewSourceCanvas) return state.previewSourceCanvas;

    const previewCanvas = renderLevelsPreviewCanvasFn(
      state.levels,
      levelRenderOptions(state.originalCanvas, state.originalSourceVersion)
    );
    state.previewSourceCanvas = previewCanvas || state.originalCanvas;
    state.previewLevelsDirty = false;
    state.previewSourceVersion = (Number(state.previewSourceVersion) || 0) + 1;
    return state.previewSourceCanvas;
  }

  function ensureLevelAdjustedSources() {
    if (!state.sourceLevelsDirty || !state.originalCanvas.width || !state.sourceCtx) {
      return state.imageData;
    }

    const previewCanvas = ensureLevelAdjustedPreviewSource();
    if (!previewCanvas) return state.imageData;

    const width = state.originalCanvas.width;
    const height = state.originalCanvas.height;
    if (state.sourceCanvas.width !== width) state.sourceCanvas.width = width;
    if (state.sourceCanvas.height !== height) state.sourceCanvas.height = height;
    state.sourceCtx.clearRect(0, 0, width, height);
    state.sourceCtx.drawImage(previewCanvas, 0, 0, width, height);
    state.imageData = createLazyCanvasImageData(state.sourceCtx, width, height, {
      canvas: state.sourceCanvas,
      version: state.previewSourceVersion || state.originalSourceVersion
    });
    state.sourceLevelsDirty = false;
    return state.imageData;
  }

  return {
    applyLevelsToCanvas,
    ensureLevelAdjustedPreviewSource,
    ensureLevelAdjustedSources
  };
}
