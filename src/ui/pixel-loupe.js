import { hexToLab, labToOklch, normalizeHexColor } from "../color-utils.js";
import { NEUTRAL_CHROMA_EPSILON, TAU } from "../constants.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const PATCH_RADIUS = 7;
const PATCH_SIZE = PATCH_RADIUS * 2 + 1;

function requestFrame(callback) {
  const raf = globalThis.window?.requestAnimationFrame || globalThis.requestAnimationFrame;
  return typeof raf === "function" ? raf.call(globalThis.window || globalThis, callback) : callback(0);
}

function cancelFrame(id) {
  const caf = globalThis.window?.cancelAnimationFrame || globalThis.cancelAnimationFrame;
  if (typeof caf === "function" && id !== undefined && id !== null) caf.call(globalThis.window || globalThis, id);
}

function setText(el, value) {
  if (el) el.textContent = value;
}


function formatLoupeLch(hex) {
  const safeHex = normalizeHexColor(hex, "");
  if (!safeHex) return "— / — / —°";
  const [L, C, h] = labToOklch(hexToLab(safeHex));
  const degrees = C < NEUTRAL_CHROMA_EPSILON ? 0 : h * 360 / TAU;
  return `${L.toFixed(1)} / ${C.toFixed(1)} / ${degrees.toFixed(0)}°`;
}

function setSwatch(el, hex) {
  if (!el) return;
  el.style.background = hex || "transparent";
}

function makeScratchCanvas(canvas) {
  const doc = canvas?.ownerDocument || globalThis.document;
  const scratch = doc?.createElement?.("canvas");
  if (!scratch) return null;
  scratch.width = PATCH_SIZE;
  scratch.height = PATCH_SIZE;
  return scratch;
}

function drawLoupeCanvas(canvas, imageData, pixel) {
  if (!canvas?.getContext) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!imageData?.data || !pixel) return;

  const scratch = drawLoupeCanvas.scratch && drawLoupeCanvas.scratch.ownerDocument === canvas.ownerDocument
    ? drawLoupeCanvas.scratch
    : (drawLoupeCanvas.scratch = makeScratchCanvas(canvas));
  const scratchCtx = scratch?.getContext?.("2d");
  if (!scratchCtx) return;

  const patch = scratchCtx.createImageData(PATCH_SIZE, PATCH_SIZE);
  const centerX = clamp(Math.floor(pixel.x), 0, imageData.width - 1);
  const centerY = clamp(Math.floor(pixel.y), 0, imageData.height - 1);
  for (let yy = 0; yy < PATCH_SIZE; yy++) {
    const sourceY = clamp(centerY + yy - PATCH_RADIUS, 0, imageData.height - 1);
    for (let xx = 0; xx < PATCH_SIZE; xx++) {
      const sourceX = clamp(centerX + xx - PATCH_RADIUS, 0, imageData.width - 1);
      const sourceOffset = (sourceY * imageData.width + sourceX) * 4;
      const targetOffset = (yy * PATCH_SIZE + xx) * 4;
      patch.data[targetOffset] = imageData.data[sourceOffset];
      patch.data[targetOffset + 1] = imageData.data[sourceOffset + 1];
      patch.data[targetOffset + 2] = imageData.data[sourceOffset + 2];
      patch.data[targetOffset + 3] = imageData.data[sourceOffset + 3];
    }
  }

  scratchCtx.putImageData(patch, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, 0, 0, canvas.width, canvas.height);

  const cell = canvas.width / PATCH_SIZE;
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,.16)";
  ctx.beginPath();
  for (let i = 1; i < PATCH_SIZE; i++) {
    const pos = Math.round(i * cell) + 0.5;
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, canvas.height);
    ctx.moveTo(0, pos);
    ctx.lineTo(canvas.width, pos);
  }
  ctx.stroke();

  const centerLeft = PATCH_RADIUS * cell;
  const centerTop = PATCH_RADIUS * cell;
  ctx.strokeStyle = "rgba(255,255,255,.96)";
  ctx.strokeRect(Math.round(centerLeft) + 0.5, Math.round(centerTop) + 0.5, Math.max(1, Math.round(cell) - 1), Math.max(1, Math.round(cell) - 1));
  ctx.strokeStyle = "rgba(0,0,0,.82)";
  ctx.strokeRect(Math.round(centerLeft) + 1.5, Math.round(centerTop) + 1.5, Math.max(1, Math.round(cell) - 3), Math.max(1, Math.round(cell) - 3));
}

function renderLoupe({els, state, config}, pixel) {
  if (!pixel) {
    setText(els.pixelLoupeCoord, "x —, y —");
    setText(els.pixelLoupeSource, "—");
    setText(els.pixelLoupeFx, "—");
    setText(els.pixelLoupeSourceLch, "— / — / —°");
    setText(els.pixelLoupeFxLch, "— / — / —°");
    setSwatch(els.pixelLoupeSourceSwatch, null);
    setSwatch(els.pixelLoupeFxSwatch, null);
    drawLoupeCanvas(els.pixelLoupeCanvas, null, null);
    return;
  }

  const blendAmount = Number(config?.blendAmount);
  const fxHex = Math.abs((Number.isFinite(blendAmount) ? blendAmount : 1) - 1) > 1e-6
    ? pixel.finalHex
    : (pixel.fxHex || pixel.finalHex);
  setText(els.pixelLoupeCoord, `x ${pixel.x}, y ${pixel.y}`);
  setText(els.pixelLoupeSource, pixel.sourceHex || "—");
  setText(els.pixelLoupeFx, fxHex || "—");
  setText(els.pixelLoupeSourceLch, formatLoupeLch(pixel.sourceHex));
  setText(els.pixelLoupeFxLch, formatLoupeLch(fxHex));
  setSwatch(els.pixelLoupeSourceSwatch, pixel.sourceHex);
  setSwatch(els.pixelLoupeFxSwatch, fxHex);
  drawLoupeCanvas(els.pixelLoupeCanvas, state.imageData, pixel);
}

export function bindPixelLoupe({
  els = {},
  state = {},
  config = {},
  setPixelLoupeOpen = () => {},
  togglePixelLoupe = () => {},
  inspectLoupePixel = () => null,
  clearLoupePixel = () => {},
  setStatus = () => {}
} = {}) {
  const pane = els.pixelLoupePane;
  const body = globalThis.document?.body;
  if (pane && body && pane.parentElement !== body) body.appendChild(pane);
  if (!pane) return {destroy() {}};

  const handle = els.pixelLoupeHandle;
  const toggle = els.togglePixelLoupe;
  const close = els.closePixelLoupe;
  const canvas = els.canvas;
  const listeners = [];
  let latestPointer = null;
  let sampleFrame = null;

  const add = (target, type, listener, options) => {
    target?.addEventListener?.(type, listener, options);
    if (target?.removeEventListener) listeners.push([target, type, listener, options]);
  };

  const isOpen = () => !!state.diagnostics?.pixelLoupeOpen;

  function sampleLatestPointer() {
    sampleFrame = null;
    if (!isOpen() || !latestPointer) return;
    const pixel = inspectLoupePixel(latestPointer.clientX, latestPointer.clientY);
    renderLoupe({els, state, config}, pixel);
  }

  function scheduleSample(event) {
    if (!isOpen()) return;
    latestPointer = {clientX: event.clientX, clientY: event.clientY};
    if (sampleFrame !== null) return;
    sampleFrame = requestFrame(sampleLatestPointer);
  }

  add(toggle, "click", () => {
    togglePixelLoupe({announce: true});
    renderLoupe({els, state, config}, state.diagnostics?.pixelLoupe || null);
  });
  add(close, "click", () => {
    setPixelLoupeOpen(false, {announce: true});
  });
  add(canvas, "pointermove", scheduleSample);
  if (handle) {
    add(handle, "pointerdown", event => {
      if (event.button !== 0 || event.target?.closest?.("button")) return;
      event.preventDefault?.();
      const startRect = pane.getBoundingClientRect?.();
      if (!startRect) return;
      const start = {x: event.clientX, y: event.clientY};
      const startLeft = startRect.left;
      const startTop = startRect.top;
      const pointerId = event.pointerId;
      handle.setPointerCapture?.(pointerId);
      pane.classList.add("is-dragging");

      const move = moveEvent => {
        if (moveEvent.pointerId !== pointerId) return;
        const viewportW = globalThis.innerWidth || globalThis.document?.documentElement?.clientWidth || startRect.right;
        const viewportH = globalThis.innerHeight || globalThis.document?.documentElement?.clientHeight || startRect.bottom;
        const maxLeft = Math.max(6, viewportW - pane.offsetWidth - 6);
        const maxTop = Math.max(6, viewportH - pane.offsetHeight - 6);
        pane.style.left = `${clamp(startLeft + moveEvent.clientX - start.x, 6, maxLeft)}px`;
        pane.style.top = `${clamp(startTop + moveEvent.clientY - start.y, 6, maxTop)}px`;
        pane.style.right = "auto";
      };

      const end = endEvent => {
        if (endEvent.pointerId !== pointerId) return;
        pane.classList.remove("is-dragging");
        handle.releasePointerCapture?.(pointerId);
        handle.removeEventListener?.("pointermove", move);
        handle.removeEventListener?.("pointerup", end);
        handle.removeEventListener?.("pointercancel", end);
        handle.removeEventListener?.("lostpointercapture", end);
      };

      handle.addEventListener?.("pointermove", move);
      handle.addEventListener?.("pointerup", end);
      handle.addEventListener?.("pointercancel", end);
      handle.addEventListener?.("lostpointercapture", end);
    });
  }

  renderLoupe({els, state, config}, state.diagnostics?.pixelLoupe || null);

  return {
    destroy() {
      if (sampleFrame !== null) cancelFrame(sampleFrame);
      sampleFrame = null;
      clearLoupePixel();
      for (const [target, type, listener, options] of listeners) target.removeEventListener?.(type, listener, options);
    }
  };
}
