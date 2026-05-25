import {
  clamp,
  positiveMod,
  gcdInt
} from "../../color-utils.js";
import { createRenderedCanvasController } from "../../export/rendered-canvas.js";
import { createAnimationExportController } from "../../export/animation-controller.js";
import { createExportActions } from "../../export/export-actions.js";

export function createExportDomain({
  els,
  state,
  config,
  root,
  shaders = {},
  palette,
  render,
  setStatus
}) {
  const renderedCanvasController = createRenderedCanvasController({
    state,
    config,
    document: root,
    ensurePalette: render.ensurePalette,
    ensureLevelAdjustedPreviewSource: render.ensureLevelAdjustedPreviewSource,
    getPaletteRecords: palette.getPaletteRecords,
    fallbackPaletteRecords: palette.fallbackPaletteRecords,
    paletteUniformEntries: palette.paletteUniformEntries,
    preprocessPaletteEntries: palette.preprocessPaletteEntries,
    manualCycleModeEnabled: palette.manualCycleModeEnabled,
    applyManualCycle: palette.applyManualCycle,
    normalizedCycleOffset: palette.normalizedCycleOffset,
    buildProgramForContext: render.buildProgramForContext,
    renderPaletteProgram: render.renderPaletteProgram,
    vertexSource: shaders.VERTEX_SHADER,
    postProcessFragmentSource: shaders.PALETTE_POST_FRAGMENT_SHADER,
    viewCompositeFragmentSource: shaders.VIEW_COMPOSITE_FRAGMENT_SHADER
  });

  const animationExportController = createAnimationExportController({
    els,
    state,
    config,
    clamp,
    cyclePeriod: palette.cyclePeriod,
    gcdInt,
    positiveMod,
    normalizedCycleOffset: palette.normalizedCycleOffset,
    manualCycleModeEnabled: palette.manualCycleModeEnabled,
    getPaletteRecords: palette.getPaletteRecords,
    ensurePalette: render.ensurePalette,
    renderFullImageCanvas: renderedCanvasController.renderFullImageCanvas,
    setStatus
  });

  const exportActions = createExportActions({
    els,
    state,
    root,
    draw: render.draw,
    renderFullImageCanvas: renderedCanvasController.renderFullImageCanvas,
    ensurePalette: render.ensurePalette,
    getPaletteRecords: palette.getPaletteRecords
  });

  return {
    renderedCanvas: renderedCanvasController,
    animation: animationExportController,
    actions: exportActions,

    renderedCanvasController,
    animationExportController,
    exportActions,

    ...renderedCanvasController,
    ...animationExportController,
    ...exportActions
  };
}
