import { DEFAULT_CONFIG } from "../../state/config.js";
import { createLevelSourceController } from "../../runtime/level-sources.js";
import { createRenderSession } from "../../runtime/render-session.js";
import { createShaderProgramController } from "../../runtime/shader-programs.js";

export function createRenderDomain({
  els,
  state,
  config,
  shaders = {},
  palette,
  view,
  diagnostics = {},
  env = {}
}) {
  const shaderProgramController = createShaderProgramController({
    config,
    state,
    vertexSource: shaders.VERTEX_SHADER,
    fragmentSource: shaders.FRAGMENT_SHADER_BODY,
    manualCycleModeEnabled: palette.manualCycleModeEnabled
  });

  const levelSourceController = createLevelSourceController({
    state,
    config,
    vertexSource: shaders.VERTEX_SHADER,
    fragmentSource: shaders.LEVELS_FRAGMENT_SHADER,
    clarityLightnessBlurFragmentSource: shaders.CLARITY_LIGHTNESS_BLUR_FRAGMENT_SHADER,
    claritySharpFragmentSource: shaders.CLARITY_SHARP_FRAGMENT_SHADER,
    claritySharpBlurFragmentSource: shaders.CLARITY_SHARP_BLUR_FRAGMENT_SHADER,
    clarityFragmentSource: shaders.CLARITY_FRAGMENT_SHADER,
    defaults: DEFAULT_CONFIG
  });

  const renderSessionController = createRenderSession({
    els,
    state,
    config,
    ensureLevelAdjustedSources: levelSourceController.ensureLevelAdjustedSources,
    ensureLevelAdjustedPreviewSource: levelSourceController.ensureLevelAdjustedPreviewSource,
    getPaletteRecords: palette.getPaletteRecords,
    paletteUniformEntries: palette.paletteUniformEntries,
    renderPaletteLabs: palette.renderPaletteLabs,
    preprocessPaletteEntries: palette.preprocessPaletteEntries,
    renderSwatches: palette.renderSwatches,
    manualCycleModeEnabled: palette.manualCycleModeEnabled,
    normalizedCycleOffset: palette.normalizedCycleOffset,
    getCanvasRenderSize: view.getCanvasRenderSize,
    getViewRect: view.getViewRect,
    getViewSpan: view.getViewSpan,
    clampViewCenter: view.clampViewCenter,
    buildProgram: shaderProgramController.buildProgram,
    vertexSource: shaders.VERTEX_SHADER,
    blockSampleFragmentSource: shaders.BLOCK_SAMPLE_FRAGMENT_SHADER,
    postProcessFragmentSource: shaders.PALETTE_POST_FRAGMENT_SHADER,
    viewCompositeFragmentSource: shaders.VIEW_COMPOSITE_FRAGMENT_SHADER,
    updatePaletteRegionOverlay: view.updatePaletteRegionOverlay,
    updateMaskOverlay: view.updateMaskOverlay,
    syncMaskUi: view.syncMaskUi,
    updateDiagnostics: diagnostics.updateDiagnostics,
    requestFrame: env.requestFrame
  });

  return {
    shaderPrograms: shaderProgramController,
    levels: levelSourceController,
    session: renderSessionController,

    shaderProgramController,
    levelSourceController,
    renderSessionController,

    ...shaderProgramController,
    ...levelSourceController,
    ...renderSessionController
  };
}
