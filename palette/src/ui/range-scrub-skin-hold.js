export const RANGE_SCRUB_CLASS = "range-scrubbing";
export const RANGE_SCRUB_ACCENT_VARIABLE = "--range-scrub-accent";

function isRangeInput(target) {
  if (!target) return false;
  if (typeof target.matches === "function" && target.matches('input[type="range"]')) return true;
  return target.tagName === "INPUT" && target.type === "range";
}

function readCssValue(style, name) {
  if (!style || typeof style.getPropertyValue !== "function") return "";
  return String(style.getPropertyValue(name) || "").trim();
}

function setCssVariable(style, name, value) {
  if (!style || !value) return;
  if (typeof style.setProperty === "function") style.setProperty(name, value);
  else style[name] = value;
}

function removeCssVariable(style, name) {
  if (!style) return;
  if (typeof style.removeProperty === "function") style.removeProperty(name);
  else delete style[name];
}

function rangeAccentColor({doc, target, getComputedStyleFn}) {
  const readComputed = node => {
    try {
      return typeof getComputedStyleFn === "function" ? getComputedStyleFn(node) : null;
    } catch {
      return null;
    }
  };
  const targetStyle = readComputed(target);
  const targetAccent = String(targetStyle?.accentColor || "").trim();
  if (targetAccent && targetAccent !== "auto") return targetAccent;

  const rootStyle = readComputed(doc?.documentElement);
  const rootAccent = readCssValue(rootStyle, "--accent");
  if (rootAccent) return rootAccent;

  return readCssValue(doc?.documentElement?.style, "--accent");
}

export function bindRangeScrubSkinHold({
  root = globalThis.document,
  windowRef = globalThis.window,
  getComputedStyleFn = globalThis.getComputedStyle
} = {}) {
  const doc = root?.ownerDocument || root;
  if (!doc || typeof doc.addEventListener !== "function") return () => {};

  let active = false;

  const begin = event => {
    if (!isRangeInput(event?.target)) return;
    const accent = rangeAccentColor({doc, target: event.target, getComputedStyleFn});
    setCssVariable(doc.documentElement?.style, RANGE_SCRUB_ACCENT_VARIABLE, accent);
    doc.body?.classList?.add?.(RANGE_SCRUB_CLASS);
    active = true;
  };

  const end = () => {
    if (!active) return;
    active = false;
    doc.body?.classList?.remove?.(RANGE_SCRUB_CLASS);
    removeCssVariable(doc.documentElement?.style, RANGE_SCRUB_ACCENT_VARIABLE);
  };

  doc.addEventListener("pointerdown", begin, true);
  doc.addEventListener("mousedown", begin, true);
  doc.addEventListener("touchstart", begin, true);
  windowRef?.addEventListener?.("pointerup", end, true);
  windowRef?.addEventListener?.("pointercancel", end, true);
  windowRef?.addEventListener?.("mouseup", end, true);
  windowRef?.addEventListener?.("touchend", end, true);
  windowRef?.addEventListener?.("touchcancel", end, true);
  windowRef?.addEventListener?.("blur", end);

  return () => {
    doc.removeEventListener?.("pointerdown", begin, true);
    doc.removeEventListener?.("mousedown", begin, true);
    doc.removeEventListener?.("touchstart", begin, true);
    windowRef?.removeEventListener?.("pointerup", end, true);
    windowRef?.removeEventListener?.("pointercancel", end, true);
    windowRef?.removeEventListener?.("mouseup", end, true);
    windowRef?.removeEventListener?.("touchend", end, true);
    windowRef?.removeEventListener?.("touchcancel", end, true);
    windowRef?.removeEventListener?.("blur", end);
    end();
  };
}
