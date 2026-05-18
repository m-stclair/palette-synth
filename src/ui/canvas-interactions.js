export function bindCanvasInteractions({
  canvas,
  state,
  viewport,
  compareSplit,
  paletteRegion,
  cycleMask,
  diagnosticsPanelIsOpen = () => false,
  pixelInspectorPanelIsOpen = diagnosticsPanelIsOpen,
  inspectDiagnosticPixel
}) {
  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    viewport.zoomBy(event.deltaY, event.clientX, event.clientY);
  }, {passive: false});

  canvas.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    if (state.paletteRegion.enabled && paletteRegion.beginPaletteRegionDrag(event)) return;
    if (cycleMask?.beginCycleMaskPaint?.(event)) return;

    state.view.pointerId = event.pointerId;
    state.view.lastClientX = event.clientX;
    state.view.lastClientY = event.clientY;
    state.view.clickStartX = event.clientX;
    state.view.clickStartY = event.clientY;
    state.view.movedForClick = false;
    canvas.setPointerCapture?.(event.pointerId);

    if (compareSplit.isNearCompareSplit(event.clientX, event.clientY)) {
      state.view.compareDragging = true;
      canvas.classList.add("is-splitting");
      compareSplit.setCompareSplit(compareSplit.pointerCompareSplit(event.clientX));
      return;
    }

    state.view.dragging = true;
    canvas.classList.add("is-panning");
  });

  canvas.addEventListener("pointermove", event => {
    if (state.view.pointerId === event.pointerId && Math.hypot(event.clientX - state.view.clickStartX, event.clientY - state.view.clickStartY) > 3) {
      state.view.movedForClick = true;
    }
    if (paletteRegion.updatePaletteRegionDrag(event)) return;
    if (cycleMask?.updateCycleMaskPaint?.(event)) return;

    if (state.view.compareDragging && event.pointerId === state.view.pointerId) {
      compareSplit.setCompareSplit(compareSplit.pointerCompareSplit(event.clientX));
      return;
    }

    if (!state.view.dragging || event.pointerId !== state.view.pointerId) {
      canvas.classList.toggle("is-near-split", compareSplit.isNearCompareSplit(event.clientX, event.clientY));
      return;
    }

    const dx = event.clientX - state.view.lastClientX;
    const dy = event.clientY - state.view.lastClientY;
    state.view.lastClientX = event.clientX;
    state.view.lastClientY = event.clientY;
    viewport.panByClientDelta(dx, dy);
  });

  canvas.addEventListener("pointerleave", () => {
    if (!state.view.dragging && !state.view.compareDragging) canvas.classList.remove("is-near-split");
  });

  const endPointerAction = event => {
    if (cycleMask?.finishCycleMaskPaint?.(event)) return;
    if (paletteRegion.finishPaletteRegionDrag(event)) return;
    if (event && state.view.pointerId !== null && event.pointerId !== state.view.pointerId) return;
    state.view.dragging = false;
    state.view.compareDragging = false;
    state.view.pointerId = null;
    canvas.classList.remove("is-panning", "is-splitting", "is-near-split");
  };

  const cancelPointerAction = event => {
    if (cycleMask?.cancelCycleMaskPaint?.(event)) return;
    if (state.paletteRegion.dragging) {
      paletteRegion.cancelPaletteRegionDrag({announce: false});
      return;
    }
    endPointerAction(event);
  };

  canvas.addEventListener("pointerup", endPointerAction);
  canvas.addEventListener("pointercancel", cancelPointerAction);
  canvas.addEventListener("lostpointercapture", cancelPointerAction);

  canvas.addEventListener("click", event => {
    if (state.paletteRegion.enabled || state.paletteRegion.dragging || ((state.mask || state.cycleMask)?.paintMode || "off") !== "off" || state.view.movedForClick) return;
    if (!pixelInspectorPanelIsOpen()) return;
    inspectDiagnosticPixel(event.clientX, event.clientY);
  });

  canvas.addEventListener("dblclick", event => {
    if (state.paletteRegion.enabled || ((state.mask || state.cycleMask)?.paintMode || "off") !== "off") {
      event.preventDefault();
      return;
    }
    viewport.resetView();
  });
}
