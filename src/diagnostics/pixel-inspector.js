import {
  CLEAR_HUE_CHROMA,
  HUE_DISTANCE_SCALE,
  NEUTRAL_CHROMA_EPSILON
} from "../constants.js";

import {
  byteRgbToHex,
  clamp,
  labDistanceComponents,
  linear2SRGB,
  rgb8ToLab,
  sRGB2Linear,
  smoothstep
} from "../color-utils.js";
import { cpuDistanceBreakdown, DIAGNOSTIC } from "./metrics.js";
import { applyOutputModeCpu, blendHexes, finalOutputHexForLab, finalOutputLabForLab, finalOutputRgbForLab, outputLabToHex } from "./output-color.js";

/** @typedef {import("../types.d.ts").AppConfig} AppConfig */
/** @typedef {import("../types.d.ts").ImageDataSource} ImageDataSource */
/** @typedef {import("../types.d.ts").PaletteRecord} PaletteRecord */
/** @typedef {import("../types.d.ts").PixelInspection} PixelInspection */

export { applyOutputModeCpu, blendHexes };


export function createPixelAnalysisContext({
  paletteRecords = [],
  ensurePalette = () => {},
  renderPaletteLabs,
  paletteUniformEntries
} = {}) {
  const ensuredPaletteRecords = ensurePalette?.();
  const resolvedPaletteRecords = typeof paletteRecords === "function"
    ? paletteRecords()
    : (Array.isArray(ensuredPaletteRecords) ? ensuredPaletteRecords : paletteRecords);
  const records = Array.isArray(resolvedPaletteRecords) ? resolvedPaletteRecords : [];
  const renderLabs = renderPaletteLabs?.(records) || [];
  const entries = paletteUniformEntries?.(records, renderLabs) || [];
  return {records, renderLabs, entries};
}

function resolvePixelAnalysisContext({
  paletteContext = null,
  paletteRecords = [],
  ensurePalette = () => {},
  renderPaletteLabs,
  paletteUniformEntries
} = {}) {
  if (paletteContext && Array.isArray(paletteContext.entries)) {
    return {
      records: Array.isArray(paletteContext.records) ? paletteContext.records : [],
      renderLabs: Array.isArray(paletteContext.renderLabs) ? paletteContext.renderLabs : [],
      entries: paletteContext.entries
    };
  }
  return createPixelAnalysisContext({paletteRecords, ensurePalette, renderPaletteLabs, paletteUniformEntries});
}

export function labDeltaParts(aLab, bLab, config = {}) {
  const aC = Math.hypot(aLab?.[1] || 0, aLab?.[2] || 0);
  const bC = Math.hypot(bLab?.[1] || 0, bLab?.[2] || 0);
  const aHue = aC > 1e-6 ? [(aLab[1] || 0) / aC, (aLab[2] || 0) / aC] : [1, 0];
  const bHue = bC > 1e-6 ? [(bLab[1] || 0) / bC, (bLab[2] || 0) / bC] : [1, 0];
  const theta = clamp(aHue[0] * bHue[0] + aHue[1] * bHue[1], -1, 1);
  const aHasHue = aC >= NEUTRAL_CHROMA_EPSILON;
  const bHasHue = bC >= NEUTRAL_CHROMA_EPSILON;
  const hueSuppressed = !(aHasHue && bHasHue) && !(config.neutralIsCategory && aHasHue !== bHasHue);
  const hue = hueSuppressed
    ? 0
    : HUE_DISTANCE_SCALE
      * (aHasHue && bHasHue
        ? smoothstep(NEUTRAL_CHROMA_EPSILON, CLEAR_HUE_CHROMA, Math.min(aC, bC)) * Math.sqrt(Math.max(0, 2 - 2 * theta))
        : smoothstep(NEUTRAL_CHROMA_EPSILON, CLEAR_HUE_CHROMA, aHasHue ? aC : bC) * Math.SQRT2);
  return {
    luma: Math.abs((aLab?.[0] || 0) - (bLab?.[0] || 0)),
    chroma: Math.abs(aC - bC),
    hue: Math.abs(hue)
  };
}

export function snapPixelBlockPoint(x, y, width, height, pixelBlockSize = 1) {
  const pxX = clamp(Math.floor(Number(x) || 0), 0, width - 1);
  const pxY = clamp(Math.floor(Number(y) || 0), 0, height - 1);
  const blockSize = Math.max(1, Math.round(Number(pixelBlockSize) || 1));

  if (blockSize <= 1) return {x: pxX, y: pxY};

  const blockOriginX = Math.floor(pxX / blockSize) * blockSize;
  const blockOriginY = Math.floor(pxY / blockSize) * blockSize;
  return {
    x: Math.min(blockOriginX + Math.floor(blockSize * 0.5), width - 1),
    y: Math.min(blockOriginY + Math.floor(blockSize * 0.5), height - 1)
  };
}


export function samplePixelBlockColor(imageData, x, y, pixelBlockSize = 1, sampleMode = "center") {
  if (!imageData?.data || !imageData.width || !imageData.height) return null;
  const pxX = clamp(Math.floor(Number(x) || 0), 0, imageData.width - 1);
  const pxY = clamp(Math.floor(Number(y) || 0), 0, imageData.height - 1);
  const blockSize = Math.max(1, Math.round(Number(pixelBlockSize) || 1));

  if (blockSize <= 1 || !["mean", "representative"].includes(sampleMode)) {
    const sourcePoint = snapPixelBlockPoint(pxX, pxY, imageData.width, imageData.height, blockSize);
    const offset = (sourcePoint.y * imageData.width + sourcePoint.x) * 4;
    return {
      x: sourcePoint.x,
      y: sourcePoint.y,
      r: imageData.data[offset],
      g: imageData.data[offset + 1],
      b: imageData.data[offset + 2],
      a: imageData.data[offset + 3]
    };
  }

  const blockOriginX = Math.floor(pxX / blockSize) * blockSize;
  const blockOriginY = Math.floor(pxY / blockSize) * blockSize;
  const blockEndX = Math.min(blockOriginX + blockSize, imageData.width);
  const blockEndY = Math.min(blockOriginY + blockSize, imageData.height);
  let weightedR = 0;
  let weightedG = 0;
  let weightedB = 0;
  let alphaWeight = 0;
  let alphaSum = 0;
  let sampleCount = 0;

  for (let yy = blockOriginY; yy < blockEndY; yy++) {
    for (let xx = blockOriginX; xx < blockEndX; xx++) {
      const offset = (yy * imageData.width + xx) * 4;
      const alpha = imageData.data[offset + 3] / 255;
      weightedR += sRGB2Linear(imageData.data[offset] / 255) * alpha;
      weightedG += sRGB2Linear(imageData.data[offset + 1] / 255) * alpha;
      weightedB += sRGB2Linear(imageData.data[offset + 2] / 255) * alpha;
      alphaWeight += alpha;
      alphaSum += alpha;
      sampleCount += 1;
    }
  }

  const sourcePoint = snapPixelBlockPoint(pxX, pxY, imageData.width, imageData.height, blockSize);
  if (sampleCount <= 0) {
    const offset = (sourcePoint.y * imageData.width + sourcePoint.x) * 4;
    return {
      x: sourcePoint.x,
      y: sourcePoint.y,
      r: imageData.data[offset],
      g: imageData.data[offset + 1],
      b: imageData.data[offset + 2],
      a: imageData.data[offset + 3]
    };
  }

  if (sampleMode === "representative") {
    const targetAlpha = alphaSum / sampleCount;
    const targetPremultiplied = alphaWeight > 0
      ? [weightedR / sampleCount, weightedG / sampleCount, weightedB / sampleCount]
      : [0, 0, 0];
    let best = {x: sourcePoint.x, y: sourcePoint.y, distance: Infinity};

    for (let yy = blockOriginY; yy < blockEndY; yy++) {
      for (let xx = blockOriginX; xx < blockEndX; xx++) {
        const offset = (yy * imageData.width + xx) * 4;
        const alpha = imageData.data[offset + 3] / 255;
        const premultipliedR = sRGB2Linear(imageData.data[offset] / 255) * alpha;
        const premultipliedG = sRGB2Linear(imageData.data[offset + 1] / 255) * alpha;
        const premultipliedB = sRGB2Linear(imageData.data[offset + 2] / 255) * alpha;
        const dr = premultipliedR - targetPremultiplied[0];
        const dg = premultipliedG - targetPremultiplied[1];
        const db = premultipliedB - targetPremultiplied[2];
        const da = alpha - targetAlpha;
        const distance = dr * dr + dg * dg + db * db + da * da;
        if (distance < best.distance) best = {x: xx, y: yy, distance};
      }
    }

    const offset = (best.y * imageData.width + best.x) * 4;
    return {
      x: best.x,
      y: best.y,
      r: imageData.data[offset],
      g: imageData.data[offset + 1],
      b: imageData.data[offset + 2],
      a: imageData.data[offset + 3]
    };
  }

  if (alphaWeight <= 0) {
    return {x: sourcePoint.x, y: sourcePoint.y, r: 0, g: 0, b: 0, a: 0};
  }

  return {
    x: sourcePoint.x,
    y: sourcePoint.y,
    r: linear2SRGB(weightedR / alphaWeight) * 255,
    g: linear2SRGB(weightedG / alphaWeight) * 255,
    b: linear2SRGB(weightedB / alphaWeight) * 255,
    a: (alphaSum / sampleCount) * 255
  };
}

/**
 * @param {Object} options
 * @param {number} options.x
 * @param {number} options.y
 * @param {ImageDataSource|null} options.imageData
 * @param {PaletteRecord[]|(() => PaletteRecord[])} [options.paletteRecords]
 * @param {AppConfig|Object} [options.config]
 * @returns {PixelInspection|null}
 */
export function analyzePixelAtImagePoint({
  x,
  y,
  imageData,
  paletteRecords = [],
  config = {},
  ensurePalette = () => {},
  renderPaletteLabs,
  paletteUniformEntries,
  paletteContext = null,
  topPaletteMatches,
  assignmentWeights,
  matchLimit = DIAGNOSTIC.matchLimit
} = {}) {
  if (!imageData) return null;
  const sourceColor = samplePixelBlockColor(imageData, x, y, config.pixelBlockSize, config.pixelBlockSampleMode);
  if (!sourceColor) return null;
  const pxX = sourceColor.x;
  const pxY = sourceColor.y;
  const r = sourceColor.r;
  const g = sourceColor.g;
  const b = sourceColor.b;
  const sourceHex = byteRgbToHex(r, g, b);
  const sourceLab = rgb8ToLab(r, g, b);
  const {records, entries} = resolvePixelAnalysisContext({
    paletteContext,
    paletteRecords,
    ensurePalette,
    renderPaletteLabs,
    paletteUniformEntries
  });
  const matches = topPaletteMatches?.(sourceLab, entries, matchLimit) || [];
  const weights = assignmentWeights?.(matches, sourceLab) || matches.map(() => 0);

  // Principled mapped Lab using the same weights the sampler uses.
  //   blend  : actual weighted mix (matches the shader's blended output).
  //   dither : per-pixel expectation (the shader picks best-or-second
  //            discretely per pixel via a GPU-side threshold matrix; the
  //            inspector reports the expected color and exposes the share
  //            via the per-row mix percentage).
  //   nearest: equals the winner.
  let mappedLab = [0, 0, 0];
  let totalWeight = 0;
  for (let i = 0; i < matches.length; i++) {
    const w = weights[i];
    if (!(w > 0)) continue;
    totalWeight += w;
    mappedLab[0] += matches[i].renderLab[0] * w;
    mappedLab[1] += matches[i].renderLab[1] * w;
    mappedLab[2] += matches[i].renderLab[2] * w;
  }
  if (totalWeight <= 0) mappedLab = [...sourceLab];
  const outputLab = applyOutputModeCpu(sourceLab, mappedLab, config);
  const fxHex = outputLabToHex(outputLab);
  const finalHex = finalOutputHexForLab([r, g, b], outputLab, config.blendAmount);
  const finalLab = finalOutputLabForLab([r, g, b], outputLab, config.blendAmount);
  const sourceParts = labDistanceComponents(sourceLab);
  const finalParts = labDistanceComponents(finalLab);
  const outputParts = labDistanceComponents(outputLab);
  const blendDelta = cpuDistanceBreakdown(
    sourceParts.lightness,
    sourceParts.chroma,
    sourceParts.scaledHue,
    finalParts.lightness,
    finalParts.chroma,
    finalParts.scaledHue,
    config
  );
  const fxDelta = cpuDistanceBreakdown(
    sourceParts.lightness,
    sourceParts.chroma,
    sourceParts.scaledHue,
    outputParts.lightness,
    outputParts.chroma,
    outputParts.scaledHue,
    config
  );
  return {
    x: pxX,
    y: pxY,
    sourceHex,
    sourceLab,
    matches,
    weights,
    mappedLab,
    outputLab,
    fxHex,
    finalHex,
    finalLab,
    fxDelta,
    blendDelta,
    // Backward-compatible aliases for callers/tests that still use the older
    // "final"/"output" wording. The UI now labels this as blend only
    // when blendAmount actually contributes.
    finalDelta: blendDelta,
    outputDelta: blendDelta,
    assigned: totalWeight > 0 ? matches[0] : null
  };
}

export function sampleFinalOutputPixelAtImagePoint({
  x,
  y,
  imageData,
  paletteContext = null,
  paletteRecords = [],
  config = {},
  ensurePalette = () => {},
  renderPaletteLabs,
  paletteUniformEntries,
  topPaletteMatches,
  assignmentWeights,
  matchLimit = DIAGNOSTIC.matchLimit
} = {}) {
  if (!imageData) return null;
  const sourceColor = samplePixelBlockColor(imageData, x, y, config.pixelBlockSize, config.pixelBlockSampleMode);
  if (!sourceColor) return null;
  const r = sourceColor.r;
  const g = sourceColor.g;
  const b = sourceColor.b;
  const sourceLab = rgb8ToLab(r, g, b);
  const {entries} = resolvePixelAnalysisContext({
    paletteContext,
    paletteRecords,
    ensurePalette,
    renderPaletteLabs,
    paletteUniformEntries
  });
  const matches = topPaletteMatches?.(sourceLab, entries, matchLimit) || [];
  const weights = assignmentWeights?.(matches, sourceLab) || matches.map(() => 0);
  let mappedLab = [0, 0, 0];
  let totalWeight = 0;
  for (let i = 0; i < matches.length; i++) {
    const w = weights[i];
    if (!(w > 0)) continue;
    totalWeight += w;
    mappedLab[0] += matches[i].renderLab[0] * w;
    mappedLab[1] += matches[i].renderLab[1] * w;
    mappedLab[2] += matches[i].renderLab[2] * w;
  }
  if (totalWeight <= 0) mappedLab = [...sourceLab];
  const outputLab = applyOutputModeCpu(sourceLab, mappedLab, config);
  const rgb = finalOutputRgbForLab([r, g, b], outputLab, config.blendAmount);
  return {
    x: sourceColor.x,
    y: sourceColor.y,
    r: rgb[0],
    g: rgb[1],
    b: rgb[2],
    a: sourceColor.a,
    rgb
  };
}
