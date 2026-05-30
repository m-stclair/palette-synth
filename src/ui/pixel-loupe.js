import { hasReliableHue, hexToByteRgb, hexToLab, labToOklch, normalizeHexColor, rgb8ToLab } from "../color-utils.js";
import { MAX_PALETTE_SIZE, OKLAB_SCALE, TAU } from "../constants.js";
import { effectivePixelBlockSize, isPixelArtEnabled } from "../state/config.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const DEFAULT_PATCH_SIZE = 15;
const EXPANDED_PATCH_SIZE = 31;
const DEFAULT_CANVAS_SIZE = 112;
const EXPANDED_CANVAS_SIZE = 186;
const LOUPE_OUTPUT_SAMPLE_CACHE_LIMIT = 8192;

const loupeObjectIds = new WeakMap();
let nextLoupeObjectId = 1;

function loupeObjectId(value) {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return "";
  let id = loupeObjectIds.get(value);
  if (!id) {
    id = nextLoupeObjectId++;
    loupeObjectIds.set(value, id);
  }
  return id;
}

function signatureNumber(value, digits = 4) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : "";
}

function signatureBool(value) {
  return value ? "1" : "0";
}

function loupePaletteSignature(state = {}) {
  const records = Array.isArray(state.paletteRecords) ? state.paletteRecords : [];
  return records.map(record => [
    record?.id ?? "",
    record?.hex ?? "",
    Array.isArray(record?.lab) ? record.lab.map(value => signatureNumber(value, 3)).join(",") : "",
    record?.locked ? 1 : 0,
    record?.variant ?? "",
    record?.displayIndex ?? "",
    record?.swatchId ?? ""
  ].join(":")).join("|");
}

function loupeOutputConfigSignature(config = {}) {
  return [
    config.paletteMode ?? "",
    config.assignMode ?? "",
    config.outputMode ?? "",
    signatureBool(config.neutralIsCategory),
    signatureBool(config.monotoneBlendDither),
    signatureNumber(config.lumaWeight),
    signatureNumber(config.chromaWeight),
    signatureNumber(config.hueWeight),
    signatureNumber(config.blendK, 3),
    signatureNumber(config.softness),
    signatureNumber(config.blendAmount),
    signatureBool(config.maxDistanceEnabled),
    signatureNumber(config.maxDistance),
    signatureNumber(config.shadowCutoff),
    signatureNumber(config.highlightCutoff),
    signatureNumber(config.ditherLumaAmount),
    signatureNumber(config.ditherScale),
    signatureNumber(config.ditherAngle),
    isPixelArtEnabled(config) ? effectivePixelBlockSize(config) : 0,
    config.pixelBlockSampleMode ?? "center"
  ].join("~");
}

function loupeOutputSampleCacheKey({imageData, state = {}, config = {}} = {}) {
  return [
    "loupe-output-samples-v1",
    loupeObjectId(imageData),
    imageData?.width || 0,
    imageData?.height || 0,
    imageData?.version ?? "",
    state.originalSourceVersion ?? "",
    state.previewSourceVersion ?? "",
    state.textureVersion ?? "",
    state.paletteVersion ?? "",
    state.paletteDirty ? "dirty" : "clean",
    loupePaletteSignature(state),
    loupeOutputConfigSignature(config)
  ].join("~");
}

function rememberLoupeSample(cache, key, value) {
  if (cache.has(key)) cache.delete(key);
  else if (cache.size >= LOUPE_OUTPUT_SAMPLE_CACHE_LIMIT) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(key, value);
  return value;
}

function fallbackLoupeOutputSampleCacheKey(imageData, samplePixel) {
  return [
    "loupe-output-samples-adhoc",
    loupeObjectId(imageData),
    imageData?.width || 0,
    imageData?.height || 0,
    imageData?.version ?? "",
    loupeObjectId(samplePixel)
  ].join("~");
}

function getLoupeOutputSampleCache(signature, imageData, samplePixel) {
  const safeSignature = String(signature || fallbackLoupeOutputSampleCacheKey(imageData, samplePixel));
  const existing = drawLoupeCanvas.outputSampleCache;
  if (existing?.signature === safeSignature) return existing.samples;
  const next = {signature: safeSignature, samples: new Map()};
  drawLoupeCanvas.outputSampleCache = next;
  return next.samples;
}

function patchSizeForExpanded(expanded) {
  return expanded ? EXPANDED_PATCH_SIZE : DEFAULT_PATCH_SIZE;
}

function normalizePatchSize(patchSize) {
  return patchSize === EXPANDED_PATCH_SIZE ? EXPANDED_PATCH_SIZE : DEFAULT_PATCH_SIZE;
}

function canvasSizeForExpanded(expanded) {
  return expanded ? EXPANDED_CANVAS_SIZE : DEFAULT_CANVAS_SIZE;
}


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

function setHidden(el, hidden) {
  if (el) el.hidden = !!hidden;
}

function formatLoupeLch(hex) {
  const safeHex = normalizeHexColor(hex, "");
  if (!safeHex) return "— / — / —°";
  const [L, C, h] = labToOklch(hexToLab(safeHex));
  const degrees = hasReliableHue(L, C) ? h * 360 / TAU : 0;
  return `${L.toFixed(1)} / ${C.toFixed(1)} / ${degrees.toFixed(0)}°`;
}

function formatDistance(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

function normalizeDeltaParts(parts) {
  if (!parts) return null;
  const luma = Number(parts.luma ?? parts.deltaL ?? parts.dL);
  const chroma = Number(parts.chroma ?? parts.deltaC ?? parts.dC);
  const hue = Number(parts.hue ?? parts.deltaH ?? parts.dH);
  if (![luma, chroma, hue].every(Number.isFinite)) return null;
  return {luma, chroma, hue, hueSuppressed: !!(parts.hueSuppressed ?? parts.raw?.hueSuppressed)};
}

function formatHueDistance(parts) {
  return parts?.hueSuppressed ? "~" : formatDistance(parts?.hue);
}

function deltaFromLoupePixel(pixel, {blendActive = false} = {}) {
  const stored = blendActive
    ? (pixel?.blendDelta || pixel?.finalDelta || pixel?.outputDelta)
    : (pixel?.fxDelta || pixel?.outputDelta || pixel?.finalDelta || pixel?.blendDelta);
  return normalizeDeltaParts(stored);
}

function formatLoupeDelta(pixel, {blendActive = false} = {}) {
  const delta = deltaFromLoupePixel(pixel, {blendActive});
  if (!delta) return "ΔL — · ΔC — · ΔH —";
  return `ΔL ${formatDistance(delta.luma)} · ΔC ${formatDistance(delta.chroma)} · ΔH ${formatHueDistance(delta)}`;
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

function makeScratchCanvas(canvas, patchSize = DEFAULT_PATCH_SIZE) {
  const doc = canvas?.ownerDocument || globalThis.document;
  const scratch = doc?.createElement?.("canvas");
  if (!scratch) return null;
  scratch.width = patchSize;
  scratch.height = patchSize;
  return scratch;
}

function differenceByteForRgb(sourceRgb, finalRgb) {
  if (!sourceRgb || !finalRgb) return 0;
  const sourceLab = rgb8ToLab(sourceRgb[0], sourceRgb[1], sourceRgb[2]);
  const finalLab = rgb8ToLab(finalRgb[0], finalRgb[1], finalRgb[2]);
  const amount = clamp(
    Math.hypot(
      finalLab[0] - sourceLab[0],
      finalLab[1] - sourceLab[1],
      finalLab[2] - sourceLab[2]
    ) / OKLAB_SCALE,
    0,
    1
  );
  return Math.round(amount * 255);
}

function positiveModulo(value, modulus) {
  if (!(modulus > 0)) return 0;
  const remainder = value % modulus;
  return remainder < 0 ? remainder + modulus : remainder;
}

function drawBlockBoundaryGrid(ctx, {
  canvasWidth,
  canvasHeight,
  cell,
  patchSize,
  patchOriginX,
  patchOriginY,
  blockSize
}) {
  if (!(blockSize > 1)) return;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255,255,255,.34)";
  ctx.beginPath();
  for (let i = 0; i <= patchSize; i++) {
    if (positiveModulo(patchOriginX + i, blockSize) === 0) {
      const pos = Math.round(i * cell) + 0.5;
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, canvasHeight);
    }
    if (positiveModulo(patchOriginY + i, blockSize) === 0) {
      const pos = Math.round(i * cell) + 0.5;
      ctx.moveTo(0, pos);
      ctx.lineTo(canvasWidth, pos);
    }
  }
  ctx.stroke();
}

function drawActiveArtPixelFrame(ctx, {
  cell,
  patchSize,
  patchOriginX,
  patchOriginY,
  centerX,
  centerY,
  imageWidth,
  imageHeight,
  blockSize
}) {
  if (!(blockSize > 1)) return;
  const blockOriginX = Math.floor(centerX / blockSize) * blockSize;
  const blockOriginY = Math.floor(centerY / blockSize) * blockSize;
  const blockEndX = Math.min(blockOriginX + blockSize, imageWidth);
  const blockEndY = Math.min(blockOriginY + blockSize, imageHeight);
  const leftIndex = clamp(blockOriginX - patchOriginX, 0, patchSize);
  const topIndex = clamp(blockOriginY - patchOriginY, 0, patchSize);
  const rightIndex = clamp(blockEndX - patchOriginX, 0, patchSize);
  const bottomIndex = clamp(blockEndY - patchOriginY, 0, patchSize);
  if (!(rightIndex > leftIndex) || !(bottomIndex > topIndex)) return;

  const left = leftIndex * cell;
  const top = topIndex * cell;
  const width = Math.max(1, Math.round((rightIndex - leftIndex) * cell) - 1);
  const height = Math.max(1, Math.round((bottomIndex - topIndex) * cell) - 1);
  ctx.strokeStyle = "rgba(255,255,255,.96)";
  ctx.lineWidth = 2;
  ctx.strokeRect(Math.round(left) + 0.5, Math.round(top) + 0.5, width, height);
  ctx.strokeStyle = "rgba(0,0,0,.82)";
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(left) + 1.5, Math.round(top) + 1.5, Math.max(1, width - 2), Math.max(1, height - 2));
}

function drawLoupeCanvas(canvas, imageData, pixel, {viewMode = "source", samplePixel = null, sampleCacheKey = "", patchSize = DEFAULT_PATCH_SIZE, pixelBlockSize = 1} = {}) {
  if (!canvas?.getContext) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!imageData?.data || !pixel) return;

  patchSize = normalizePatchSize(patchSize);
  const patchRadius = Math.floor(patchSize / 2);
  const scratch = drawLoupeCanvas.scratch
    && drawLoupeCanvas.scratch.ownerDocument === canvas.ownerDocument
    && drawLoupeCanvas.scratch.width === patchSize
    && drawLoupeCanvas.scratch.height === patchSize
    ? drawLoupeCanvas.scratch
    : (drawLoupeCanvas.scratch = makeScratchCanvas(canvas, patchSize));
  const scratchCtx = scratch?.getContext?.("2d");
  if (!scratchCtx) return;

  const patch = scratchCtx.createImageData(patchSize, patchSize);
  const centerX = clamp(Math.floor(pixel.x), 0, imageData.width - 1);
  const centerY = clamp(Math.floor(pixel.y), 0, imageData.height - 1);
  const patchOriginX = centerX - patchRadius;
  const patchOriginY = centerY - patchRadius;
  const blockSize = Math.max(1, Math.round(Number(pixelBlockSize) || 1));
  const needsOutputSample = ["final", "diff"].includes(viewMode) && typeof samplePixel === "function";
  const sampleCache = needsOutputSample ? getLoupeOutputSampleCache(sampleCacheKey, imageData, samplePixel) : null;
  for (let yy = 0; yy < patchSize; yy++) {
    const sourceY = clamp(centerY + yy - patchRadius, 0, imageData.height - 1);
    for (let xx = 0; xx < patchSize; xx++) {
      const sourceX = clamp(centerX + xx - patchRadius, 0, imageData.width - 1);
      const sourceOffset = (sourceY * imageData.width + sourceX) * 4;
      const targetOffset = (yy * patchSize + xx) * 4;
      const sourceRgb = [
        imageData.data[sourceOffset],
        imageData.data[sourceOffset + 1],
        imageData.data[sourceOffset + 2]
      ];
      let rgb = null;
      if (sampleCache) {
        const key = sourceOffset >> 2;
        if (sampleCache.has(key)) {
          rgb = sampleCache.get(key);
          rememberLoupeSample(sampleCache, key, rgb);
        } else {
          rgb = rememberLoupeSample(sampleCache, key, rgbFromPatchSample(samplePixel(sourceX, sourceY)));
        }
      }
      if (viewMode === "diff") {
        const diff = differenceByteForRgb(sourceRgb, rgb || sourceRgb);
        patch.data[targetOffset] = diff;
        patch.data[targetOffset + 1] = diff;
        patch.data[targetOffset + 2] = diff;
        patch.data[targetOffset + 3] = 255;
      } else {
        patch.data[targetOffset] = rgb ? rgb[0] : sourceRgb[0];
        patch.data[targetOffset + 1] = rgb ? rgb[1] : sourceRgb[1];
        patch.data[targetOffset + 2] = rgb ? rgb[2] : sourceRgb[2];
        patch.data[targetOffset + 3] = imageData.data[sourceOffset + 3];
      }
    }
  }

  scratchCtx.putImageData(patch, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, 0, 0, canvas.width, canvas.height);

  const cell = canvas.width / patchSize;
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,.16)";
  ctx.beginPath();
  for (let i = 1; i < patchSize; i++) {
    const pos = Math.round(i * cell) + 0.5;
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, canvas.height);
    ctx.moveTo(0, pos);
    ctx.lineTo(canvas.width, pos);
  }
  ctx.stroke();
  drawBlockBoundaryGrid(ctx, {
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    cell,
    patchSize,
    patchOriginX,
    patchOriginY,
    blockSize
  });
  drawActiveArtPixelFrame(ctx, {
    cell,
    patchSize,
    patchOriginX,
    patchOriginY,
    centerX,
    centerY,
    imageWidth: imageData.width,
    imageHeight: imageData.height,
    blockSize
  });

  const centerLeft = patchRadius * cell;
  const centerTop = patchRadius * cell;
  ctx.strokeStyle = "rgba(255,255,255,.96)";
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(centerLeft) + 0.5, Math.round(centerTop) + 0.5, Math.max(1, Math.round(cell) - 1), Math.max(1, Math.round(cell) - 1));
  ctx.strokeStyle = "rgba(0,0,0,.82)";
  ctx.strokeRect(Math.round(centerLeft) + 1.5, Math.round(centerTop) + 1.5, Math.max(1, Math.round(cell) - 3), Math.max(1, Math.round(cell) - 3));
}

function renderLoupe({els, state, config, samplePixel = null, sampleCacheKey = ""}, pixel) {
  if (!pixel) {
    setText(els.pixelLoupeCoord, "x —, y —");
    setText(els.pixelLoupeSource, "—");
    setText(els.pixelLoupeFx, "—");
    setText(els.pixelLoupeSourceLch, "— / — / —°");
    setText(els.pixelLoupeFxLch, "— / — / —°");
    setText(els.pixelLoupeDelta, "ΔL — · ΔC — · ΔH —");
    setHidden(els.pixelLoupeDeltaRow, false);
    setSwatch(els.pixelLoupeSourceSwatch, null);
    setSwatch(els.pixelLoupeFxSwatch, null);
    drawLoupeCanvas(els.pixelLoupeCanvas, null, null);
    return;
  }

  const diagnostic = state.diagnostics || {};
  const expanded = !!diagnostic.pixelLoupeExpanded;
  const viewMode = diagnostic.pixelLoupeDiff ? "diff" : (diagnostic.pixelLoupeView === "final" ? "final" : "source");
  const lockSuffix = diagnostic.pixelLoupeFrozen
    ? " · frozen"
    : (diagnostic.pixelLoupePinMode && diagnostic.pixelLoupePinned)
      ? " · pinned"
      : diagnostic.pixelLoupePinMode
        ? " · click to pin"
        : "";
  const blendAmount = Number(config?.blendAmount);
  const blendActive = Math.abs((Number.isFinite(blendAmount) ? blendAmount : 1) - 1) > 1e-6;
  const fxHex = blendActive
    ? pixel.finalHex
    : (pixel.fxHex || pixel.finalHex);
  setText(els.pixelLoupeCoord, `x ${pixel.x}, y ${pixel.y}${lockSuffix}`);
  setText(els.pixelLoupeSource, pixel.sourceHex || "—");
  setText(els.pixelLoupeFx, fxHex || "—");
  setText(els.pixelLoupeSourceLch, formatLoupeLch(pixel.sourceHex));
  setText(els.pixelLoupeFxLch, formatLoupeLch(fxHex));
  setText(els.pixelLoupeDelta, formatLoupeDelta(pixel, {blendActive}));
  setHidden(els.pixelLoupeDeltaRow, false);
  if (els.pixelLoupeDelta) {
    els.pixelLoupeDelta.title = blendActive ? "Blended output delta from source" : "Mapped fx delta from source";
  }
  setSwatch(els.pixelLoupeSourceSwatch, pixel.sourceHex);
  setSwatch(els.pixelLoupeFxSwatch, fxHex);
  drawLoupeCanvas(els.pixelLoupeCanvas, state.imageData, pixel, {
    viewMode,
    samplePixel,
    sampleCacheKey,
    patchSize: patchSizeForExpanded(expanded),
    pixelBlockSize: effectivePixelBlockSize(config)
  });
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
  addPixelSourceToManualPalette = () => {},
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
  const addSource = els.pixelLoupeAdd;
  const diff = els.pixelLoupeDiff;
  const expand = els.pixelLoupeExpand;
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
  const diffModeEnabled = () => !!diagnostics().pixelLoupeDiff;
  const expandedModeEnabled = () => !!diagnostics().pixelLoupeExpanded;
  const isFrozen = () => !!diagnostics().pixelLoupeFrozen;
  const isPinMode = () => !!diagnostics().pixelLoupePinMode;
  const isPinned = () => !!diagnostics().pixelLoupePinned;
  const trackingLocked = () => isFrozen() || (isPinMode() && isPinned());

  function loupeCanvasMode() {
    return diffModeEnabled() ? "diff" : loupeViewMode();
  }

  function createOutputSamplerForPatch() {
    if (!["final", "diff"].includes(loupeCanvasMode())) return null;
    if (typeof createLoupePatchSampler === "function") {
      const sampler = createLoupePatchSampler();
      if (typeof sampler === "function") return sampler;
    }
    return (x, y) => analyzeLoupeImagePixel(x, y);
  }

  function renderCurrent(pixel = state.diagnostics?.pixelLoupe || null) {
    const needsOutputSample = pixel && ["final", "diff"].includes(loupeCanvasMode());
    const samplePixel = needsOutputSample ? createOutputSamplerForPatch() : null;
    const sampleCacheKey = samplePixel ? loupeOutputSampleCacheKey({imageData: state.imageData, state, config}) : "";
    renderLoupe({els, state, config, samplePixel, sampleCacheKey}, pixel);
  }

  function syncLoupeModeUi({render = true} = {}) {
    const diagnostic = diagnostics();
    const viewMode = loupeViewMode();
    pane.classList.toggle("is-frozen", isFrozen());
    pane.classList.toggle("is-pin-mode", isPinMode());
    pane.classList.toggle("is-pinned", isPinMode() && isPinned());
    pane.classList.toggle("is-diff", diffModeEnabled());
    pane.classList.toggle("is-expanded", expandedModeEnabled());
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
    const pixel = diagnostic.pixelLoupe;
    const manualCount = Array.isArray(config?.manualPalette) ? config.manualPalette.length : 0;
    const manualFull = manualCount >= MAX_PALETTE_SIZE;
    if (addSource) {
      addSource.disabled = !pixel || manualFull;
      addSource.title = !pixel
        ? "Sample a loupe pixel first"
        : (manualFull ? "Manual palette is already full" : `Add ${pixel.sourceHex || "source color"} to the manual palette`);
    }
    diff?.classList?.toggle?.("is-active", diffModeEnabled());
    diff?.setAttribute?.("aria-pressed", String(diffModeEnabled()));
    if (diff) {
      diff.title = diffModeEnabled() ? "Hide loupe difference heatmap" : "Show loupe difference heatmap";
      diff.setAttribute?.("aria-label", diffModeEnabled() ? "Hide loupe difference heatmap" : "Show loupe difference heatmap");
    }
    if (expand) {
      const expanded = expandedModeEnabled();
      expand.textContent = expanded ? "▢" : "⛶";
      expand.title = expanded ? "Restore loupe to 15×15" : "Expand loupe to 31×31";
      expand.setAttribute?.("aria-label", expanded ? "Restore loupe to 15 by 15 pixels" : "Expand loupe to 31 by 31 pixels");
      expand.setAttribute?.("aria-pressed", String(expanded));
    }
    const canvasSize = canvasSizeForExpanded(expandedModeEnabled());
    if (els.pixelLoupeCanvas && (els.pixelLoupeCanvas.width !== canvasSize || els.pixelLoupeCanvas.height !== canvasSize)) {
      els.pixelLoupeCanvas.width = canvasSize;
      els.pixelLoupeCanvas.height = canvasSize;
    }
    setHidden(els.pixelLoupeDeltaRow, false);
    const canvasMode = loupeCanvasMode();
    els.pixelLoupeCanvas?.setAttribute?.("aria-label", canvasMode === "diff"
      ? "Magnified source-to-final difference heatmap"
      : (canvasMode === "final" ? "Magnified final blended pixels" : "Magnified source pixels"));
    if (render && diagnostic.pixelLoupe) renderCurrent(diagnostic.pixelLoupe);
  }

  function sampleAtClientPoint(clientX, clientY) {
    const pixel = inspectLoupePixel(clientX, clientY);
    renderCurrent(pixel);
    syncLoupeModeUi({render: false});
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

  function toggleDiffMode() {
    const diagnostic = diagnostics();
    diagnostic.pixelLoupeDiff = !diagnostic.pixelLoupeDiff;
    syncLoupeModeUi();
    setStatus(diagnostic.pixelLoupeDiff ? "Loupe showing source-to-final difference heatmap." : `Loupe difference heatmap off. Showing ${loupeViewMode() === "final" ? "final blended output" : "source image"}.`);
  }

  function toggleExpandedMode() {
    const diagnostic = diagnostics();
    diagnostic.pixelLoupeExpanded = !diagnostic.pixelLoupeExpanded;
    syncLoupeModeUi();
    setStatus(diagnostic.pixelLoupeExpanded ? "Loupe expanded to 31×31 pixels." : "Loupe restored to 15×15 pixels.");
  }

  function addLoupeSourceToManualPalette() {
    const pixel = diagnostics().pixelLoupe;
    if (!pixel) {
      setStatus("Sample a loupe pixel first.");
      return;
    }
    addPixelSourceToManualPalette(pixel, {sourceLabel: "loupe sample"});
    syncLoupeModeUi();
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
  add(addSource, "click", addLoupeSourceToManualPalette);
  add(diff, "click", toggleDiffMode);
  add(expand, "click", toggleExpandedMode);
  add(doc, "keydown", handleKeydown);
  add(canvas, "pointermove", scheduleSample);
  add(canvas, "click", event => {
    if (!isOpen() || !isPinMode()) return;
    event.preventDefault?.();
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
    render(pixel = state.diagnostics?.pixelLoupe || null) {
      syncLoupeModeUi({render: false});
      renderCurrent(pixel);
    },
    destroy() {
      if (sampleFrame !== null) cancelFrame(sampleFrame);
      sampleFrame = null;
      clearLoupePixel();
      for (const [target, type, listener, options] of listeners) target.removeEventListener?.(type, listener, options);
    }
  };
}
