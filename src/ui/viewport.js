function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function finitePositive(value, fallback = 1) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function canvasRenderSize({canvas, sourceCanvas, dpr = globalThis.window?.devicePixelRatio || 1, cssSize}) {
  const safeDpr = finitePositive(dpr, 1);
  const rect = cssSize || canvas.getBoundingClientRect();
  const fallbackWidth = sourceCanvas?.width || 1;
  const fallbackHeight = sourceCanvas?.height || 1;
  const width = Math.max(1, Math.round((rect.width || fallbackWidth) * safeDpr));
  const height = Math.max(1, Math.round((rect.height || fallbackHeight) * safeDpr));
  return {
    width,
    height,
    dpr: safeDpr,
    cssWidth: rect.width || width / safeDpr,
    cssHeight: rect.height || height / safeDpr
  };
}

export function fitViewRect(canvasW, canvasH, imageW, imageH, zoom = 1) {
  const safeCanvasW = finitePositive(canvasW, 1);
  const safeCanvasH = finitePositive(canvasH, 1);
  const safeImageW = finitePositive(imageW, 1);
  const safeImageH = finitePositive(imageH, 1);
  const imageAspect = safeImageW / safeImageH;
  const canvasAspect = safeCanvasW / safeCanvasH;
  const safeZoom = Math.max(1, Number(zoom) || 1);

  let fitW;
  let fitH;
  if (canvasAspect > imageAspect) {
    fitH = safeCanvasH;
    fitW = Math.round(fitH * imageAspect);
    const w = Math.min(safeCanvasW, Math.round(fitW * safeZoom));
    const h = fitH;
    const x = Math.floor((safeCanvasW - w) / 2);
    const y = 0;
    return {x, y, w, h};
  }

  fitW = safeCanvasW;
  fitH = Math.round(fitW / imageAspect);
  const w = fitW;
  const h = Math.min(safeCanvasH, Math.round(fitH * safeZoom));
  const x = 0;
  const y = Math.floor((safeCanvasH - h) / 2);
  return {x, y, w, h};
}

export function displayViewRect(canvasClientRect, renderSize, viewRect) {
  const dpr = finitePositive(renderSize.dpr, 1);
  return {
    left: canvasClientRect.left + viewRect.x / dpr,
    top: canvasClientRect.top + viewRect.y / dpr,
    width: viewRect.w / dpr,
    height: viewRect.h / dpr
  };
}

export function viewSpan(viewW, viewH, imageW, imageH, zoom = 1) {
  if (!imageW || !imageH) return [1, 1];
  const safeViewW = finitePositive(viewW, 1);
  const safeViewH = finitePositive(viewH, 1);
  const imageAspect = imageW / imageH;
  const viewAspect = safeViewW / safeViewH;
  const base = 1 / Math.max(1, Number(zoom) || 1);

  let spanX;
  let spanY;
  if (viewAspect > imageAspect) {
    spanY = base;
    spanX = base * (viewAspect / imageAspect);
  } else {
    spanX = base;
    spanY = base * (imageAspect / viewAspect);
  }
  return [Math.min(spanX, 1), Math.min(spanY, 1)];
}

export function clampedViewCenter(view, spanX, spanY) {
  const halfW = 0.5 * spanX;
  const halfH = 0.5 * spanY;
  return {
    centerX: clamp(view.centerX, halfW, 1 - halfW),
    centerY: clamp(view.centerY, halfH, 1 - halfH)
  };
}

export function normalizePointerToRect(clientX, clientY, rect) {
  const nx = clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
  const ny = clamp(1 - ((clientY - rect.top) / Math.max(rect.height, 1)), 0, 1);
  return {rect, nx, ny};
}

export function panCenterByClientDelta(view, dx, dy, rect, spanX, spanY) {
  return {
    centerX: view.centerX - (dx / Math.max(rect.width, 1)) * spanX,
    centerY: view.centerY - (dy / Math.max(rect.height, 1)) * spanY
  };
}

export function zoomViewAtPointer({view, deltaY, pointer, viewRect: currentViewRect, imageW, imageH, minZoom = 1, maxZoom = 32}) {
  const [oldSpanX, oldSpanY] = viewSpan(currentViewRect.w, currentViewRect.h, imageW, imageH, view.zoom);
  const anchorX = view.centerX + (pointer.nx - 0.5) * oldSpanX;
  const anchorY = view.centerY + (pointer.ny - 0.5) * oldSpanY;
  const factor = Math.exp(-deltaY * 0.001);
  const zoom = clamp(view.zoom * factor, minZoom, maxZoom);
  return {anchorX, anchorY, zoom};
}

export function imagePixelFromClientPoint({
  clientX,
  clientY,
  displayRect: rect,
  view,
  spanX,
  spanY,
  imageWidth,
  imageHeight
}) {
  const screenX = clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
  const screenY = clamp((clientY - rect.top) / Math.max(rect.height, 1), 0, 1);
  const uvX = clamp(view.centerX + (screenX - 0.5) * spanX, 0, 1);
  const uvY = clamp(view.centerY + (screenY - 0.5) * spanY, 0, 1);
  return {
    x: clamp(uvX * imageWidth, 0, imageWidth),
    y: clamp(uvY * imageHeight, 0, imageHeight)
  };
}

export function createViewportController({els, state, queueRender}) {
  let cachedCanvasCssSize = null;
  let cachedCanvasRenderSize = null;
  let cachedDpr = 0;
  let cachedFallbackWidth = 0;
  let cachedFallbackHeight = 0;
  let canvasSizeDirty = true;

  function currentDpr() {
    return finitePositive(globalThis.window?.devicePixelRatio || 1, 1);
  }

  function markCanvasRenderSizeDirty({forgetCssSize = false} = {}) {
    canvasSizeDirty = true;
    if (forgetCssSize) cachedCanvasCssSize = null;
  }

  function invalidateCanvasRenderSize({queue = false, afterCurrent = true, forgetCssSize = true} = {}) {
    markCanvasRenderSizeDirty({forgetCssSize});
    if (queue) queueRender(afterCurrent ? {afterCurrent: true} : undefined);
  }

  function rememberCanvasCssSize(width, height) {
    const next = {
      width: Number.isFinite(width) ? width : 0,
      height: Number.isFinite(height) ? height : 0
    };
    const changed = !cachedCanvasCssSize
      || cachedCanvasCssSize.width !== next.width
      || cachedCanvasCssSize.height !== next.height;
    cachedCanvasCssSize = next;
    if (changed) markCanvasRenderSizeDirty();
    return changed;
  }

  function readCanvasCssSize() {
    const rect = els.canvas.getBoundingClientRect();
    rememberCanvasCssSize(rect.width, rect.height);
    return cachedCanvasCssSize;
  }

  function getResizeObserverBoxSize(entry) {
    const box = Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize;
    if (box && Number.isFinite(box.inlineSize) && Number.isFinite(box.blockSize)) {
      return {width: box.inlineSize, height: box.blockSize};
    }
    return {
      width: entry.contentRect?.width || 0,
      height: entry.contentRect?.height || 0
    };
  }

  function queueResizeRender() {
    invalidateCanvasRenderSize({queue: true, afterCurrent: true, forgetCssSize: false});
  }

  if (typeof globalThis.ResizeObserver === "function" && els.canvas) {
    const resizeObserver = new globalThis.ResizeObserver(entries => {
      const entry = entries?.find?.(item => item.target === els.canvas) || entries?.[0];
      if (!entry) return;
      const {width, height} = getResizeObserverBoxSize(entry);
      if (rememberCanvasCssSize(width, height)) queueResizeRender();
    });
    try {
      resizeObserver.observe(els.canvas, {box: "border-box"});
    } catch {
      resizeObserver.observe(els.canvas);
    }
  }


  function getCanvasRenderSize() {
    const dpr = currentDpr();
    const fallbackWidth = state.sourceCanvas?.width || 1;
    const fallbackHeight = state.sourceCanvas?.height || 1;
    const fallbackChanged = cachedFallbackWidth !== fallbackWidth || cachedFallbackHeight !== fallbackHeight;
    if (
      cachedCanvasRenderSize
      && !canvasSizeDirty
      && cachedDpr === dpr
      && !fallbackChanged
    ) {
      return cachedCanvasRenderSize;
    }

    cachedDpr = dpr;
    cachedFallbackWidth = fallbackWidth;
    cachedFallbackHeight = fallbackHeight;
    cachedCanvasRenderSize = canvasRenderSize({
      canvas: els.canvas,
      sourceCanvas: state.sourceCanvas,
      dpr,
      cssSize: cachedCanvasCssSize || readCanvasCssSize()
    });
    canvasSizeDirty = false;
    return cachedCanvasRenderSize;
  }

  function imageSize() {
    return {
      width: state.sourceCanvas.width || 1,
      height: state.sourceCanvas.height || 1
    };
  }

  function getRenderBufferSize() {
    return state.gl ? {width: state.gl.canvas.width || 1, height: state.gl.canvas.height || 1} : getCanvasRenderSize();
  }

  function getViewRect(canvasW, canvasH) {
    const image = imageSize();
    return fitViewRect(canvasW, canvasH, image.width, image.height, state.view.zoom);
  }

  function getDisplayViewRect() {
    const rect = els.canvas.getBoundingClientRect();
    rememberCanvasCssSize(rect.width, rect.height);
    const renderSize = getCanvasRenderSize();
    const vr = getViewRect(renderSize.width, renderSize.height);
    return displayViewRect(rect, renderSize, vr);
  }

  function getViewSpan(viewW, viewH) {
    return viewSpan(viewW, viewH, state.sourceCanvas.width, state.sourceCanvas.height, state.view.zoom);
  }

  function clampViewCenter() {
    const {width, height} = getRenderBufferSize();
    const vr = getViewRect(width, height);
    const [spanX, spanY] = getViewSpan(vr.w, vr.h);
    const center = clampedViewCenter(state.view, spanX, spanY);
    state.view.centerX = center.centerX;
    state.view.centerY = center.centerY;
  }

  function updateViewStatus() {
    if (els.viewStatus) els.viewStatus.textContent = `${Math.round(state.view.zoom * 100)}%`;
    if (els.zoomOutButton) els.zoomOutButton.disabled = state.view.zoom <= 1.001;
    if (els.resetViewButton) {
      els.resetViewButton.disabled = state.view.zoom <= 1.001 && Math.abs(state.view.centerX - 0.5) < 1e-4 && Math.abs(state.view.centerY - 0.5) < 1e-4;
    }
  }

  function resetView(queue = true) {
    state.view.zoom = 1;
    state.view.centerX = 0.5;
    state.view.centerY = 0.5;
    updateViewStatus();
    if (queue) queueRender();
  }

  function normalizePointerToView(clientX, clientY) {
    return normalizePointerToRect(clientX, clientY, getDisplayViewRect());
  }

  function panByClientDelta(dx, dy) {
    const rect = getDisplayViewRect();
    const {width, height} = getRenderBufferSize();
    const vr = getViewRect(width, height);
    const [spanX, spanY] = getViewSpan(vr.w, vr.h);
    const center = panCenterByClientDelta(state.view, dx, dy, rect, spanX, spanY);
    state.view.centerX = center.centerX;
    state.view.centerY = center.centerY;
    clampViewCenter();
    updateViewStatus();
    queueRender();
  }

  function zoomBy(deltaY, clientX, clientY) {
    const before = normalizePointerToView(clientX, clientY);
    const {width, height} = getRenderBufferSize();
    const vr = getViewRect(width, height);
    const image = imageSize();
    const next = zoomViewAtPointer({
      view: state.view,
      deltaY,
      pointer: before,
      viewRect: vr,
      imageW: image.width,
      imageH: image.height
    });
    state.view.zoom = next.zoom;

    const nextVr = getViewRect(width, height);
    const [newSpanX, newSpanY] = getViewSpan(nextVr.w, nextVr.h);
    state.view.centerX = next.anchorX - (before.nx - 0.5) * newSpanX;
    state.view.centerY = next.anchorY - (before.ny - 0.5) * newSpanY;
    clampViewCenter();
    updateViewStatus();
    queueRender();
  }

  function clientPointToImagePixel(clientX, clientY) {
    if (!state.imageData || !state.sourceCanvas.width || !state.sourceCanvas.height) return null;
    const rect = getDisplayViewRect();
    const {width, height} = getRenderBufferSize();
    const vr = getViewRect(width, height);
    const [spanX, spanY] = getViewSpan(vr.w, vr.h);
    return imagePixelFromClientPoint({
      clientX,
      clientY,
      displayRect: rect,
      view: state.view,
      spanX,
      spanY,
      imageWidth: state.imageData.width,
      imageHeight: state.imageData.height
    });
  }

  return {
    getCanvasRenderSize,
    invalidateCanvasRenderSize,
    getViewRect,
    getDisplayViewRect,
    getViewSpan,
    clampViewCenter,
    updateViewStatus,
    resetView,
    normalizePointerToView,
    panByClientDelta,
    zoomBy,
    clientPointToImagePixel
  };
}
