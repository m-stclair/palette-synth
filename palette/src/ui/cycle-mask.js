import { colorInfoLabel, labToHex, makePaletteRecord } from "../color-utils.js";
import { MAX_PALETTE_SIZE } from "../constants.js";

export const MASK_BEHAVIOR_CYCLE_WITHIN = "cycleWithin";
export const MASK_BEHAVIOR_FORBID_COLORS = "forbidColors";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function finitePositive(value, fallback = 1) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function pointerButtonIsPrimary(event) {
  return event?.button === 0 || event?.buttons === 1 || event?.type === "pointermove";
}

function normalizeBehavior(value) {
  return value === MASK_BEHAVIOR_FORBID_COLORS ? MASK_BEHAVIOR_FORBID_COLORS : MASK_BEHAVIOR_CYCLE_WITHIN;
}

function uniqueSortedSourceIndices(values) {
  const out = [];
  const seen = new Set();
  const input = values instanceof Set ? [...values] : (Array.isArray(values) ? values : []);
  for (const value of input) {
    const index = Math.round(Number(value));
    if (!Number.isInteger(index) || index < 0 || index >= MAX_PALETTE_SIZE || seen.has(index)) continue;
    seen.add(index);
    out.push(index);
  }
  out.sort((a, b) => a - b);
  return out;
}

export function maskBehaviorCode(mask = {}) {
  return normalizeBehavior(mask.behavior) === MASK_BEHAVIOR_FORBID_COLORS ? 2 : 1;
}

export function maskForbiddenSourceFlags(mask = {}) {
  const flags = new Int32Array(MAX_PALETTE_SIZE);
  for (const index of uniqueSortedSourceIndices(mask.forbiddenSourceIndices)) flags[index] = 1;
  return flags;
}

export function createMaskController({
  els,
  state,
  getCanvasRenderSize,
  getViewRect,
  getDisplayViewRect,
  getViewSpan,
  clientPointToImagePixel,
  markMaskDirty = () => {},
  queueRender = () => {},
  setStatus = () => {}
}) {
  if (!els || !state) {
    throw new TypeError("createMaskController requires els and state dependencies");
  }

  const elementKeys = {
    overlay: "maskOverlay",
    enabled: "maskEnabled",
    behavior: "maskBehavior",
    paint: "maskPaint",
    show: "maskShow",
    erase: "maskErase",
    clear: "maskClear",
    brushSize: "maskBrushSize",
    brushSizeValue: "maskBrushSizeValue",
    note: "maskNote",
    forbidPanel: "maskForbidPanel",
    forbiddenColors: "maskForbiddenColors"
  };

  function ui(name) {
    return els[elementKeys[name] || name] || null;
  }

  function maskState() {
    const mask = state.mask || {};
    if (!mask.behavior) mask.behavior = MASK_BEHAVIOR_CYCLE_WITHIN;
    if (!Array.isArray(mask.forbiddenSourceIndices)) {
      mask.forbiddenSourceIndices = uniqueSortedSourceIndices(mask.forbiddenSourceIndices);
    }
    if (!Number.isFinite(Number(mask.brushSize))) mask.brushSize = 48;
    if (!mask.paintMode) mask.paintMode = "off";
    if (mask.showOverlay !== false) mask.showOverlay = true;
    state.mask = mask;
    return mask;
  }

  function paletteRecords() {
    const records = Array.isArray(state.paletteRecords) && state.paletteRecords.length
      ? state.paletteRecords
      : (Array.isArray(state.palette) ? state.palette.map((lab, sourceIndex) => makePaletteRecord({lab, source: "legacy", sourceIndex, displayIndex: sourceIndex})) : []);
    return records.slice(0, MAX_PALETTE_SIZE);
  }

  function recordSourceIndex(record, fallbackIndex) {
    const raw = Number.isInteger(record?.displayIndex)
      ? record.displayIndex
      : (Number.isInteger(record?.sourceIndex) ? record.sourceIndex : fallbackIndex);
    return clamp(Math.round(Number(raw) || 0), 0, MAX_PALETTE_SIZE - 1);
  }

  function ensureMaskCanvas({resize = false} = {}) {
    const mask = maskState();
    if (!state.imageData?.width || !state.imageData?.height) return null;
    if (!mask.canvas) {
      const doc = els.canvas?.ownerDocument || globalThis.document;
      if (!doc?.createElement) return null;
      mask.canvas = doc.createElement("canvas");
    }
    const width = Math.max(1, Math.round(state.imageData.width));
    const height = Math.max(1, Math.round(state.imageData.height));
    if (resize || mask.canvas.width !== width || mask.canvas.height !== height) {
      mask.canvas.width = width;
      mask.canvas.height = height;
      mask.ctx = mask.canvas.getContext("2d", {willReadFrequently: true});
      mask.ctx.clearRect(0, 0, width, height);
      mask.textureDirty = true;
      mask.hasPaint = false;
      mask.lastPoint = null;
    } else if (!mask.ctx) {
      mask.ctx = mask.canvas.getContext("2d", {willReadFrequently: true});
    }
    return mask.canvas;
  }

  function resetMask({announce = false, resize = false, keepEnabled = true} = {}) {
    const mask = maskState();
    if (resize) {
      ensureMaskCanvas({resize: true});
    } else if (mask.canvas && mask.ctx) {
      mask.ctx.clearRect(0, 0, mask.canvas.width, mask.canvas.height);
      mask.textureDirty = true;
      mask.hasPaint = false;
      mask.lastPoint = null;
    } else {
      ensureMaskCanvas({resize: true});
    }
    mask.paintMode = "off";
    mask.dragging = false;
    mask.pointerId = null;
    if (!keepEnabled) mask.enabled = false;
    markMaskDirty();
    syncMaskUi();
    updateMaskOverlay();
    queueRender();
    if (announce) setStatus("Mask cleared.");
  }

  function setForbiddenSourceIndices(values) {
    const mask = maskState();
    mask.forbiddenSourceIndices = uniqueSortedSourceIndices(values);
    markMaskDirty();
    syncMaskUi();
    queueRender();
  }

  function toggleForbiddenSourceIndex(sourceIndex) {
    const mask = maskState();
    const normalized = clamp(Math.round(Number(sourceIndex) || 0), 0, MAX_PALETTE_SIZE - 1);
    const values = uniqueSortedSourceIndices(mask.forbiddenSourceIndices);
    const existing = values.indexOf(normalized);
    if (existing >= 0) values.splice(existing, 1);
    else values.push(normalized);
    mask.behavior = MASK_BEHAVIOR_FORBID_COLORS;
    mask.enabled = true;
    setForbiddenSourceIndices(values);
    return existing < 0;
  }

  function renderForbiddenColorChips() {
    const wrap = ui("forbiddenColors");
    const panel = ui("forbidPanel");
    if (!wrap) return;
    const mask = maskState();
    const forbidMode = normalizeBehavior(mask.behavior) === MASK_BEHAVIOR_FORBID_COLORS;
    if (panel) panel.hidden = !forbidMode;
    wrap.innerHTML = "";
    if (!forbidMode) return;

    const doc = wrap.ownerDocument || els.canvas?.ownerDocument || globalThis.document;
    const records = paletteRecords();
    const forbidden = new Set(uniqueSortedSourceIndices(mask.forbiddenSourceIndices));
    wrap.classList?.toggle?.("is-mask-forbid-mode", true);
    if (!records.length) {
      const empty = doc?.createElement?.("div");
      if (empty) {
        empty.className = "inline-note";
        empty.textContent = "Generate a palette first.";
        wrap.append(empty);
      }
      return;
    }

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const sourceIndex = recordSourceIndex(record, i);
      const hex = record?.hex ?? labToHex(record.lab);
      const chip = doc.createElement("button");
      chip.type = "button";
      chip.className = "chip mask-forbid-chip";
      chip.style.background = hex;
      chip.dataset.sourceIndex = String(sourceIndex);
      chip.setAttribute("aria-pressed", String(forbidden.has(sourceIndex)));
      chip.classList.toggle("is-forbidden", forbidden.has(sourceIndex));
      chip.title = `${colorInfoLabel(hex, record?.lab)} · ${forbidden.has(sourceIndex) ? "Allowed inside mask" : "Forbid inside mask"}`;
      chip.addEventListener("click", () => {
        const added = toggleForbiddenSourceIndex(sourceIndex);
        setStatus(added ? `Forbidden inside mask: ${hex}.` : `Allowed inside mask: ${hex}.`);
      });
      wrap.append(chip);
    }
  }

  function syncMaskUi() {
    const mask = maskState();
    const enabled = !!mask.enabled;
    const paintMode = mask.paintMode || "off";
    const behavior = normalizeBehavior(mask.behavior);
    const forbiddenCount = uniqueSortedSourceIndices(mask.forbiddenSourceIndices).length;
    const enabledEl = ui("enabled");
    const behaviorEl = ui("behavior");
    const paintEl = ui("paint");
    const showEl = ui("show");
    const eraseEl = ui("erase");
    const clearEl = ui("clear");
    const brushSizeEl = ui("brushSize");
    const brushSizeValueEl = ui("brushSizeValue");
    const noteEl = ui("note");
    const overlay = ui("overlay");

    if (enabledEl) enabledEl.checked = enabled;
    if (behaviorEl) behaviorEl.value = behavior;
    if (paintEl) {
      const active = paintMode !== "off";
      paintEl.textContent = active ? "Painting…" : "Paint mask";
      paintEl.setAttribute("aria-pressed", String(active));
    }
    if (showEl) {
      showEl.checked = mask.showOverlay !== false;
      showEl.disabled = !state.imageData || (!mask.canvas && paintMode === "off");
    }
    if (eraseEl) {
      const erase = paintMode === "erase";
      eraseEl.setAttribute("aria-pressed", String(erase));
      eraseEl.disabled = paintMode === "off";
    }
    if (clearEl) clearEl.disabled = !mask.canvas || !mask.hasPaint;
    if (brushSizeEl) brushSizeEl.value = mask.brushSize || 48;
    if (brushSizeValueEl) brushSizeValueEl.textContent = String(mask.brushSize || 48);
    if (noteEl) {
      if (!state.imageData) {
        noteEl.textContent = "Open an image first.";
      } else if (paintMode === "erase") {
        noteEl.textContent = "Drag to erase.";
      } else if (paintMode === "paint") {
        noteEl.textContent = "Drag to paint. Alt/Option-drag erases.";
      } else if (enabled && behavior === MASK_BEHAVIOR_FORBID_COLORS && forbiddenCount === 0) {
        noteEl.textContent = "Choose palette colors to forbid inside the painted mask.";
      } else if (enabled && behavior === MASK_BEHAVIOR_FORBID_COLORS) {
        noteEl.textContent = `${forbiddenCount} color${forbiddenCount === 1 ? "" : "s"} forbidden.`;
      } else if (enabled) {
        noteEl.textContent = "Cycle offset gated by mask.";
      } else if (mask.hasPaint) {
        noteEl.textContent = "Mask disabled.";
      } else {
        noteEl.textContent = "No mask.";
      }
    }
    if (els.canvas) els.canvas.classList.toggle("is-painting-mask", paintMode !== "off");
    if (overlay) overlay.classList.toggle("is-painting-mask", paintMode !== "off");
    renderForbiddenColorChips();
  }

  function bindMaskControls() {
    syncMaskUi();

    ui("enabled")?.addEventListener("change", event => {
      const mask = maskState();
      mask.enabled = !!event.target.checked;
      ensureMaskCanvas();
      mask.textureDirty = true;
      markMaskDirty();
      syncMaskUi();
      updateMaskOverlay();
      queueRender();
      setStatus(mask.enabled ? "Mask behavior enabled." : "Mask behavior disabled.");
    });

    ui("behavior")?.addEventListener("change", event => {
      const mask = maskState();
      mask.behavior = normalizeBehavior(event.target.value);
      mask.textureDirty = true;
      markMaskDirty();
      syncMaskUi();
      queueRender();
      setStatus(mask.behavior === MASK_BEHAVIOR_FORBID_COLORS ? "Mask behavior: forbid selected colors." : "Mask behavior: cycle only inside.");
    });

    ui("paint")?.addEventListener("click", () => {
      if (!state.imageData) {
        setStatus("Open an image before painting a mask.");
        return;
      }
      const mask = maskState();
      ensureMaskCanvas();
      mask.enabled = true;
      mask.paintMode = mask.paintMode === "off" ? "paint" : "off";
      syncMaskUi();
      updateMaskOverlay();
      markMaskDirty();
      queueRender();
      setStatus(mask.paintMode === "off" ? "Mask painting off." : "Painting mask.");
    });

    ui("show")?.addEventListener("change", event => {
      const mask = maskState();
      mask.showOverlay = !!event.target.checked;
      syncMaskUi();
      updateMaskOverlay();
      setStatus(mask.showOverlay ? "Mask overlay shown." : "Mask overlay hidden.");
    });

    ui("erase")?.addEventListener("click", () => {
      const mask = maskState();
      if ((mask.paintMode || "off") === "off") return;
      mask.paintMode = mask.paintMode === "erase" ? "paint" : "erase";
      syncMaskUi();
      setStatus(mask.paintMode === "erase" ? "Mask erase mode." : "Mask paint mode.");
    });

    ui("clear")?.addEventListener("click", () => resetMask({announce: true}));

    ui("brushSize")?.addEventListener("input", event => {
      const mask = maskState();
      mask.brushSize = clamp(Math.round(Number(event.target.value) || 48), 2, 256);
      syncMaskUi();
    });

    const overlay = ui("overlay");
    if (overlay && !overlay.dataset.maskEventsBound) {
      overlay.dataset.maskEventsBound = "true";
      overlay.addEventListener("pointerdown", beginMaskPaint);
      overlay.addEventListener("pointermove", updateMaskPaint);
      overlay.addEventListener("pointerup", finishMaskPaint);
      overlay.addEventListener("pointercancel", cancelMaskPaint);
      overlay.addEventListener("lostpointercapture", cancelMaskPaint);
      overlay.addEventListener("contextmenu", event => {
        if ((maskState().paintMode || "off") !== "off") event.preventDefault();
      });
    }
  }

  function drawMaskStroke(point, {erase = false} = {}) {
    const mask = maskState();
    ensureMaskCanvas();
    const ctx = mask.ctx;
    if (!ctx || !point) return false;
    const brushSize = clamp(Number(mask.brushSize) || 48, 2, 256);
    const x = clamp(point.x, 0, mask.canvas.width);
    const y = clamp(point.y, 0, mask.canvas.height);
    const last = mask.lastPoint;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = brushSize;
    ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
    ctx.strokeStyle = "rgba(255,255,255,1)";
    ctx.fillStyle = "rgba(255,255,255,1)";

    if (last) {
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, brushSize * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    mask.lastPoint = {x, y};
    if (!erase) mask.hasPaint = true;
    mask.textureDirty = true;
    markMaskDirty();
    updateMaskOverlay();
    queueRender();
    return true;
  }

  function beginMaskPaint(event) {
    const mask = maskState();
    if ((mask.paintMode || "off") === "off") return false;
    if (!pointerButtonIsPrimary(event)) return false;
    const point = clientPointToImagePixel(event.clientX, event.clientY);
    if (!point) return false;
    ensureMaskCanvas();
    mask.enabled = true;
    mask.dragging = true;
    mask.pointerId = event.pointerId;
    mask.lastPoint = null;
    const captureTarget = event.currentTarget?.setPointerCapture ? event.currentTarget : els.canvas;
    mask.captureTarget = captureTarget || null;
    captureTarget?.setPointerCapture?.(event.pointerId);
    drawMaskStroke(point, {erase: mask.paintMode === "erase" || !!event.altKey});
    syncMaskUi();
    event.preventDefault();
    return true;
  }

  function updateMaskPaint(event) {
    const mask = maskState();
    if (!mask.dragging || event.pointerId !== mask.pointerId) return false;
    const point = clientPointToImagePixel(event.clientX, event.clientY);
    if (!point) return true;
    drawMaskStroke(point, {erase: mask.paintMode === "erase" || !!event.altKey});
    event.preventDefault();
    return true;
  }

  function finishMaskPaint(event) {
    const mask = maskState();
    if (!mask.dragging || (event && event.pointerId !== mask.pointerId)) return false;
    mask.dragging = false;
    mask.pointerId = null;
    mask.lastPoint = null;
    mask.captureTarget = null;
    syncMaskUi();
    updateMaskOverlay();
    event?.preventDefault?.();
    return true;
  }

  function cancelMaskPaint(event) {
    const mask = maskState();
    if (!mask.dragging) return false;
    mask.dragging = false;
    mask.pointerId = null;
    mask.lastPoint = null;
    mask.captureTarget = null;
    syncMaskUi();
    updateMaskOverlay();
    event?.preventDefault?.();
    return true;
  }

  function updateMaskOverlay() {
    const mask = maskState();
    const overlay = ui("overlay");
    const paintMode = mask.paintMode || "off";
    const overlayAllowed = mask.showOverlay !== false;
    const shouldShow = !!(
      overlay
      && mask.canvas
      && state.imageData
      && overlayAllowed
      && (mask.hasPaint || paintMode !== "off")
      && (mask.enabled || paintMode !== "off")
    );
    if (!shouldShow) {
      if (overlay) overlay.hidden = true;
      return;
    }

    const displayRect = getDisplayViewRect();
    const shell = overlay.parentElement;
    if (!shell?.getBoundingClientRect) {
      overlay.hidden = true;
      return;
    }
    const shellRect = shell.getBoundingClientRect();
    const renderSize = state.gl ? {width: state.gl.canvas.width || 1, height: state.gl.canvas.height || 1, dpr: globalThis.window?.devicePixelRatio || 1} : getCanvasRenderSize();
    const vr = getViewRect(renderSize.width, renderSize.height);
    const [spanX, spanY] = getViewSpan(vr.w, vr.h);
    const dpr = finitePositive(renderSize.dpr || globalThis.window?.devicePixelRatio || 1, 1);

    const cssWidth = Math.max(1, displayRect.width);
    const cssHeight = Math.max(1, displayRect.height);
    const bufferWidth = Math.max(1, Math.round(cssWidth * dpr));
    const bufferHeight = Math.max(1, Math.round(cssHeight * dpr));

    if (overlay.width !== bufferWidth) overlay.width = bufferWidth;
    if (overlay.height !== bufferHeight) overlay.height = bufferHeight;
    overlay.style.left = `${displayRect.left - shellRect.left}px`;
    overlay.style.top = `${displayRect.top - shellRect.top}px`;
    overlay.style.width = `${cssWidth}px`;
    overlay.style.height = `${cssHeight}px`;

    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, bufferWidth, bufferHeight);

    const imageW = Math.max(1, state.imageData.width);
    const imageH = Math.max(1, state.imageData.height);
    const srcX = clamp((state.view.centerX - spanX * 0.5) * imageW, 0, imageW);
    const srcY = clamp((state.view.centerY - spanY * 0.5) * imageH, 0, imageH);
    const srcW = clamp(spanX * imageW, 1, imageW - srcX);
    const srcH = clamp(spanY * imageH, 1, imageH - srcY);

    ctx.save();
    ctx.drawImage(mask.canvas, srcX, srcY, srcW, srcH, 0, 0, bufferWidth, bufferHeight);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = normalizeBehavior(mask.behavior) === MASK_BEHAVIOR_FORBID_COLORS
      ? "rgba(255,112,180,0.46)"
      : "rgba(92,170,255,0.48)";
    ctx.fillRect(0, 0, bufferWidth, bufferHeight);
    ctx.restore();

    overlay.hidden = false;
  }

  return {
    bindMaskControls,
    ensureMaskCanvas,
    resetMask,
    syncMaskUi,
    updateMaskOverlay,
    renderForbiddenColorChips,
    setForbiddenSourceIndices,
    toggleForbiddenSourceIndex,
    beginMaskPaint,
    updateMaskPaint,
    finishMaskPaint,
    cancelMaskPaint
  };
}
