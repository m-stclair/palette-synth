import { createHistoryController } from "../../state/history.js";

function maskPaintIsActive(state) {
  return (state.mask?.paintMode || "off") !== "off" || !!state.mask?.dragging;
}

function paletteRegionIsActive(state) {
  return !!(state.paletteRegion?.enabled || state.paletteRegion?.dragging);
}

export function createHistoryDomain({
  els,
  state,
  getSnapshot,
  applySnapshot,
  setStatus,
  maskActions = {},
  paletteRegionActions = {}
}) {
  const controller = createHistoryController({
    els,
    state,
    getSnapshot,
    applySnapshot,
    setStatus,
    shouldCancelShortcut: () => paletteRegionIsActive(state) || maskPaintIsActive(state),
    cancelShortcut: () => {
      if (maskPaintIsActive(state)) {
        state.mask.paintMode = "off";
        state.mask.dragging = false;
        maskActions.optionalSyncMaskUi?.();
        maskActions.optionalUpdateMaskOverlay?.();
        setStatus("Mask painting off.");
        return;
      }
      paletteRegionActions.cancelPaletteRegionDrag?.();
    }
  });

  return {
    controller,
    ...controller
  };
}
