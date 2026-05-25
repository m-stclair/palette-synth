import { createCompareSplitController } from "../../ui/compare-split.js";
import { createPaletteRegionController } from "../../ui/palette-region.js";
import { createMaskController } from "../../ui/cycle-mask.js";
import { createViewportController } from "../../ui/viewport.js";

export function createViewDomain({
  els,
  state,
  config,
  render,
  configActions,
  history,
  conditionalPanelsActions,
  setStatus
}) {
  const viewportController = createViewportController({
    els,
    state,
    queueRender: render.queueRender
  });
  const {
    getCanvasRenderSize,
    getViewRect,
    getDisplayViewRect,
    getViewSpan,
    clampViewCenter,
    invalidateCanvasRenderSize,
    updateViewStatus,
    resetView,
    zoomBy,
    clientPointToImagePixel
  } = viewportController;

  const compareSplitController = createCompareSplitController({
    els,
    config,
    getDisplayViewRect,
    queueRender: render.queueRender
  });
  const {
    setCompareSplit,
    setCompareEnabled,
    syncCompareControls
  } = compareSplitController;

  const paletteRegionController = createPaletteRegionController({
    els,
    state,
    config,
    getCanvasRenderSize,
    getViewRect,
    getDisplayViewRect,
    getViewSpan,
    clientPointToImagePixel,
    cloneConfigSnapshot: configActions.cloneConfigSnapshot,
    pushHistorySnapshot: history.pushHistorySnapshot,
    markPaletteDirty: render.markPaletteDirty,
    updateConditionalPanels: conditionalPanelsActions.updateConditionalPanels,
    queueRender: render.queueRender,
    setStatus
  });
  const {
    updatePaletteRegionUi,
    updatePaletteRegionOverlay,
    resetPaletteRegion,
    togglePaletteRegionSelection
  } = paletteRegionController;

  const maskController = createMaskController({
    els,
    state,
    getCanvasRenderSize,
    getViewRect,
    getDisplayViewRect,
    getViewSpan,
    clientPointToImagePixel,
    markMaskDirty: render.markMaskDirty,
    queueRender: render.queueRender,
    setStatus
  });
  const {
    bindMaskControls,
    resetMask,
    syncMaskUi,
    updateMaskOverlay
  } = maskController;

  return {
    viewportController,
    compareSplitController,
    paletteRegionController,
    maskController,

    viewport: viewportController,
    compare: compareSplitController,
    paletteRegion: paletteRegionController,
    mask: maskController,

    getCanvasRenderSize,
    getViewRect,
    getDisplayViewRect,
    getViewSpan,
    clampViewCenter,
    invalidateCanvasRenderSize,
    updateViewStatus,
    resetView,
    zoomBy,
    clientPointToImagePixel,

    setCompareSplit,
    setCompareEnabled,
    syncCompareControls,

    updatePaletteRegionUi,
    updatePaletteRegionOverlay,
    resetPaletteRegion,
    togglePaletteRegionSelection,

    bindMaskControls,
    resetMask,
    syncMaskUi,
    updateMaskOverlay
  };
}
