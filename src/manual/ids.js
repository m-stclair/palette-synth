// Manual swatches have two legacy ID shapes:
// - saved swatch IDs keep the app-runtime sanitizer's original case/length behavior
// - cycle keys keep color-utils' original lower-case/64-char behavior
// Keeping those semantics explicit prevents saved palettes and cycle selections from drifting.
function sanitizeManualStorageId(value, fallback = "manual-swatch") {
  const clean = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return clean || fallback;
}

export function sanitizeManualSwatchId(value, fallback = "manual-swatch") {
  const raw = String(value ?? "").trim().toLowerCase();
  const sanitized = raw
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return sanitized || fallback;
}

export function manualCycleKeyForId(id) {
  return `manual:${sanitizeManualSwatchId(id, "manual-swatch")}`;
}

export function uniqueManualSwatchId(base, used) {
  const safeBase = sanitizeManualStorageId(base, "manual-swatch");
  let id = safeBase;
  let n = 2;
  while (used.has(id)) id = `${safeBase}-${n++}`;
  used.add(id);
  return id;
}

export function createManualSwatchId(seed = "swatch") {
  const prefix = sanitizeManualStorageId(seed, "swatch").slice(0, 28) || "swatch";
  const token = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return sanitizeManualStorageId(`manual-${prefix}-${token}`, `manual-${token}`);
}
