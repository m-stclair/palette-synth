import {
  byteRgbToHex,
  colorInfoLabel,
  fitLabToSrgb,
  hasReliableHue,
  hexToByteRgb,
  hexToLab,
  labInSrgbGamut,
  labToHex,
  labToLinearRgbRaw,
  linear2SRGB,
  labToOklch,
  normalizeHexColor,
  oklchToLab
} from "../color-utils.js";
import { OKLCH_PROCEDURAL_CHROMA_MAX, TAU } from "../constants.js";

const PICKER_KEY = "__paletteSynthColorPicker";
const FALLBACK_HEX = "#000000";
const MAX_CHROMA = OKLCH_PROCEDURAL_CHROMA_MAX || 42;
const WHEEL_SIZE = 184;
const WHEEL_CENTER = WHEEL_SIZE / 2;
const WHEEL_OUTER_RADIUS = 89;
const WHEEL_INNER_RADIUS = 60;
const WHEEL_MID_RADIUS = (WHEEL_OUTER_RADIUS + WHEEL_INNER_RADIUS) / 2;
const WHEEL_HIT_INSET = 10;
const WHEEL_HIT_OUTSET = 9;
const TRIANGLE_RADIUS = 57;
const TRIANGLE_HUE_LIGHTNESS = 64;
const CUSP_LIGHTNESS_STEP = 2.5;
const CHROMA_ROOT_STEPS = 96;
const ROOT_GAMUT_EPSILON = 1e-5;
const DISPLAY_GAMUT_EPSILON = 5e-4;
const RING_HUE_CACHE_DEGREES = 1;

const chromaCache = new Map();
const cuspCache = new Map();
const hueRingLabCache = new Map();
const wheelBaseImageCache = new Map();
const wheelTrianglePixelCache = new Map();
const wheelDrawState = new WeakMap();

function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function clampLightness(value) {
  return clamp(value, 0, 100);
}

function normalizeHueRadians(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return ((number % TAU) + TAU) % TAU;
}

function hueRadiansToDegrees(value) {
  return normalizeHueRadians(value) * 180 / Math.PI;
}

function hueDegreesToRadians(value) {
  return normalizeHueRadians((Number(value) || 0) * Math.PI / 180);
}

function rounded(value, places = 1) {
  const scale = 10 ** places;
  return Math.round(Number(value) * scale) / scale;
}

function formatNumber(value, places = 1) {
  const roundedValue = rounded(value, places);
  return Number.isInteger(roundedValue) ? String(roundedValue) : roundedValue.toFixed(places);
}

function rgbCodeForHex(hex) {
  const [r, g, b] = hexToByteRgb(normalizeHexColor(hex, FALLBACK_HEX));
  return `rgb(${r}, ${g}, ${b})`;
}

function oklchFromHex(hex, fallbackHue = 0) {
  const [l, c, h] = labToOklch(hexToLab(normalizeHexColor(hex, FALLBACK_HEX)));
  return {
    l: clampLightness(l),
    c: Math.max(0, c),
    h: hasReliableHue(l, c) ? normalizeHueRadians(h) : normalizeHueRadians(fallbackHue)
  };
}

function rawRgbForChroma(lightness, hue, chroma) {
  return labToLinearRgbRaw(oklchToLab([lightness, chroma, hue]));
}

function chromaBoundaryRoot(lightness, hue, channel, target, lo, hi) {
  let left = lo;
  let right = hi;
  let leftValue = rawRgbForChroma(lightness, hue, left)[channel] - target;
  for (let i = 0; i < 22; i++) {
    const mid = (left + right) / 2;
    const midValue = rawRgbForChroma(lightness, hue, mid)[channel] - target;
    if (Math.abs(midValue) <= 1e-9) return mid;
    if (Math.sign(leftValue) === Math.sign(midValue)) {
      left = mid;
      leftValue = midValue;
    } else {
      right = mid;
    }
  }
  return (left + right) / 2;
}

function addChromaBoundaryRoots(roots, lightness, hue, channel, target) {
  let previousC = 0;
  let previousValue = rawRgbForChroma(lightness, hue, previousC)[channel] - target;
  for (let i = 1; i <= CHROMA_ROOT_STEPS; i++) {
    const chroma = MAX_CHROMA * i / CHROMA_ROOT_STEPS;
    const value = rawRgbForChroma(lightness, hue, chroma)[channel] - target;
    if (Math.abs(value) <= ROOT_GAMUT_EPSILON) roots.push(chroma);
    if (Math.sign(previousValue) !== Math.sign(value)) {
      roots.push(chromaBoundaryRoot(lightness, hue, channel, target, previousC, chroma));
    }
    previousC = chroma;
    previousValue = value;
  }
}

function rgbInGamut(rgb, epsilon = ROOT_GAMUT_EPSILON) {
  return rgb.every(channel => channel >= -epsilon && channel <= 1 + epsilon);
}

function maxChromaFor(lightness, hue) {
  const l = clampLightness(lightness);
  const h = normalizeHueRadians(hue);
  const key = `${Math.round(l * 10)}:${Math.round(hueRadiansToDegrees(h) * 10)}`;
  const cached = chromaCache.get(key);
  if (cached !== undefined) return cached;

  const roots = [0, MAX_CHROMA];
  for (let channel = 0; channel < 3; channel++) {
    addChromaBoundaryRoots(roots, l, h, channel, 0);
    addChromaBoundaryRoots(roots, l, h, channel, 1);
  }

  const boundaries = roots
    .filter(value => Number.isFinite(value) && value >= 0 && value <= MAX_CHROMA)
    .sort((a, b) => a - b)
    .filter((value, index, values) => index === 0 || Math.abs(value - values[index - 1]) > 1e-7);

  let best = 0;
  for (const boundary of boundaries) {
    if (rgbInGamut(rawRgbForChroma(l, h, boundary))) best = Math.max(best, boundary);
  }
  for (let i = 0; i < boundaries.length - 1; i++) {
    const lo = boundaries[i];
    const hi = boundaries[i + 1];
    if (hi - lo <= 1e-7) continue;
    const mid = (lo + hi) / 2;
    if (!rgbInGamut(rawRgbForChroma(l, h, mid))) continue;
    let left = mid;
    let right = hi;
    for (let step = 0; step < 18; step++) {
      const candidate = (left + right) / 2;
      if (rgbInGamut(rawRgbForChroma(l, h, candidate))) left = candidate;
      else right = candidate;
    }
    best = Math.max(best, left);
  }

  chromaCache.set(key, best);
  if (chromaCache.size > 5000) chromaCache.clear();
  return best;
}

function cuspForHue(hue) {
  const h = normalizeHueRadians(hue);
  const key = Math.round(hueRadiansToDegrees(h) * 10);
  const cached = cuspCache.get(key);
  if (cached) return cached;

  let bestL = 0;
  let bestC = 0;
  for (let candidateL = 0; candidateL <= 100.0001; candidateL += CUSP_LIGHTNESS_STEP) {
    const candidateC = maxChromaFor(candidateL, h);
    if (candidateC > bestC) {
      bestL = candidateL;
      bestC = candidateC;
    }
  }

  let lo = Math.max(0, bestL - CUSP_LIGHTNESS_STEP);
  let hi = Math.min(100, bestL + CUSP_LIGHTNESS_STEP);
  for (let i = 0; i < 18; i++) {
    const left = lo + (hi - lo) / 3;
    const right = hi - (hi - lo) / 3;
    if (maxChromaFor(left, h) < maxChromaFor(right, h)) lo = left;
    else hi = right;
  }

  const l = (lo + hi) / 2;
  const c = maxChromaFor(l, h);
  const cusp = {l, c, h};
  cuspCache.set(key, cusp);
  if (cuspCache.size > 1000) cuspCache.clear();
  return cusp;
}

function fitOklchToDisplay({l, c, h}) {
  const safeL = clampLightness(l);
  const safeH = normalizeHueRadians(h);
  const safeC = Math.max(0, Number(c) || 0);
  const lab = oklchToLab([safeL, safeC, safeH]);
  const displayLab = labInSrgbGamut(lab, DISPLAY_GAMUT_EPSILON) ? lab : fitLabToSrgb(lab);
  const [displayL, displayC, displayH] = labToOklch(displayLab);
  return {
    l: clampLightness(displayL),
    c: Math.max(0, displayC),
    h: hasReliableHue(displayL, displayC) ? normalizeHueRadians(displayH) : safeH,
    hex: labToHex(displayLab)
  };
}

function eventFor(target, type, value = null) {
  const view = target?.ownerDocument?.defaultView || globalThis.window || globalThis;
  const eventOptions = {bubbles: true, composed: true};
  if (type === "input" && typeof view.InputEvent === "function") {
    try {
      return new view.InputEvent(type, {
        ...eventOptions,
        data: value,
        inputType: "insertReplacementText"
      });
    } catch {}
  }
  const EventConstructor = typeof view.Event === "function" ? view.Event : (typeof Event === "function" ? Event : null);
  if (EventConstructor) {
    try {
      return new EventConstructor(type, eventOptions);
    } catch {}
  }
  return {type, ...eventOptions};
}

function eyeDropperClass() {
  const candidate = globalThis.EyeDropper || globalThis.window?.EyeDropper;
  return typeof candidate === "function" ? candidate : null;
}

function eyeDropperWasCancelled(error) {
  const text = `${error?.name || ""} ${error?.message || ""}`.toLowerCase();
  return text.includes("abort") || text.includes("cancel");
}

// The EyeDropper spec says result.sRGBHex must be in "#RRGGBB" form, but Chrome
// has shipped versions where it returns rgb()/rgba() instead. Coerce whatever
// we receive into hex so the caller can validate it the same way.
function hexFromEyeDropperColor(value) {
  if (typeof value !== "string") return "";
  const direct = normalizeHexColor(value, "");
  if (direct) return direct;
  const match = value.trim().match(/^rgba?\(\s*([^)]+)\s*\)$/i);
  if (!match) return "";
  const parts = match[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return "";
  const channels = parts.slice(0, 3).map(part => {
    const numeric = Number.parseFloat(part);
    if (!Number.isFinite(numeric)) return NaN;
    return part.endsWith("%") ? numeric * 2.55 : numeric;
  });
  if (channels.some(channel => !Number.isFinite(channel))) return "";
  return byteRgbToHex(channels[0], channels[1], channels[2]);
}

function labelTextFor(input, fallback = "Choose color") {
  const explicit = input.getAttribute?.("aria-label") || input.title;
  if (explicit) return explicit;
  const id = input.id;
  const escapedId = globalThis.CSS?.escape ? globalThis.CSS.escape(id) : id;
  const label = id ? input.ownerDocument?.querySelector?.(`label[for="${escapedId}"]`) : null;
  return label?.textContent?.trim() || fallback;
}

function positionPopover(input, popover) {
  const rect = input.getBoundingClientRect?.();
  if (!rect) return;
  const gap = 7;
  const width = Math.max(248, popover.offsetWidth || 248);
  const viewportWidth = globalThis.window?.innerWidth || 1024;
  const viewportHeight = globalThis.window?.innerHeight || 768;
  const maxLeft = Math.max(8, viewportWidth - width - 8);
  const left = Math.min(Math.max(8, rect.left), maxLeft);
  const below = rect.bottom + gap;
  const estimatedHeight = popover.offsetHeight || 380;
  const top = below + estimatedHeight > viewportHeight - 8
    ? Math.max(8, rect.top - estimatedHeight - gap)
    : below;
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

function setInputPresentation(input, hex) {
  input.value = normalizeHexColor(hex, FALLBACK_HEX);
  if (typeof input.style?.setProperty === "function") input.style.setProperty("--picker-color", input.value);
  else if (input.style) input.style["--picker-color"] = input.value;
  const label = input.getAttribute?.("aria-label") || "Choose color";
  input.title = `${label} · ${colorInfoLabel(input.value)}`;
}

function triangleVertices() {
  const height = TRIANGLE_RADIUS * 1.5;
  const halfWidth = Math.cos(Math.PI / 6) * TRIANGLE_RADIUS;
  return {
    hue: {x: WHEEL_CENTER, y: WHEEL_CENTER - TRIANGLE_RADIUS},
    white: {x: WHEEL_CENTER - halfWidth, y: WHEEL_CENTER + height / 3},
    black: {x: WHEEL_CENTER + halfWidth, y: WHEEL_CENTER + height / 3}
  };
}

function barycentricForPoint(point, vertices = triangleVertices()) {
  const {hue, white, black} = vertices;
  const denominator = (white.y - black.y) * (hue.x - black.x) + (black.x - white.x) * (hue.y - black.y);
  if (Math.abs(denominator) < 0.000001) return {hue: 0, white: 0, black: 1};
  const hueWeight = ((white.y - black.y) * (point.x - black.x) + (black.x - white.x) * (point.y - black.y)) / denominator;
  const whiteWeight = ((black.y - hue.y) * (point.x - black.x) + (hue.x - black.x) * (point.y - black.y)) / denominator;
  const blackWeight = 1 - hueWeight - whiteWeight;
  return {hue: hueWeight, white: whiteWeight, black: blackWeight};
}

function pointInTriangle(point, vertices = triangleVertices()) {
  const weights = barycentricForPoint(point, vertices);
  return weights.hue >= -0.0001 && weights.white >= -0.0001 && weights.black >= -0.0001;
}

function closestPointOnSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0.000001) return {...start};
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq);
  return {x: start.x + dx * t, y: start.y + dy * t};
}

function closestPointOnTriangle(point, vertices = triangleVertices()) {
  if (pointInTriangle(point, vertices)) return point;
  const candidates = [
    closestPointOnSegment(point, vertices.hue, vertices.white),
    closestPointOnSegment(point, vertices.white, vertices.black),
    closestPointOnSegment(point, vertices.black, vertices.hue)
  ];
  let best = candidates[0];
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function hueRingLabFor(hue) {
  const degrees = hueRadiansToDegrees(hue);
  const key = Math.round(degrees / RING_HUE_CACHE_DEGREES) * RING_HUE_CACHE_DEGREES;
  const cached = hueRingLabCache.get(key);
  if (cached) return cached;

  const h = hueDegreesToRadians(key);
  const lab = oklchToLab([TRIANGLE_HUE_LIGHTNESS, maxChromaFor(TRIANGLE_HUE_LIGHTNESS, h), h]);
  hueRingLabCache.set(key, lab);
  if (hueRingLabCache.size > Math.ceil(360 / RING_HUE_CACHE_DEGREES) + 4) hueRingLabCache.clear();
  return lab;
}

function hueLabFor(hue) {
  const cusp = cuspForHue(hue);
  return oklchToLab([cusp.l, cusp.c, cusp.h]);
}

function labForTriangleWeights(weights, hue) {
  const hueLab = hueLabFor(hue);
  const lab = [
    weights.hue * hueLab[0] + weights.white * 100,
    weights.hue * hueLab[1],
    weights.hue * hueLab[2]
  ];
  return labInSrgbGamut(lab, DISPLAY_GAMUT_EPSILON) ? lab : fitLabToSrgb(lab);
}

function normalizeTriangleWeights(weights) {
  const hue = Math.max(0, Number(weights?.hue) || 0);
  const white = Math.max(0, Number(weights?.white) || 0);
  const black = Math.max(0, Number(weights?.black) || 0);
  const total = hue + white + black;
  if (total <= 0.000001) return {hue: 0, white: 0, black: 1};
  return {hue: hue / total, white: white / total, black: black / total};
}

function triangleWeightsForOklch({l, c, h}) {
  const cusp = cuspForHue(h);
  const hueWeight = clamp(c / Math.max(0.0001, cusp.c));
  const neutralWeight = 1 - hueWeight;
  const whiteWeight = neutralWeight <= 0.0001
    ? 0
    : clamp((clampLightness(l) - hueWeight * cusp.l) / 100, 0, neutralWeight);
  const blackWeight = Math.max(0, 1 - hueWeight - whiteWeight);
  return normalizeTriangleWeights({hue: hueWeight, white: whiteWeight, black: blackWeight});
}

function trianglePointForWeights(weights) {
  const vertices = triangleVertices();
  const safe = normalizeTriangleWeights(weights);
  return {
    x: vertices.hue.x * safe.hue + vertices.white.x * safe.white + vertices.black.x * safe.black,
    y: vertices.hue.y * safe.hue + vertices.white.y * safe.white + vertices.black.y * safe.black
  };
}

function oklchForTriangleWeights(weights, hue) {
  const safeHue = normalizeHueRadians(hue);
  const [l, c, h] = labToOklch(labForTriangleWeights(normalizeTriangleWeights(weights), safeHue));
  return {l, c, h: hasReliableHue(l, c) ? normalizeHueRadians(h) : safeHue};
}

function writeLabPixel(data, offset, lab, alpha = 255) {
  const rgb = labToLinearRgbRaw(lab).map(linear2SRGB);
  data[offset] = Math.max(0, Math.min(255, Math.round(rgb[0] * 255)));
  data[offset + 1] = Math.max(0, Math.min(255, Math.round(rgb[1] * 255)));
  data[offset + 2] = Math.max(0, Math.min(255, Math.round(rgb[2] * 255)));
  data[offset + 3] = alpha;
}

function drawKeyFor(canvas, hue) {
  const width = canvas?.width || WHEEL_SIZE;
  const height = canvas?.height || WHEEL_SIZE;
  return `${width}x${height}:${Math.round(hueRadiansToDegrees(hue) * 10)}`;
}

function wheelGeometryKey(width, height) {
  return `${width}x${height}`;
}

function getWheelTrianglePixels(width, height) {
  const key = wheelGeometryKey(width, height);
  const cached = wheelTrianglePixelCache.get(key);
  if (cached) return cached;

  const vertices = triangleVertices();
  const pixels = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const point = {x: x + 0.5, y: y + 0.5};
      if (!pointInTriangle(point, vertices)) continue;
      pixels.push({offset: (y * width + x) * 4, weights: barycentricForPoint(point, vertices)});
    }
  }
  wheelTrianglePixelCache.set(key, pixels);
  if (wheelTrianglePixelCache.size > 8) wheelTrianglePixelCache.clear();
  return pixels;
}

function getWheelBaseImage(context, width, height) {
  const key = wheelGeometryKey(width, height);
  const cached = wheelBaseImageCache.get(key);
  if (cached) return cached;

  const image = context.createImageData(width, height);
  const data = image.data;
  let offset = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x + 0.5 - WHEEL_CENTER;
      const dy = y + 0.5 - WHEEL_CENTER;
      const distance = Math.hypot(dx, dy);
      if (distance >= WHEEL_INNER_RADIUS && distance <= WHEEL_OUTER_RADIUS) {
        const pixelHue = normalizeHueRadians(Math.atan2(dy, dx));
        writeLabPixel(data, offset, hueRingLabFor(pixelHue));
      } else {
        data[offset + 3] = 0;
      }
      offset += 4;
    }
  }
  wheelBaseImageCache.set(key, image);
  if (wheelBaseImageCache.size > 8) wheelBaseImageCache.clear();
  return image;
}

function drawOklchWheel(canvas, hue) {
  if (!canvas || typeof canvas.getContext !== "function") return false;
  const key = drawKeyFor(canvas, hue);
  if (wheelDrawState.get(canvas) === key) return false;

  const context = canvas.getContext("2d");
  if (!context) return false;

  const width = canvas.width || WHEEL_SIZE;
  const height = canvas.height || WHEEL_SIZE;
  context.clearRect(0, 0, width, height);

  if (typeof context.createImageData !== "function" || typeof context.putImageData !== "function") {
    context.fillStyle = labToHex(hueLabFor(hue));
    context.beginPath?.();
    context.arc?.(WHEEL_CENTER, WHEEL_CENTER, WHEEL_OUTER_RADIUS, 0, TAU);
    context.fill?.();
    wheelDrawState.set(canvas, key);
    return true;
  }

  const base = getWheelBaseImage(context, width, height);
  const image = context.createImageData(width, height);
  image.data.set(base.data);
  for (const pixel of getWheelTrianglePixels(width, height)) {
    writeLabPixel(image.data, pixel.offset, labForTriangleWeights(pixel.weights, hue));
  }

  context.putImageData(image, 0, 0);
  const vertices = triangleVertices();
  context.save?.();
  context.lineWidth = 1;
  context.strokeStyle = "rgba(255,255,255,.16)";
  context.beginPath();
  context.arc(WHEEL_CENTER, WHEEL_CENTER, WHEEL_OUTER_RADIUS - 0.5, 0, TAU);
  context.stroke();
  context.beginPath();
  context.arc(WHEEL_CENTER, WHEEL_CENTER, WHEEL_INNER_RADIUS + 0.5, 0, TAU);
  context.stroke();
  context.strokeStyle = "rgba(0,0,0,.48)";
  context.beginPath();
  context.moveTo(vertices.hue.x, vertices.hue.y);
  context.lineTo(vertices.white.x, vertices.white.y);
  context.lineTo(vertices.black.x, vertices.black.y);
  context.closePath();
  context.stroke();
  context.restore?.();
  wheelDrawState.set(canvas, key);
  return true;
}

export function syncColorPickerInput(input) {
  const picker = input?.[PICKER_KEY];
  if (picker) picker.syncFromInput();
}

export function attachColorPicker(input, options = {}) {
  if (!input || input[PICKER_KEY]) return input?.[PICKER_KEY] || null;

  const doc = input.ownerDocument || globalThis.document;
  const label = options.label || labelTextFor(input);
  let oklch = oklchFromHex(input.value || options.value || FALLBACK_HEX);
  let popover = null;
  let plane = null;
  let planeCursor = null;
  let hueCursor = null;
  let hexInput = null;
  let rgbOutput = null;
  let lightnessInput = null;
  let chromaInput = null;
  let hueNumberInput = null;
  let eyeDropperButton = null;
  let fallbackColorInput = null;
  let eyeDropperPicking = false;
  let dragMode = null;
  let dirty = false;
  let open = false;
  let triangleWeights = null;
  let pickerModelDirty = true;
  let modelHex = normalizeHexColor(input.value || options.value || FALLBACK_HEX, FALLBACK_HEX);
  let syncPopoverSwatch = null;

  input.type = "text";
  input.readOnly = true;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.classList.add("app-color-picker-input");
  input.setAttribute("role", "button");
  input.setAttribute("aria-haspopup", "dialog");
  input.setAttribute("aria-label", label);
  input.setAttribute("aria-expanded", "false");
  setInputPresentation(input, modelHex);

  function normalizedInputHex() {
    return normalizeHexColor(input.value || FALLBACK_HEX, FALLBACK_HEX);
  }

  function syncInputPresentation(hex = normalizedInputHex()) {
    const safe = normalizeHexColor(hex, FALLBACK_HEX);
    setInputPresentation(input, safe);
    input.classList.toggle("is-disabled", !!input.disabled);
    return safe;
  }

  function syncPickerModelFromHex(hex = normalizedInputHex()) {
    const safe = normalizeHexColor(hex, FALLBACK_HEX);
    oklch = oklchFromHex(safe, oklch.h);
    triangleWeights = triangleWeightsForOklch(oklch);
    modelHex = safe;
    pickerModelDirty = false;
    return safe;
  }

  function syncPickerModelFromInput() {
    return syncPickerModelFromHex(normalizedInputHex());
  }

  function renderPicker() {
    const fitted = fitOklchToDisplay(oklch);
    const hex = normalizeHexColor(input.value || fitted.hex, fitted.hex);
    const maxC = Math.max(0.0001, maxChromaFor(fitted.l, fitted.h));
    if (!triangleWeights) triangleWeights = triangleWeightsForOklch(oklch);
    setInputPresentation(input, hex);
    if (hexInput) {
      hexInput.value = hex;
      hexInput.title = colorInfoLabel(hex);
    }
    if (rgbOutput) rgbOutput.value = rgbCodeForHex(hex);
    if (lightnessInput) lightnessInput.value = formatNumber(fitted.l, 1);
    if (chromaInput) {
      chromaInput.max = formatNumber(maxC, 1);
      chromaInput.value = formatNumber(fitted.c, 1);
    }
    const hueDegrees = hueRadiansToDegrees(fitted.h);
    if (hueNumberInput) hueNumberInput.value = String(Math.round(hueDegrees));
    if (fallbackColorInput) fallbackColorInput.value = hex;
    if (planeCursor) {
      const point = trianglePointForWeights(triangleWeights);
      planeCursor.style.left = `${point.x / WHEEL_SIZE * 100}%`;
      planeCursor.style.top = `${point.y / WHEEL_SIZE * 100}%`;
    }
    if (hueCursor) {
      const x = WHEEL_CENTER + Math.cos(fitted.h) * WHEEL_MID_RADIUS;
      const y = WHEEL_CENTER + Math.sin(fitted.h) * WHEEL_MID_RADIUS;
      hueCursor.style.left = `${x / WHEEL_SIZE * 100}%`;
      hueCursor.style.top = `${y / WHEEL_SIZE * 100}%`;
    }
    drawOklchWheel(plane, fitted.h);
  }

  function emit(type, value = input.value) {
    input.dispatchEvent(eventFor(input, type, value));
  }

  function syncFromInputState() {
    const safe = normalizedInputHex();
    const needsModelSync = pickerModelDirty || safe !== modelHex;
    syncInputPresentation(safe);
    if (open && needsModelSync) {
      syncPickerModelFromHex(safe);
      renderPicker();
      syncPopoverSwatch?.();
    } else if (needsModelSync) {
      pickerModelDirty = true;
    }
  }

  function refreshAfterPropagation(swatchSync) {
    syncFromInputState();
    if (fallbackColorInput) fallbackColorInput.value = normalizeHexColor(input.value || FALLBACK_HEX, FALLBACK_HEX);
    swatchSync?.();
  }

  function queuePropagationRefresh(swatchSync) {
    Promise.resolve().then(() => refreshAfterPropagation(swatchSync));
    const raf = globalThis.window?.requestAnimationFrame || globalThis.requestAnimationFrame;
    if (typeof raf === "function") raf(() => refreshAfterPropagation(swatchSync));
    else globalThis.setTimeout?.(() => refreshAfterPropagation(swatchSync), 0);
  }

  function setHex(hex, {commit = false} = {}) {
    const safe = normalizeHexColor(hex, input.value || FALLBACK_HEX);
    const changed = safe !== input.value;
    syncPickerModelFromHex(safe);
    input.value = safe;
    renderPicker();
    if (changed) {
      dirty = !commit;
      emit("input", safe);
    }
    if (commit) {
      dirty = false;
      emit("change", safe);
    }
  }

  function applyPickedHex(hex, {commit = true, swatchSync = null} = {}) {
    const safe = normalizeHexColor(hex, "");
    if (!safe) return false;
    setHex(safe, {commit});
    refreshAfterPropagation(swatchSync);
    queuePropagationRefresh(swatchSync);
    return true;
  }

  function openFallbackColorInput(swatchSync) {
    if (!fallbackColorInput) return false;
    fallbackColorInput.value = normalizeHexColor(input.value || FALLBACK_HEX, FALLBACK_HEX);
    try {
      if (typeof fallbackColorInput.showPicker === "function") {
        fallbackColorInput.showPicker();
        refreshAfterPropagation(swatchSync);
        return true;
      }
    } catch {}
    if (typeof fallbackColorInput.click !== "function") return false;
    fallbackColorInput.click();
    refreshAfterPropagation(swatchSync);
    return true;
  }

  async function pickWithEyeDropper(swatchSync) {
    if (eyeDropperPicking) return;
    const EyeDropper = eyeDropperClass();
    if (!EyeDropper) {
      openFallbackColorInput(swatchSync);
      return;
    }

    let resultPromise;
    try {
      // Keep the native API call as the first real action in the click handler.
      // Some browsers are picky about transient user activation; DOM mutations can wait.
      resultPromise = new EyeDropper().open();
    } catch (error) {
      if (!eyeDropperWasCancelled(error)) openFallbackColorInput(swatchSync);
      return;
    }

    eyeDropperPicking = true;
    if (eyeDropperButton) {
      eyeDropperButton.disabled = true;
      eyeDropperButton.classList.add("is-picking");
      eyeDropperButton.setAttribute("aria-busy", "true");
    }
    try {
      const result = await resultPromise;
      if (!applyPickedHex(hexFromEyeDropperColor(result?.sRGBHex), {commit: true, swatchSync})) {
        openFallbackColorInput(swatchSync);
      }
    } catch (error) {
      if (!eyeDropperWasCancelled(error)) openFallbackColorInput(swatchSync);
    } finally {
      eyeDropperPicking = false;
      if (eyeDropperButton) {
        eyeDropperButton.disabled = false;
        eyeDropperButton.classList.remove("is-picking");
        eyeDropperButton.removeAttribute?.("aria-busy");
      }
    }
  }

  function applyOklch(next, {commit = false, syncTriangle = true} = {}) {
    const fitted = fitOklchToDisplay(next);
    oklch = {l: fitted.l, c: fitted.c, h: fitted.h};
    if (syncTriangle) triangleWeights = triangleWeightsForOklch(oklch);
    const changed = fitted.hex !== input.value;
    input.value = fitted.hex;
    modelHex = fitted.hex;
    pickerModelDirty = false;
    renderPicker();
    if (changed) {
      dirty = !commit;
      emit("input", fitted.hex);
    }
    if (commit) {
      dirty = false;
      emit("change", fitted.hex);
    }
  }

  function setOklch(next, {commit = false} = {}) {
    const previous = oklch;
    applyOklch({
      l: next.l ?? previous.l,
      c: next.c ?? previous.c,
      h: next.h ?? previous.h
    }, {commit});
  }

  function setHueFromWheel(hue, {commit = false} = {}) {
    const safeHue = normalizeHueRadians(hue);
    applyOklch(oklchForTriangleWeights(triangleWeights, safeHue), {commit, syncTriangle: false});
  }

  function setTriangleWeights(weights, {commit = false} = {}) {
    triangleWeights = normalizeTriangleWeights(weights);
    applyOklch(oklchForTriangleWeights(triangleWeights, oklch.h), {commit, syncTriangle: false});
  }

  function commitIfDirty() {
    if (!dirty) return;
    dirty = false;
    emit("change");
  }

  function closePicker({commit = true} = {}) {
    if (!open) return;
    open = false;
    dragMode = null;
    input.setAttribute("aria-expanded", "false");
    if (popover) popover.hidden = true;
    if (commit) commitIfDirty();
  }

  function ensurePopover() {
    if (popover || !doc?.body) return popover;

    popover = doc.createElement("div");
    popover.className = "app-color-picker-popover";
    popover.hidden = true;
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", label);

    const head = doc.createElement("div");
    head.className = "app-color-picker-head";
    const swatch = doc.createElement("span");
    swatch.className = "app-color-picker-current";
    swatch.setAttribute("aria-hidden", "true");
    const title = doc.createElement("strong");
    title.textContent = label;
    head.append(swatch, title);

    const planeWrap = doc.createElement("div");
    planeWrap.className = "app-color-picker-plane-wrap";
    plane = doc.createElement("canvas");
    plane.className = "app-color-picker-plane";
    plane.width = WHEEL_SIZE;
    plane.height = WHEEL_SIZE;
    plane.tabIndex = 0;
    plane.setAttribute("aria-label", "OKLCh hue wheel and lightness chroma triangle");
    hueCursor = doc.createElement("span");
    hueCursor.className = "app-color-picker-hue-cursor";
    hueCursor.setAttribute("aria-hidden", "true");
    planeCursor = doc.createElement("span");
    planeCursor.className = "app-color-picker-plane-cursor";
    planeCursor.setAttribute("aria-hidden", "true");
    planeWrap.append(plane, hueCursor, planeCursor);

    const channelRow = doc.createElement("div");
    channelRow.className = "app-color-picker-oklch-row";
    lightnessInput = doc.createElement("input");
    lightnessInput.type = "number";
    lightnessInput.min = "0";
    lightnessInput.max = "100";
    lightnessInput.step = "0.1";
    lightnessInput.setAttribute("aria-label", "OKLCh lightness");
    chromaInput = doc.createElement("input");
    chromaInput.type = "number";
    chromaInput.min = "0";
    chromaInput.max = String(MAX_CHROMA);
    chromaInput.step = "0.1";
    chromaInput.setAttribute("aria-label", "OKLCh chroma");
    hueNumberInput = doc.createElement("input");
    hueNumberInput.type = "number";
    hueNumberInput.min = "0";
    hueNumberInput.max = "359";
    hueNumberInput.step = "1";
    hueNumberInput.setAttribute("aria-label", "OKLCh hue degrees");
    channelRow.append(
      labelledField(doc, "L", lightnessInput),
      labelledField(doc, "C", chromaInput),
      labelledField(doc, "H°", hueNumberInput)
    );

    const rgbRow = doc.createElement("label");
    rgbRow.className = "app-color-picker-code-row";
    const rgbLabel = doc.createElement("span");
    rgbLabel.textContent = "RGB";
    rgbOutput = doc.createElement("input");
    rgbOutput.type = "text";
    rgbOutput.readOnly = true;
    rgbOutput.spellcheck = false;
    rgbOutput.setAttribute("aria-label", "RGB color code");
    rgbRow.append(rgbLabel, rgbOutput);

    const hexRow = doc.createElement("div");
    hexRow.className = "app-color-picker-hex-row";
    const hexField = doc.createElement("label");
    hexField.className = "app-color-picker-code-row";
    const hexLabel = doc.createElement("span");
    hexLabel.textContent = "HEX";
    hexInput = doc.createElement("input");
    hexInput.type = "text";
    hexInput.spellcheck = false;
    hexInput.inputMode = "text";
    hexInput.setAttribute("aria-label", "Hex color code");
    hexField.append(hexLabel, hexInput);
    eyeDropperButton = doc.createElement("button");
    eyeDropperButton.type = "button";
    eyeDropperButton.className = "app-color-picker-eyedropper";
    eyeDropperButton.textContent = "Pick";
    eyeDropperButton.title = eyeDropperClass()
      ? "Pick a color from the screen"
      : "Pick a color with the browser color picker";
    eyeDropperButton.setAttribute("aria-label", "Pick a color from the screen");
    fallbackColorInput = doc.createElement("input");
    fallbackColorInput.type = "color";
    fallbackColorInput.className = "app-color-picker-native-color";
    fallbackColorInput.tabIndex = -1;
    fallbackColorInput.setAttribute("aria-hidden", "true");
    fallbackColorInput.value = normalizeHexColor(input.value || FALLBACK_HEX, FALLBACK_HEX);
    const done = doc.createElement("button");
    done.type = "button";
    done.textContent = "Done";
    hexRow.append(hexField, eyeDropperButton, done, fallbackColorInput);

    popover.append(head, planeWrap, channelRow, rgbRow, hexRow);
    doc.body.append(popover);

    const swatchSync = () => {
      const colorInfo = colorInfoLabel(input.value);
      swatch.style.background = input.value;
      swatch.title = colorInfo;
      if (hexInput) hexInput.title = colorInfo;
    };
    syncPopoverSwatch = swatchSync;

    const canvasPointForEvent = event => {
      const rect = plane.getBoundingClientRect();
      const x = clamp((event.clientX - rect.left) / Math.max(1, rect.width)) * WHEEL_SIZE;
      const y = clamp((event.clientY - rect.top) / Math.max(1, rect.height)) * WHEEL_SIZE;
      return {x, y};
    };

    const applyPointerToWheel = event => {
      const point = canvasPointForEvent(event);
      const dx = point.x - WHEEL_CENTER;
      const dy = point.y - WHEEL_CENTER;
      setHueFromWheel(normalizeHueRadians(Math.atan2(dy, dx)));
      swatchSync();
    };

    const applyPointerToTriangle = event => {
      const point = closestPointOnTriangle(canvasPointForEvent(event));
      setTriangleWeights(barycentricForPoint(point));
      swatchSync();
    };

    const modeForPoint = point => {
      if (pointInTriangle(point)) return "triangle";
      const distance = Math.hypot(point.x - WHEEL_CENTER, point.y - WHEEL_CENTER);
      if (distance >= WHEEL_INNER_RADIUS - WHEEL_HIT_INSET && distance <= WHEEL_OUTER_RADIUS + WHEEL_HIT_OUTSET) return "hue";
      return "triangle";
    };

    plane.addEventListener("pointerdown", event => {
      event.preventDefault();
      plane.setPointerCapture?.(event.pointerId);
      dragMode = modeForPoint(canvasPointForEvent(event));
      if (dragMode === "hue") applyPointerToWheel(event);
      else applyPointerToTriangle(event);
    });
    plane.addEventListener("pointermove", event => {
      if (event.buttons !== 1 || !dragMode) return;
      if (dragMode === "hue") applyPointerToWheel(event);
      else applyPointerToTriangle(event);
    });
    plane.addEventListener("pointerup", event => {
      plane.releasePointerCapture?.(event.pointerId);
      dragMode = null;
      commitIfDirty();
    });
    plane.addEventListener("keydown", event => {
      const lStep = event.shiftKey ? 5 : 1;
      const cStep = event.shiftKey ? 2 : 0.5;
      const hStep = event.shiftKey ? 12 : 3;
      if (event.key === "ArrowLeft") setOklch({c: oklch.c - cStep});
      else if (event.key === "ArrowRight") setOklch({c: oklch.c + cStep});
      else if (event.key === "ArrowUp") setOklch({l: oklch.l + lStep});
      else if (event.key === "ArrowDown") setOklch({l: oklch.l - lStep});
      else if (event.key === "PageUp") setHueFromWheel(oklch.h + hStep * Math.PI / 180);
      else if (event.key === "PageDown") setHueFromWheel(oklch.h - hStep * Math.PI / 180);
      else return;
      event.preventDefault();
      swatchSync();
    });

    const applyChannelInputs = ({commit = false} = {}) => {
      setOklch({
        l: Number(lightnessInput.value),
        c: Number(chromaInput.value),
        h: hueDegreesToRadians(hueNumberInput.value)
      }, {commit});
      swatchSync();
    };
    for (const control of [lightnessInput, chromaInput, hueNumberInput]) {
      control.addEventListener("input", () => applyChannelInputs());
      control.addEventListener("change", () => applyChannelInputs({commit: true}));
    }

    eyeDropperButton.addEventListener("click", () => {
      pickWithEyeDropper(swatchSync);
    });
    fallbackColorInput.addEventListener("input", () => {
      applyPickedHex(fallbackColorInput.value, {commit: false, swatchSync});
    });
    fallbackColorInput.addEventListener("change", () => {
      applyPickedHex(fallbackColorInput.value, {commit: true, swatchSync});
    });

    hexInput.addEventListener("input", () => {
      if (/^#?[0-9a-f]{6}$/i.test(hexInput.value.trim())) {
        setHex(hexInput.value);
        swatchSync();
      }
    });
    hexInput.addEventListener("change", () => {
      setHex(hexInput.value, {commit: true});
      swatchSync();
    });
    done.addEventListener("click", () => {
      setHex(hexInput.value, {commit: true});
      closePicker({commit: false});
      input.focus?.();
    });
    popover.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePicker({commit: true});
        input.focus?.();
      }
    });
    return popover;
  }

  function openPicker({focus = true} = {}) {
    if (input.disabled) return;
    const panel = ensurePopover();
    if (!panel) return;
    open = true;
    input.setAttribute("aria-expanded", "true");
    syncPickerModelFromInput();
    renderPicker();
    syncPopoverSwatch?.();
    panel.hidden = false;
    positionPopover(input, panel);
    if (focus) hexInput?.focus?.();
  }

  function handleOutsidePointer(event) {
    if (!open) return;
    if (event.target === input || popover?.contains?.(event.target)) return;
    closePicker({commit: true});
  }

  input.addEventListener("pointerdown", event => {
    if (input.disabled) return;
    event.preventDefault();
    open ? closePicker({commit: true}) : openPicker({focus: true});
  });
  input.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPicker({focus: true});
    } else if (event.key === "Escape") {
      closePicker({commit: true});
    }
  });
  input.addEventListener("input", syncFromInputState);
  doc?.addEventListener?.("pointerdown", handleOutsidePointer, true);
  globalThis.window?.addEventListener?.("resize", () => open && positionPopover(input, popover));
  globalThis.window?.addEventListener?.("scroll", () => open && positionPopover(input, popover), true);

  const api = {
    open: openPicker,
    close: closePicker,
    syncFromInput: syncFromInputState,
    destroy() {
      closePicker({commit: false});
      popover?.remove?.();
      delete input[PICKER_KEY];
    }
  };

  input[PICKER_KEY] = api;
  api.syncFromInput();
  return api;
}

function labelledField(doc, label, input) {
  const wrap = doc.createElement("label");
  wrap.className = "app-color-picker-channel";
  const text = doc.createElement("span");
  text.textContent = label;
  wrap.append(text, input);
  return wrap;
}
