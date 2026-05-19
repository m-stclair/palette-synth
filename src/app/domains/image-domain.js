import { createImageController } from "../../runtime/image-controller.js";

export function createImageDomain({
  els,
  state,
  config,
  root,
  env = {},
  configActions,
  history,
  render,
  view,
  conditionalPanelsActions,
  setStatus
}) {
  const imageController = createImageController({
    state,
    config,
    els,
    root,
    Image: env.Image,
    URL: env.URL,
    cloneConfigSnapshot: configActions.cloneConfigSnapshot,
    pushHistorySnapshot: history.pushHistorySnapshot,
    ensureLevelAdjustedSources: render.ensureLevelAdjustedSources,
    resetPaletteRegion: view.resetPaletteRegion,
    resetMask: view.resetMask,
    resetView: view.resetView,
    markEverythingDirty: render.markEverythingDirty,
    markPaletteDirty: render.markPaletteDirty,
    updateConditionalPanels: conditionalPanelsActions.updateConditionalPanels,
    queueRender: render.queueRender,
    setStatus
  });

  return {
    controller: imageController,
    image: imageController,

    imageController,

    ...imageController
  };
}
