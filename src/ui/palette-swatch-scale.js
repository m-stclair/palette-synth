import { normalizePaletteSwatchScale, nextPaletteSwatchScale } from "../state/config.js";
import { $ } from "./dom.js";

export const PALETTE_SWATCH_SCALE_HOTKEY = "Shift+P";

function setStyleProperty(style, key, value) {
  if (!style) return;
  if (typeof style.setProperty === "function") style.setProperty(key, value);
  else style[key] = value;
}

export function paletteSwatchScaleLabel(value) {
  return `${normalizePaletteSwatchScale(value)}×`;
}

function elementById(id, root) {
  return root && typeof root.getElementById === "function" ? $(id, root) : null;
}

export function syncPaletteSwatchScaleUi({config = {}, els = {}, root = globalThis.document} = {}) {
  const scale = normalizePaletteSwatchScale(config.paletteSwatchScale);
  config.paletteSwatchScale = scale;

  const preview = els.palettePreview || elementById("palettePreview", root);
  if (preview) {
    setStyleProperty(preview.style, "--palette-swatch-scale", String(scale));
    if (preview.dataset) preview.dataset.swatchScale = String(scale);
  }

  const toggle = els.paletteSwatchScaleToggle || elementById("paletteSwatchScaleToggle", root);
  if (toggle) {
    const label = paletteSwatchScaleLabel(scale);
    toggle.textContent = label;
    toggle.value = String(scale);
    toggle.title = `Palette swatch size: ${label}. Click or press ${PALETTE_SWATCH_SCALE_HOTKEY} to cycle 1× / 2× / 3×.`;
    toggle.setAttribute?.("aria-label", `Palette swatch size ${label}; cycle size`);
    toggle.setAttribute?.("aria-keyshortcuts", PALETTE_SWATCH_SCALE_HOTKEY);
    toggle.setAttribute?.("aria-pressed", String(scale > 1));
  }

  return scale;
}

export function cyclePaletteSwatchScale({config = {}, els = {}, root = globalThis.document, setStatus = () => {}, announce = true} = {}) {
  config.paletteSwatchScale = nextPaletteSwatchScale(config.paletteSwatchScale);
  const scale = syncPaletteSwatchScaleUi({config, els, root});
  if (announce) setStatus?.(`Palette swatches ${paletteSwatchScaleLabel(scale)}.`);
  return scale;
}
