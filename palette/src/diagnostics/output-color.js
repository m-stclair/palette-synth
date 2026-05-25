import {
  byteRgbToHex,
  clamp,
  clamp01,
  hexToByteRgb,
  labToHex,
  labToLinearRgb,
  linear2SRGB,
  rgb8ToLab
} from "../color-utils.js";

export function applyOutputModeCpu(sourceLab, paletteLab, config = {}) {
  if (config.outputMode === "preserveLuma") return [sourceLab[0], paletteLab[1], paletteLab[2]];
  if (config.outputMode === "preserveChroma") {
    const sourceC = Math.hypot(sourceLab[1], sourceLab[2]);
    const paletteC = Math.hypot(paletteLab[1], paletteLab[2]);
    const hue = paletteC > 1e-6 ? [paletteLab[1] / paletteC, paletteLab[2] / paletteC] : (sourceC > 1e-6 ? [sourceLab[1] / sourceC, sourceLab[2] / sourceC] : [1, 0]);
    return [paletteLab[0], hue[0] * sourceC, hue[1] * sourceC];
  }
  if (config.outputMode === "hueWash") {
    const sourceC = Math.hypot(sourceLab[1], sourceLab[2]);
    const paletteC = Math.hypot(paletteLab[1], paletteLab[2]);
    const hue = paletteC > 1e-6 ? [paletteLab[1] / paletteC, paletteLab[2] / paletteC] : (sourceC > 1e-6 ? [sourceLab[1] / sourceC, sourceLab[2] / sourceC] : [1, 0]);
    return [sourceLab[0], hue[0] * sourceC, hue[1] * sourceC];
  }
  if (config.outputMode === "shadowHighlight") {
    const lo = Math.min(Number(config.shadowCutoff) || 0, Number(config.highlightCutoff) || 0);
    const hi = Math.max(Number(config.shadowCutoff) || 0, Number(config.highlightCutoff) || 0);
    return (sourceLab[0] <= lo || sourceLab[0] >= hi) ? paletteLab : sourceLab;
  }
  return paletteLab;
}

export function labToSrgb01(lab) {
  return labToLinearRgb(lab).map(channel => clamp(linear2SRGB(channel), 0, 1));
}

export function blendRgbBytes(sourceRgb, fxRgb01, amount = 1) {
  const t = clamp01(Number(amount));
  const srcR = clamp(Number(sourceRgb?.[0]) || 0, 0, 255) / 255;
  const srcG = clamp(Number(sourceRgb?.[1]) || 0, 0, 255) / 255;
  const srcB = clamp(Number(sourceRgb?.[2]) || 0, 0, 255) / 255;
  const fxR = clamp(Number(fxRgb01?.[0]) || 0, 0, 1);
  const fxG = clamp(Number(fxRgb01?.[1]) || 0, 0, 1);
  const fxB = clamp(Number(fxRgb01?.[2]) || 0, 0, 1);
  return [
    (srcR + (fxR - srcR) * t) * 255,
    (srcG + (fxG - srcG) * t) * 255,
    (srcB + (fxB - srcB) * t) * 255
  ];
}

export function finalOutputRgbForLab(sourceRgb, outputLab, amount = 1) {
  return blendRgbBytes(sourceRgb, labToSrgb01(outputLab), amount);
}

export function finalOutputLabForLab(sourceRgb, outputLab, amount = 1) {
  const [r, g, b] = finalOutputRgbForLab(sourceRgb, outputLab, amount);
  return rgb8ToLab(r, g, b);
}

export function blendHexes(sourceHex, fxHex, amount = 1) {
  const src = hexToByteRgb(sourceHex);
  const fx = hexToByteRgb(fxHex);
  const t = clamp01(Number(amount));
  return byteRgbToHex(
    src[0] + (fx[0] - src[0]) * t,
    src[1] + (fx[1] - src[1]) * t,
    src[2] + (fx[2] - src[2]) * t
  );
}

export function finalOutputHexForLab(sourceRgb, outputLab, amount = 1) {
  const [r, g, b] = finalOutputRgbForLab(sourceRgb, outputLab, amount);
  return byteRgbToHex(r, g, b);
}

export function outputLabToHex(outputLab) {
  return labToHex(outputLab);
}
