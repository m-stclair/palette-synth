import { MAX_PALETTE_SIZE } from "../constants.js";
import { normalizeHexColor } from "../color-utils.js";
import { readJsonStorage, writeJsonStorage } from "./local-storage.js";

const MANUAL_PRESET_STORAGE_KEY = "paletteSynth.manualPresets.v1";

function sanitizePresetId(value, fallback = "palette") {
  const clean = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return clean || fallback;
}

function sanitizePresetName(name, fallback = "Captured palette") {
  const clean = String(name || "").replace(/\s+/g, " ").trim().slice(0, 80);
  return clean || fallback;
}

export function createManualPresetId(name = "palette") {
  const slug = sanitizePresetId(String(name || "palette").toLowerCase().replace(/[^a-z0-9]+/g, "-"), "palette").slice(0, 36);
  return `${slug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function normalizeManualPreset(raw, fallbackName = "Captured palette") {
  const colors = (Array.isArray(raw?.colors) ? raw.colors : [])
    .map(color => normalizeHexColor(color, ""))
    .filter(Boolean)
    .slice(0, MAX_PALETTE_SIZE);
  if (!colors.length) return null;
  const name = sanitizePresetName(raw?.name || raw?.title, fallbackName);
  return {
    id: sanitizePresetId(raw?.id, createManualPresetId(name)),
    name,
    createdAt: String(raw?.createdAt || new Date().toISOString()),
    colors
  };
}

export function loadManualPresets() {
  const parsed = readJsonStorage(MANUAL_PRESET_STORAGE_KEY, null);
  if (!parsed) return [];
  const items = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.presets) ? parsed.presets : []);
  return items.map((item, index) => normalizeManualPreset(item, `Captured palette ${index + 1}`)).filter(Boolean);
}

export function saveManualPresets(presets) {
  return writeJsonStorage(MANUAL_PRESET_STORAGE_KEY, {
    app: "Palette Synth",
    kind: "palette-synth-manual-presets",
    version: 1,
    savedAt: new Date().toISOString(),
    presets: Array.isArray(presets) ? presets : []
  });
}
