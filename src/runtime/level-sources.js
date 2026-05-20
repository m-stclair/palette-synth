import { DEFAULT_CONFIG } from "../state/config.js";
import { applyLevelsToCanvas as applyLevelsWithRenderer } from "../gl/levels-renderer.js";

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
  applyLevelsToCanvasFn = applyLevelsWithRenderer
} = {}) {
  if (!state || !config) {
    throw new TypeError("createLevelSourceController requires state and config dependencies");
  }

  function applyLevelsToCanvas(originalCanvas, targetCanvas, targetCtx, sourceVersion = 0) {
    return applyLevelsToCanvasFn(state.levels, {
      shaders: {
        vertexSource,
        fragmentSource,
        clarityLightnessBlurFragmentSource,
        claritySharpFragmentSource,
        claritySharpBlurFragmentSource,
        clarityFragmentSource
      },
      originalCanvas,
      targetCanvas,
      targetCtx,
      sourceVersion,
      settings: config,
      defaults
    });
  }

  function ensureLevelAdjustedSources() {
    if (state.sourceLevelsDirty && state.originalCanvas.width && state.sourceCtx) {
      state.imageData = applyLevelsToCanvas(
        state.originalCanvas,
        state.sourceCanvas,
        state.sourceCtx,
        state.originalSourceVersion
      );
      state.sourceLevelsDirty = false;
      state.textureDirty = true;
    }
    if (state.referenceLevelsDirty && state.referenceOriginalCanvas.width && state.referenceCtx) {
      state.referenceImageData = applyLevelsToCanvas(
        state.referenceOriginalCanvas,
        state.referenceCanvas,
        state.referenceCtx,
        state.referenceOriginalSourceVersion
      );
      state.referenceLevelsDirty = false;
    }
  }

  return {
    applyLevelsToCanvas,
    ensureLevelAdjustedSources
  };
}
