import {
  MAX_PALETTE_SIZE,
  NEUTRAL_CHROMA_EPSILON,
  OKLAB_SCALE,
  TAU
} from "./constants.js";
import { manualCycleKeyForId, sanitizeManualSwatchId } from "./manual/ids.js";

export { manualCycleKeyForId, sanitizeManualSwatchId };

export function $(id) { return document.getElementById(id); }

export function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
export function clamp01(x) { return clamp(x, 0, 1); }

export function positiveMod(value, modulus) {
    const n = Math.trunc(Number(value));
    const m = Math.trunc(Number(modulus));
    if (!Number.isFinite(n) || !Number.isFinite(m) || m <= 0) return 0;
    return ((n % m) + m) % m;
  }

export function gcdInt(a, b) {
    let x = Math.abs(Math.round(Number(a) || 0));
    let y = Math.abs(Math.round(Number(b) || 0));
    while (y) {
      const t = x % y;
      x = y;
      y = t;
    }
    return x || 1;
  }

export function seededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function sRGB2Linear(channel) {
    return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  }

export function linear2SRGB(channel) {
    return channel <= 0.0031308 ? 12.92 * channel : 1.055 * Math.pow(Math.max(channel, 0), 1 / 2.4) - 0.055;
  }

  // OKLab is stored in the existing palette fields as [L*100, a*100, b*100].
  // That keeps the UI's lightness sliders, thresholds, and saved-record shape stable.
export function linearRgbToLab(r, g, b) {
    const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

    const l_ = Math.cbrt(Math.max(l, 0));
    const m_ = Math.cbrt(Math.max(m, 0));
    const s_ = Math.cbrt(Math.max(s, 0));

    const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
    const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
    const b2 = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

    return [L * OKLAB_SCALE, a * OKLAB_SCALE, b2 * OKLAB_SCALE];
  }

export function labToLinearRgbRaw([L, a, b]) {
    const L0 = L / OKLAB_SCALE;
    const a0 = a / OKLAB_SCALE;
    const b0 = b / OKLAB_SCALE;

    const l_ = L0 + 0.3963377774 * a0 + 0.2158037573 * b0;
    const m_ = L0 - 0.1055613458 * a0 - 0.0638541728 * b0;
    const s_ = L0 - 0.0894841775 * a0 - 1.2914855480 * b0;

    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;

    return [
      +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    ];
  }

export function labToLinearRgb(lab) {
    return labToLinearRgbRaw(lab).map(v => clamp(v, 0, 1));
  }


export function rgb8ToLab(r, g, b) {
    return linearRgbToLab(sRGB2Linear(r / 255), sRGB2Linear(g / 255), sRGB2Linear(b / 255));
  }

export function normalizeHexColor(value, fallback = "#000000") {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    const short = trimmed.match(/^#?([0-9a-fA-F]{3})$/);
    if (short) return "#" + short[1].split("").map(ch => ch + ch).join("").toLowerCase();
    const full = trimmed.match(/^#?([0-9a-fA-F]{6})$/);
    if (full) return "#" + full[1].toLowerCase();
    return fallback;
  }

export function normalizeOptionalHexColor(value) {
    if (typeof value !== "string") return null;
    const normalized = normalizeHexColor(value, "");
    return normalized || null;
  }

export function normalizeManualLab(value) {
    if (!Array.isArray(value) || value.length < 3) return null;
    const lab = value.slice(0, 3).map(Number);
    if (!lab.every(Number.isFinite)) return null;
    return [clamp(lab[0], 0, 100), clamp(lab[1], -200, 200), clamp(lab[2], -200, 200)];
  }

export function hexToByteRgb(hex) {
    const safe = normalizeHexColor(hex).slice(1);
    return [0, 2, 4].map(i => Number.parseInt(safe.slice(i, i + 2), 16));
  }

export function byteRgbToHex(r, g, b) {
    return "#" + [r, g, b]
      .map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0"))
      .join("");
  }

export function hexToLab(hex) {
    const [r, g, b] = hexToByteRgb(hex);
    return rgb8ToLab(r, g, b);
  }

export function labToHex(lab) {
    const rgb = labToLinearRgb(lab).map(linear2SRGB).map(v => v * 255);
    return byteRgbToHex(rgb[0], rgb[1], rgb[2]);
  }

export function labToOklch([L, a, b]) {
    const C = Math.hypot(a, b);
    const h = C < NEUTRAL_CHROMA_EPSILON ? 0 : Math.atan2(b, a);
    return [L, C, h < 0 ? h + TAU : h];
  }

export function formatLch(lab, {prefix = "LCH"} = {}) {
    const safe = normalizeManualLab(lab);
    if (!safe) return "";
    const [L, C, h] = labToOklch(safe);
    const degrees = C < NEUTRAL_CHROMA_EPSILON ? 0 : h * 360 / TAU;
    return `${prefix} ${L.toFixed(1)} ${C.toFixed(1)} ${degrees.toFixed(0)}°`;
  }

export function colorInfoLabel(hex, lab = null) {
    const safeHex = normalizeHexColor(hex, "");
    // A visible swatch is painted from its sRGB hex. Generated records can keep
    // internal OKLab coordinates that clamp to that hex but do not equal the
    // displayed color, so tooltip LCH must prefer the normalized hex whenever
    // one is available. Lab remains a fallback for lab-only diagnostics.
    const safeLab = safeHex ? hexToLab(safeHex) : normalizeManualLab(lab);
    const lch = safeLab ? formatLch(safeLab) : "";
    if (safeHex && lch) return `${safeHex} · ${lch}`;
    return safeHex || lch || "";
  }

export function oklchToLab([L, C, h]) {
    const safeL = clamp(Number(L) || 0, 0, 100);
    const safeC = Math.max(0, Number(C) || 0);
    const safeH = Number.isFinite(Number(h)) ? Number(h) : 0;
    return [safeL, Math.cos(safeH) * safeC, Math.sin(safeH) * safeC];
  }

export function labInSrgbGamut(lab, epsilon = 1e-5) {
    const rgb = labToLinearRgbRaw(lab);
    return rgb.every(channel => channel >= -epsilon && channel <= 1 + epsilon);
  }

export function fitLabToSrgb(lab) {
    if (labInSrgbGamut(lab)) return lab;
    const [L, C, h] = labToOklch(lab);
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      const candidate = oklchToLab([L, mid, h]);
      if (labInSrgbGamut(candidate)) lo = mid;
      else hi = mid;
    }
    return oklchToLab([L, lo, h]);
  }

export function paletteChroma([_L, a, b]) { return Math.hypot(a, b); }
export function labDistanceComponents(lab) {
    const safe = Array.isArray(lab) ? lab : [0, 0, 0];
    const lightness = Number(safe[0]) || 0;
    const a = Number(safe[1]) || 0;
    const b = Number(safe[2]) || 0;
    const chroma = Math.hypot(a, b);
    const scaledHue = chroma > 0 ? [a / chroma, b / chroma] : [0, 0];
    return {lightness, chroma, scaledHue};
  }
export function paletteHue([_L, a, b]) {
    const h = Math.atan2(b, a);
    return h < 0 ? h + TAU : h;
  }
export function compareLightness(a, b) {
    return (a[0] - b[0]) || (paletteChroma(a) - paletteChroma(b)) || (paletteHue(a) - paletteHue(b));
  }
export function compareHueThenLightness(a, b) {
    const ca = paletteChroma(a);
    const cb = paletteChroma(b);
    const aNeutral = ca < NEUTRAL_CHROMA_EPSILON;
    const bNeutral = cb < NEUTRAL_CHROMA_EPSILON;
    if (aNeutral || bNeutral) {
      if (aNeutral !== bNeutral) return aNeutral ? -1 : 1;
      return compareLightness(a, b);
    }
    return (paletteHue(a) - paletteHue(b)) || (a[0] - b[0]) || (ca - cb);
  }
export function labDistance(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
export function sortLabWalkRecords(records, labForRecord = record => record.lab) {
    const remaining = [...records];
    if (remaining.length <= 1) return remaining;
    remaining.sort((a, b) => compareLightness(labForRecord(a), labForRecord(b)));
    const path = [remaining.shift()];
    while (remaining.length) {
      const lastLab = labForRecord(path[path.length - 1]);
      let bestIndex = 0;
      let bestDistance = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const candidateLab = labForRecord(remaining[i]);
        const d = labDistance(lastLab, candidateLab);
        if (d < bestDistance - 1e-9 || (Math.abs(d - bestDistance) <= 1e-9 && compareLightness(candidateLab, labForRecord(remaining[bestIndex])) < 0)) {
          bestDistance = d;
          bestIndex = i;
        }
      }
      path.push(remaining.splice(bestIndex, 1)[0]);
    }
    return path;
  }

export function makePaletteRecord({
    lab,
    source = "unknown",
    familyId = null,
    familyIndex = null,
    variant = "single",
    variantIndex = 0,
    sourceIndex = null,
    swatchId = null,
    seedLab = null,
    sourceLab = null,
    locked = false,
    lockId = null,
    role = "display"
  }) {
    const safeLab = [...lab];
    const {lightness, chroma, scaledHue} = labDistanceComponents(safeLab);
    return {
      id: source === "manual" && swatchId ? `manual:${swatchId}` : `${source}:${familyId ?? sourceIndex ?? "x"}:${variant}:${variantIndex}`,
      lab: safeLab,
      hex: labToHex(safeLab),
      lightness,
      chroma,
      scaledHue,
      source,
      familyId,
      familyIndex,
      variant,
      variantIndex,
      sourceIndex,
      swatchId,
      seedLab: seedLab ? [...seedLab] : null,
      sourceLab: sourceLab ? [...sourceLab] : (seedLab ? [...seedLab] : [...safeLab]),
      locked,
      lockId,
      role,
      cycleKey: source === "manual" && swatchId ? manualCycleKeyForId(swatchId) : `${source}:${familyId ?? sourceIndex ?? "x"}:${variant}:${variantIndex}`,
      displayIndex: null
    };
  }

export function withDisplayIndexes(records) {
    return records.map((record, displayIndex) => ({...record, displayIndex}));
  }

export function paletteLabs(records) {
    return records.map(record => record.lab);
  }

export function sortVariantBandRecords(records) {
    const families = new Map();
    const singles = [];
    for (const record of records) {
      if (record.familyId === null || record.familyId === undefined || !["base", "tint", "shade"].includes(record.variant)) {
        singles.push(record);
        continue;
      }
      if (!families.has(record.familyId)) families.set(record.familyId, {familyId: record.familyId, base: null, tint: null, shade: null, records: []});
      const family = families.get(record.familyId);
      family[record.variant] = record;
      family.records.push(record);
    }
    const completeFamilies = [];
    for (const family of families.values()) {
      if (family.base && family.tint && family.shade) completeFamilies.push(family);
      else singles.push(...family.records);
    }
    if (!completeFamilies.length) return [...records].sort((a, b) => compareLightness(a.lab, b.lab));
    const orderedFamilies = sortLabWalkRecords(completeFamilies, family => family.base.lab);
    return [
      ...orderedFamilies.map(family => family.shade),
      ...orderedFamilies.map(family => family.base),
      ...orderedFamilies.map(family => family.tint),
      ...singles.sort((a, b) => compareLightness(a.lab, b.lab))
    ];
  }

export function sortPaletteRecords(records, mode = "lightness") {
    let sorted;
    switch (mode) {
      case "variantBands": sorted = sortVariantBandRecords(records); break;
      case "hueFamilies": sorted = [...records].sort((a, b) => compareHueThenLightness(a.lab, b.lab)); break;
      case "labWalk": sorted = sortLabWalkRecords(records); break;
      case "lightness":
      default: sorted = [...records].sort((a, b) => compareLightness(a.lab, b.lab)); break;
    }
    return withDisplayIndexes(sorted.slice(0, MAX_PALETTE_SIZE));
  }

export function sortPalette(palette, mode = "lightness") {
    return paletteLabs(sortPaletteRecords(palette.map((lab, sourceIndex) => makePaletteRecord({lab, source: "legacy", sourceIndex})), mode));
  }

export function expandSwatchVariants([L, a, b], deltaL = 10, chromaExp = 1.0) {
    const C = Math.hypot(a, b);
    const h = Math.atan2(b, a);
    const chromaRef = 100;
    const Cn = clamp(C / chromaRef, 0, 2);
    const Cmod = chromaRef * Math.pow(Cn, chromaExp);
    const anew = Math.cos(h) * Cmod;
    const bnew = Math.sin(h) * Cmod;
    return [
      [L, anew, bnew],
      [clamp(L + deltaL, 0, 100), anew, bnew],
      [clamp(L - deltaL, 0, 100), anew, bnew]
    ];
  }

export function familyFootprint(seedLab, deltaL = 10, chromaExp = 1.0) {
    return expandSwatchVariants(seedLab, deltaL, chromaExp);
  }

export function familyDistance(aFamily, bFamily) {
    let best = Infinity;
    for (const aLab of aFamily) {
      for (const bLab of bFamily) {
        const distance = labDistance(aLab, bLab);
        if (distance < best) best = distance;
      }
    }
    return best;
  }

export function smoothstep(edge0, edge1, value) {
    if (edge0 === edge1) return value >= edge1 ? 1 : 0;
    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

export function hueDistanceRadians(aHue, bHue) {
    const d = Math.abs(aHue - bHue) % TAU;
    return Math.min(d, TAU - d);
  }

export function hueDistanceDegrees(aHue, bHue) {
    return hueDistanceRadians(aHue, bHue) * 180 / Math.PI;
  }

export function hueReliabilityForChroma(chroma) {
    return smoothstep(3, 6, chroma);
  }

export function hueInfoForSeedLab(lab) {
    const safe = Array.isArray(lab) ? lab : [0, 0, 0];
    const chroma = Math.hypot(Number(safe[1]) || 0, Number(safe[2]) || 0);
    return {
      hue: paletteHue(safe),
      chroma,
      reliability: hueReliabilityForChroma(chroma)
    };
  }

export function nearestHueAnchorMatch(candidate, selectedHueAnchors) {
    const anchors = Array.isArray(selectedHueAnchors) ? selectedHueAnchors : [];
    const reliableAnchors = anchors
      .map((anchor, index) => ({...anchor, index}))
      .filter(anchor => anchor.reliability > 0.05);
    if (!reliableAnchors.length || candidate.reliability <= 0.01) {
      return {
        raw: 0,
        distanceDegrees: Infinity,
        index: -1,
        anchorCount: anchors.length,
        reliableAnchorCount: reliableAnchors.length,
        candidateChroma: candidate.chroma,
        candidateReliability: candidate.reliability,
        anchorReliability: 0
      };
    }
    let nearest = Infinity;
    let nearestIndex = -1;
    let nearestReliability = 0;
    for (const anchor of reliableAnchors) {
      const distance = hueDistanceDegrees(candidate.hue, anchor.hue);
      if (distance < nearest) {
        nearest = distance;
        nearestIndex = anchor.index;
        nearestReliability = anchor.reliability;
      }
    }
    return {
      raw: clamp(smoothstep(5, 90, nearest) * candidate.reliability * nearestReliability, 0, 1),
      distanceDegrees: nearest,
      index: nearestIndex,
      anchorCount: anchors.length,
      reliableAnchorCount: reliableAnchors.length,
      candidateChroma: candidate.chroma,
      candidateReliability: candidate.reliability,
      anchorReliability: nearestReliability
    };
  }
