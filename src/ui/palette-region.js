import { normalizeSampleRegion } from "../palette/sampling.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function resetRegionInteraction(regionState) {
  regionState.enabled = false;
  regionState.dragging = false;
  regionState.pointerId = null;
  regionState.start = null;
  regionState.draftRect = null;
}

export function makeImageRegionRect(a, b, imageData) {
  if (!a || !b || !imageData) return null;
  const x0 = clamp(Math.min(a.x, b.x), 0, imageData.width);
  const y0 = clamp(Math.min(a.y, b.y), 0, imageData.height);
  const x1 = clamp(Math.max(a.x, b.x), 0, imageData.width);
  const y1 = clamp(Math.max(a.y, b.y), 0, imageData.height);
  const x = Math.floor(x0);
  const y = Math.floor(y0);
  const width = Math.max(1, Math.ceil(x1) - x);
  const height = Math.max(1, Math.ceil(y1) - y);
  return normalizeSampleRegion({x, y, width, height}, imageData.width, imageData.height);
}

export function overlayRectForImageRegion({
  region,
  imageWidth,
  imageHeight,
  displayRect,
  shellRect,
  centerX,
  centerY,
  spanX,
  spanY
}) {
  if (!region) return null;
  const imageW = Math.max(1, imageWidth);
  const imageH = Math.max(1, imageHeight);
  const safeSpanX = Math.max(spanX, Number.EPSILON);
  const safeSpanY = Math.max(spanY, Number.EPSILON);

  const ux0 = region.x / imageW;
  const uy0 = region.y / imageH;
  const ux1 = (region.x + region.width) / imageW;
  const uy1 = (region.y + region.height) / imageH;
  const sx0 = (ux0 - centerX) / safeSpanX + 0.5;
  const sy0 = (uy0 - centerY) / safeSpanY + 0.5;
  const sx1 = (ux1 - centerX) / safeSpanX + 0.5;
  const sy1 = (uy1 - centerY) / safeSpanY + 0.5;

  const leftFrac = clamp(Math.min(sx0, sx1), 0, 1);
  const rightFrac = clamp(Math.max(sx0, sx1), 0, 1);
  const topFrac = clamp(Math.min(sy0, sy1), 0, 1);
  const bottomFrac = clamp(Math.max(sy0, sy1), 0, 1);
  const overlayWidth = (rightFrac - leftFrac) * displayRect.width;
  const overlayHeight = (bottomFrac - topFrac) * displayRect.height;
  if (overlayWidth <= 0.5 || overlayHeight <= 0.5) return null;
  return {
    left: displayRect.left - shellRect.left + leftFrac * displayRect.width,
    top: displayRect.top - shellRect.top + topFrac * displayRect.height,
    width: overlayWidth,
    height: overlayHeight
  };
}

export function createPaletteRegionController({
  els,
  state,
  config,
  getCanvasRenderSize,
  getViewRect,
  getDisplayViewRect,
  getViewSpan,
  clientPointToImagePixel,
  cloneConfigSnapshot,
  pushHistorySnapshot,
  markPaletteDirty,
  updateConditionalPanels,
  queueRender,
  setStatus
}) {
  function imageRegionToOverlayRect(region) {
    if (!region || !state.imageData || !els.regionOverlay) return null;
    const viewRect = getDisplayViewRect();
    const shell = els.regionOverlay.parentElement;
    if (!shell?.getBoundingClientRect) return null;
    const shellRect = shell.getBoundingClientRect();
    const {width, height} = state.gl ? {width: state.gl.canvas.width || 1, height: state.gl.canvas.height || 1} : getCanvasRenderSize();
    const vr = getViewRect(width, height);
    const [spanX, spanY] = getViewSpan(vr.w, vr.h);

    return overlayRectForImageRegion({
      region,
      imageWidth: state.imageData.width,
      imageHeight: state.imageData.height,
      displayRect: viewRect,
      shellRect,
      centerX: state.view.centerX,
      centerY: state.view.centerY,
      spanX,
      spanY
    });
  }

  function updatePaletteRegionUi() {
    const region = state.paletteRegion;
    const hasRegion = !!config.paletteRegionRect;
    if (els.selectPaletteRegion) {
      els.selectPaletteRegion.textContent = region.enabled ? "Drag on preview…" : "Select region";
      els.selectPaletteRegion.setAttribute("aria-pressed", String(!!region.enabled));
    }
    if (els.clearPaletteRegion) els.clearPaletteRegion.disabled = !hasRegion;
    if (els.paletteRegionNote) {
      if (!state.imageData) {
        els.paletteRegionNote.textContent = "Open an image first.";
      } else if (region.enabled) {
        els.paletteRegionNote.textContent = "Drag preview; Esc cancels.";
      } else if (hasRegion) {
        const r = normalizeSampleRegion(config.paletteRegionRect, state.imageData.width, state.imageData.height);
        const boxNote = config.showPaletteRegion ? "box shown" : "box hidden";
        els.paletteRegionNote.textContent = config.paletteMode === "generatedReference"
          ? `Region saved ${r.width}×${r.height} · reference uses full image · ${boxNote}`
          : `Region ${r.width}×${r.height} @ ${r.x},${r.y} · ${boxNote}`;
      } else {
        els.paletteRegionNote.textContent = "Full image";
      }
    }
    if (els.canvas) els.canvas.classList.toggle("is-selecting-region", config.paletteMode === "generated" && !!region.enabled);
  }

  function updatePaletteRegionOverlay() {
    const overlay = els.regionOverlay;
    if (!overlay) return;
    const regionVisibleForMode = config.paletteMode === "generated";
    const showSavedRegion = regionVisibleForMode && (!!config.showPaletteRegion || !!state.paletteRegion.enabled);
    const region = regionVisibleForMode ? (state.paletteRegion.draftRect || (showSavedRegion ? config.paletteRegionRect : null)) : null;
    const overlayRect = region ? imageRegionToOverlayRect(region) : null;
    if (!overlayRect) {
      overlay.hidden = true;
      return;
    }
    overlay.hidden = false;
    overlay.style.left = `${overlayRect.left}px`;
    overlay.style.top = `${overlayRect.top}px`;
    overlay.style.width = `${overlayRect.width}px`;
    overlay.style.height = `${overlayRect.height}px`;
  }

  function resetPaletteRegion({announce = false, dirty = true} = {}) {
    resetRegionInteraction(state.paletteRegion);
    config.paletteRegionRect = null;
    if (dirty) markPaletteDirty();
    updatePaletteRegionUi();
    updatePaletteRegionOverlay();
    if (announce) setStatus("Using the full image for generated palettes.");
    if (dirty) queueRender();
  }

  function togglePaletteRegionSelection() {
    if (!state.imageData) {
      setStatus("Open an image before selecting a palette region.");
      return;
    }
    state.paletteRegion.enabled = !state.paletteRegion.enabled;
    state.paletteRegion.dragging = false;
    state.paletteRegion.pointerId = null;
    state.paletteRegion.start = null;
    state.paletteRegion.draftRect = null;
    updatePaletteRegionUi();
    updatePaletteRegionOverlay();
    setStatus(state.paletteRegion.enabled ? "Drag a rectangle on the preview to sample a palette region." : "Palette region selection canceled.");
  }

  function beginPaletteRegionDrag(event) {
    const start = clientPointToImagePixel(event.clientX, event.clientY);
    if (!start) return false;
    state.paletteRegion.dragging = true;
    state.paletteRegion.pointerId = event.pointerId;
    state.paletteRegion.start = start;
    state.paletteRegion.draftRect = makeImageRegionRect(start, start, state.imageData);
    els.canvas.setPointerCapture?.(event.pointerId);
    updatePaletteRegionOverlay();
    event.preventDefault();
    return true;
  }

  function updatePaletteRegionDrag(event) {
    if (!state.paletteRegion.dragging || event.pointerId !== state.paletteRegion.pointerId) return false;
    const point = clientPointToImagePixel(event.clientX, event.clientY);
    if (!point) return true;
    state.paletteRegion.draftRect = makeImageRegionRect(state.paletteRegion.start, point, state.imageData);
    updatePaletteRegionOverlay();
    event.preventDefault();
    return true;
  }

  function finishPaletteRegionDrag(event) {
    if (!state.paletteRegion.dragging || (event && event.pointerId !== state.paletteRegion.pointerId)) return false;
    const region = state.paletteRegion.draftRect ? normalizeSampleRegion(state.paletteRegion.draftRect, state.imageData.width, state.imageData.height) : null;
    state.paletteRegion.dragging = false;
    state.paletteRegion.pointerId = null;
    state.paletteRegion.start = null;
    state.paletteRegion.draftRect = null;
    if (!region || region.width < 2 || region.height < 2) {
      updatePaletteRegionUi();
      updatePaletteRegionOverlay();
      setStatus("Palette region was too small. Drag a larger rectangle.");
      return true;
    }
    const before = cloneConfigSnapshot();
    config.paletteRegionRect = region;
    state.paletteRegion.enabled = false;
    if (config.paletteMode !== "generated") {
      config.paletteMode = "generated";
      if (els.paletteMode) els.paletteMode.value = config.paletteMode;
      updateConditionalPanels();
    }
    markPaletteDirty();
    pushHistorySnapshot(before, "Select palette region");
    updatePaletteRegionUi();
    updatePaletteRegionOverlay();
    setStatus(`Palette now sampling selected region ${region.width}×${region.height}.`);
    queueRender();
    event?.preventDefault?.();
    return true;
  }

  function cancelPaletteRegionDrag({announce = true} = {}) {
    resetRegionInteraction(state.paletteRegion);
    updatePaletteRegionUi();
    updatePaletteRegionOverlay();
    if (announce) setStatus("Palette region selection canceled.");
  }

  return {
    makeImageRegionRect: (a, b, imageData = state.imageData) => makeImageRegionRect(a, b, imageData),
    imageRegionToOverlayRect,
    updatePaletteRegionUi,
    updatePaletteRegionOverlay,
    resetPaletteRegion,
    togglePaletteRegionSelection,
    beginPaletteRegionDrag,
    updatePaletteRegionDrag,
    finishPaletteRegionDrag,
    cancelPaletteRegionDrag
  };
}
