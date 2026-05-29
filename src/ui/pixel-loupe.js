import { hexToByteRgb, hexToLab, labToOklch, normalizeHexColor } from "../color-utils.js";
import { NEUTRAL_CHROMA_EPSILON, TAU } from "../constants.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const PATCH_RADIUS = 7;
const PATCH_SIZE = PATCH_RADIUS * 2 + 1;

function requestFrame(callback) {
  const raf = globalThis.window?.requestAnimationFrame || globalThis.requestAnimationFrame;
  if (typeof raf === "function") return raf.call(globalThis.window || globalThis, callback);
  callback(0);
  return null;
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

function rgbFromPatchSample(sample) {
  if (!sample) return null;
  const direct = Array.isArray(sample.rgb)
    ? sample.rgb
    : (Array.isArray(sample.finalRgb) ? sample.finalRgb : null);
  if (direct && direct.length >= 3) return direct;
  if (Number.isFinite(Number(sample.r)) && Number.isFinite(Number(sample.g)) && Number.isFinite(Number(sample.b))) {
    return [Number(sample.r), Number(sample.g), Number(sample.b)];
  }
  const safeHex = normalizeHexColor(sample.finalHex || sample.fxHex || sample.sourceHex, "");
  return safeHex ? hexToByteRgb(safeHex) : null;
}

function makeScratchCanvas(canvas) {
  const doc = canvas?.ownerDocument || globalThis.document;
  const scratch = doc?.createElement?.("canvas");
  if (!scratch) return null;
  scratch.width = PATCH_SIZE;
  scratch.height = PATCH_SIZE;
  return scratch;
}

function drawLoupeCanvas(canvas, imageData, pixel, {viewMode = "source", samplePixel = null} = {}) {
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
  const sampleCache = viewMode === "final" && typeof samplePixel === "function" ? new Map() : null;
  for (let yy = 0; yy < PATCH_SIZE; yy++) {
    const sourceY = clamp(centerY + yy - PATCH_RADIUS, 0, imageData.height - 1);
    for (let xx = 0; xx < PATCH_SIZE; xx++) {
      const sourceX = clamp(centerX + xx - PATCH_RADIUS, 0, imageData.width - 1);
      const sourceOffset = (sourceY * imageData.width + sourceX) * 4;
      const targetOffset = (yy * PATCH_SIZE + xx) * 4;
      let rgb = null;
      if (sampleCache) {
        const key = sourceOffset;
        if (sampleCache.has(key)) rgb = sampleCache.get(key);
        else {
          rgb = rgbFromPatchSample(samplePixel(sourceX, sourceY));
          sampleCache.set(key, rgb);
        }
      }
      patch.data[targetOffset] = rgb ? rgb[0] : imageData.data[sourceOffset];
      patch.data[targetOffset + 1] = rgb ? rgb[1] : imageData.data[sourceOffset + 1];
      patch.data[targetOffset + 2] = rgb ? rgb[2] : imageData.data[sourceOffset + 2];
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

function renderLoupe({els, state, config, samplePixel = null}, pixel) {
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

  const diagnostic = state.diagnostics || {};
  const viewMode = diagnostic.pixelLoupeView === "final" ? "final" : "source";
  const lockSuffix = diagnostic.pixelLoupeFrozen
    ? " · frozen"
    : (diagnostic.pixelLoupePinMode && diagnostic.pixelLoupePinned)
      ? " · pinned"
      : diagnostic.pixelLoupePinMode
        ? " · click to pin"
        : "";
  const blendAmount = Number(config?.blendAmount);
  const fxHex = Math.abs((Number.isFinite(blendAmount) ? blendAmount : 1) - 1) > 1e-6
    ? pixel.finalHex
    : (pixel.fxHex || pixel.finalHex);
  setText(els.pixelLoupeCoord, `x ${pixel.x}, y ${pixel.y}${lockSuffix}`);
  setText(els.pixelLoupeSource, pixel.sourceHex || "—");
  setText(els.pixelLoupeFx, fxHex || "—");
  setText(els.pixelLoupeSourceLch, formatLoupeLch(pixel.sourceHex));
  setText(els.pixelLoupeFxLch, formatLoupeLch(fxHex));
  setSwatch(els.pixelLoupeSourceSwatch, pixel.sourceHex);
  setSwatch(els.pixelLoupeFxSwatch, fxHex);
  drawLoupeCanvas(els.pixelLoupeCanvas, state.imageData, pixel, {viewMode, samplePixel});
}

export function bindPixelLoupe({
  els = {},
  state = {},
  config = {},
  setPixelLoupeOpen = () => {},
  togglePixelLoupe = () => {},
  inspectLoupePixel = () => null,
  analyzeLoupeImagePixel = () => null,
  createLoupePatchSampler = null,
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
  const pin = els.pixelLoupePin;
  const view = els.pixelLoupeView;
  const canvas = els.canvas;
  const doc = pane.ownerDocument || globalThis.document;
  const listeners = [];
  let latestPointer = null;
  let sampleFrame = null;

  const add = (target, type, listener, options) => {
    target?.addEventListener?.(type, listener, options);
    if (target?.removeEventListener) listeners.push([target, type, listener, options]);
  };

  const diagnostics = () => state.diagnostics || (state.diagnostics = {});
  const isOpen = () => !!state.diagnostics?.pixelLoupeOpen;
  const loupeViewMode = () => diagnostics().pixelLoupeView === "final" ? "final" : "source";
  const isFrozen = () => !!diagnostics().pixelLoupeFrozen;
  const isPinMode = () => !!diagnostics().pixelLoupePinMode;
  const isPinned = () => !!diagnostics().pixelLoupePinned;
  const trackingLocked = () => isFrozen() || (isPinMode() && isPinned());

  function createSamplePixelForPatch() {
    if (loupeViewMode() !== "final") return null;
    if (typeof createLoupePatchSampler === "function") {
      const sampler = createLoupePatchSampler();
      if (typeof sampler === "function") return sampler;
    }
    return (x, y) => analyzeLoupeImagePixel(x, y);
  }

  function renderCurrent(pixel = state.diagnostics?.pixelLoupe || null) {
    const samplePixel = pixel && loupeViewMode() === "final" ? createSamplePixelForPatch() : null;
    renderLoupe({els, state, config, samplePixel}, pixel);
  }

  function syncLoupeModeUi({render = true} = {}) {
    const diagnostic = diagnostics();
    const viewMode = loupeViewMode();
    pane.classList.toggle("is-frozen", isFrozen());
    pane.classList.toggle("is-pin-mode", isPinMode());
    pane.classList.toggle("is-pinned", isPinMode() && isPinned());
    pin?.classList?.toggle?.("is-active", isPinMode());
    pin?.setAttribute?.("aria-pressed", String(isPinMode()));
    if (pin) {
      pin.title = isPinMode()
        ? "Pin mode on: click the preview to pin or move the loupe sample"
        : "Pin loupe sample by clicking the preview";
      pin.setAttribute?.("aria-label", isPinMode() ? "Turn off loupe pin mode" : "Turn on loupe pin mode");
    }
    view?.classList?.toggle?.("is-active", viewMode === "final");
    view?.setAttribute?.("aria-pressed", String(viewMode === "final"));
    if (view) {
      view.textContent = viewMode === "final" ? "Final" : "Src";
      view.title = viewMode === "final" ? "Loupe patch: final blended output" : "Loupe patch: source image";
      view.setAttribute?.("aria-label", `Loupe patch view: ${viewMode === "final" ? "final blended output" : "source image"}`);
    }
    els.pixelLoupeCanvas?.setAttribute?.("aria-label", viewMode === "final" ? "Magnified final blended pixels" : "Magnified source pixels");
    if (render && diagnostic.pixelLoupe) renderCurrent(diagnostic.pixelLoupe);
  }

  function sampleAtClientPoint(clientX, clientY) {
    const pixel = inspectLoupePixel(clientX, clientY);
    renderCurrent(pixel);
    return pixel;
  }

  function sampleLatestPointer() {
    sampleFrame = null;
    if (!isOpen() || !latestPointer || trackingLocked()) return;
    sampleAtClientPoint(latestPointer.clientX, latestPointer.clientY);
  }

  function scheduleSample(event) {
    if (!isOpen()) return;
    latestPointer = {clientX: event.clientX, clientY: event.clientY};
    if (trackingLocked()) return;
    if (sampleFrame !== null) return;
    sampleFrame = requestFrame(sampleLatestPointer);
  }

  function setFrozen(next, {announce = false} = {}) {
    const diagnostic = diagnostics();
    const frozen = !!next;
    diagnostic.pixelLoupeFrozen = frozen;
    if (frozen) {
      diagnostic.pixelLoupePinMode = false;
      diagnostic.pixelLoupePinned = false;
    }
    const shouldSamplePointer = latestPointer && isOpen() && (frozen ? !diagnostic.pixelLoupe : !isPinMode());
    syncLoupeModeUi({render: !shouldSamplePointer});
    if (shouldSamplePointer) sampleAtClientPoint(latestPointer.clientX, latestPointer.clientY);
    if (announce) setStatus(frozen ? "Loupe frozen. Press Space to resume live sampling." : "Loupe live.");
  }

  function toggleFrozen() {
    if (!isOpen()) return false;
    setFrozen(!isFrozen(), {announce: true});
    return true;
  }

  function togglePinMode() {
    const diagnostic = diagnostics();
    const next = !isPinMode();
    diagnostic.pixelLoupePinMode = next;
    diagnostic.pixelLoupePinned = false;
    diagnostic.pixelLoupeFrozen = false;
    const shouldSamplePointer = !next && latestPointer && isOpen();
    syncLoupeModeUi({render: !shouldSamplePointer});
    if (shouldSamplePointer) sampleAtClientPoint(latestPointer.clientX, latestPointer.clientY);
    setStatus(next ? "Loupe pin mode. Click the preview to pin a sample." : "Loupe pin mode off. Live sampling resumed.");
  }

  function toggleViewMode() {
    const diagnostic = diagnostics();
    diagnostic.pixelLoupeView = loupeViewMode() === "source" ? "final" : "source";
    syncLoupeModeUi();
    setStatus(loupeViewMode() === "final" ? "Loupe showing final blended output." : "Loupe showing source image.");
  }

  function targetConsumesSpace(event) {
    if (event?.ctrlKey || event?.metaKey || event?.altKey) return true;
    const target = event?.target;
    if (!target?.closest) return false;
    return !!target.closest("input, select, textarea, button, summary, [role=button], dialog[open], [contenteditable]");
  }

  function handleKeydown(event) {
    const key = event?.key;
    if (key !== " " && key !== "Spacebar" && key !== "Space") return;
    if (targetConsumesSpace(event)) return;
    if (!toggleFrozen()) return;
    event.preventDefault?.();
    event.stopPropagation?.();
  }

  add(toggle, "click", () => {
    togglePixelLoupe({announce: true});
    syncLoupeModeUi({render: false});
    renderCurrent(state.diagnostics?.pixelLoupe || null);
  });
  add(close, "click", () => {
    setPixelLoupeOpen(false, {announce: true});
  });
  add(pin, "click", togglePinMode);
  add(view, "click", toggleViewMode);
  add(doc, "keydown", handleKeydown);
  add(canvas, "pointermove", scheduleSample);
  add(canvas, "click", event => {
    if (!isOpen() || !isPinMode()) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    event.stopPropagation?.();
    const diagnostic = diagnostics();
    diagnostic.pixelLoupePinned = true;
    diagnostic.pixelLoupeFrozen = false;
    const pixel = sampleAtClientPoint(event.clientX, event.clientY);
    syncLoupeModeUi({render: false});
    setStatus(pixel ? `Loupe pinned at x ${pixel.x}, y ${pixel.y}. Click another preview pixel to move it.` : "No preview pixel under the loupe pin.");
  });
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

  syncLoupeModeUi({render: false});
  renderCurrent(state.diagnostics?.pixelLoupe || null);

  return {
    destroy() {
      if (sampleFrame !== null) cancelFrame(sampleFrame);
      sampleFrame = null;
      clearLoupePixel();
      for (const [target, type, listener, options] of listeners) target.removeEventListener?.(type, listener, options);
    }
  };
}
