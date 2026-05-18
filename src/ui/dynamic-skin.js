import { labToHex } from "../color-utils.js";

export const DYNAMIC_SKIN_VARIABLES = [
  "--bg",
  "--panel",
  "--panel2",
  "--panel3",
  "--button-bg",
  "--button-bg-hover",
  "--text",
  "--muted",
  "--soft",
  "--line",
  "--line-strong",
  "--accent",
  "--skin-wash",
  "--shadow"
];

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
}

function rgbToHex(rgb) {
  return `#${rgb.map(channel => clampChannel(channel).toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex) {
  const match = String(hex || "").trim().match(/^#?([0-9a-f]{6})$/i);
  if (!match) return null;
  const value = match[1];
  return [0, 2, 4].map(index => parseInt(value.slice(index, index + 2), 16));
}

function mixRgb(a, b, amount = 0.5) {
  const t = Math.max(0, Math.min(1, amount));
  return [0, 1, 2].map(index => a[index] * (1 - t) + b[index] * t);
}

function srgbToLinear(channel) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb) {
  return 0.2126 * srgbToLinear(rgb[0]) + 0.7152 * srgbToLinear(rgb[1]) + 0.0722 * srgbToLinear(rgb[2]);
}

function saturationScore(rgb) {
  const high = Math.max(...rgb);
  const low = Math.min(...rgb);
  return high === 0 ? 0 : (high - low) / high;
}

function colorFromRecord(record) {
  if (!record || typeof record !== "object") return null;
  return hexToRgb(record.hex) || (Array.isArray(record.lab) ? hexToRgb(labToHex(record.lab)) : null);
}

export function dynamicSkinColors(records = []) {
  const colors = (Array.isArray(records) ? records : [])
    .map(colorFromRecord)
    .filter(Boolean);

  if (!colors.length) return null;

  const black = [6, 8, 11];
  const white = [242, 245, 249];
  const ranked = colors
    .map(rgb => ({rgb, luminance: relativeLuminance(rgb), saturation: saturationScore(rgb)}))
    .sort((a, b) => a.luminance - b.luminance);

  const darkest = ranked[0].rgb;
  const accentRecord = ranked
    .map(entry => ({
      ...entry,
      score: entry.saturation * 0.72 + (1 - Math.abs(entry.luminance - 0.48) / 0.48) * 0.28
    }))
    .sort((a, b) => b.score - a.score)[0];

  let accent = accentRecord.rgb;
  const accentLuma = relativeLuminance(accent);
  if (accentLuma < 0.25) accent = mixRgb(accent, white, 0.42);
  else if (accentLuma > 0.78) accent = mixRgb(accent, black, 0.22);

  const bg = mixRgb(black, darkest, 0.36);
  const panel = mixRgb(black, darkest, 0.54);
  const panel2 = mixRgb(black, darkest, 0.44);
  const panel3 = mixRgb(panel, accent, 0.13);
  const buttonBg = mixRgb(panel3, accent, 0.08);
  const buttonBgHover = mixRgb(panel3, accent, 0.18);
  const muted = mixRgb(white, accent, 0.30);
  const soft = mixRgb(white, accent, 0.18);
  const [r, g, b] = accent.map(clampChannel);

  return {
    "--bg": rgbToHex(bg),
    "--panel": rgbToHex(panel),
    "--panel2": rgbToHex(panel2),
    "--panel3": rgbToHex(panel3),
    "--button-bg": rgbToHex(buttonBg),
    "--button-bg-hover": rgbToHex(buttonBgHover),
    "--text": "#f4f6fb",
    "--muted": rgbToHex(muted),
    "--soft": rgbToHex(soft),
    "--line": `rgba(${r}, ${g}, ${b}, .24)`,
    "--line-strong": `rgba(${r}, ${g}, ${b}, .42)`,
    "--accent": rgbToHex(accent),
    "--skin-wash": `rgba(${r}, ${g}, ${b}, .12)`,
    "--shadow": "0 12px 32px rgba(0,0,0,.34)"
  };
}

function setCssVariable(style, name, value) {
  if (!style) return;
  if (typeof style.setProperty === "function") style.setProperty(name, value);
  else style[name] = value;
}

function removeCssVariable(style, name) {
  if (!style) return;
  if (typeof style.removeProperty === "function") style.removeProperty(name);
  else delete style[name];
}

export function clearDynamicUiSkin(root = globalThis.document) {
  const doc = root?.ownerDocument || root;
  const target = doc?.documentElement || doc?.body || null;
  const body = doc?.body || null;
  for (const name of DYNAMIC_SKIN_VARIABLES) removeCssVariable(target?.style, name);
  if (body?.dataset) delete body.dataset.uiSkin;
}

export function syncDynamicUiSkin({enabled = false, records = [], root = globalThis.document} = {}) {
  const doc = root?.ownerDocument || root;
  const target = doc?.documentElement || doc?.body || null;
  const body = doc?.body || null;
  if (!enabled) {
    clearDynamicUiSkin(doc);
    return null;
  }

  const colors = dynamicSkinColors(records);
  if (!colors || !target) {
    clearDynamicUiSkin(doc);
    return null;
  }

  for (const [name, value] of Object.entries(colors)) setCssVariable(target.style, name, value);
  if (body?.dataset) body.dataset.uiSkin = "palette";
  return colors;
}
