import { cloneDefaultConfig, cloneConfigSnapshot as cloneConfigSnapshotValue, cloneStoredConfigSnapshot as cloneStoredConfigSnapshotValue } from "../state/config.js";
import { $ } from "./dom.js";
import { cyclePaletteSwatchScale, PALETTE_SWATCH_SCALE_HOTKEY } from "./palette-swatch-scale.js";

export const SHORTCUT_BLOCK_SELECTOR = [
  "input",
  "select",
  "textarea",
  "[contenteditable]",
  "dialog[open]"
].join(",");

const ESCAPE_BLUR_SELECTOR = [
  "input",
  "select",
  "textarea",
  "button",
  "summary",
  "[role=button]",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable]"
].join(",");

const FOCUS_TOOLBAR_PANEL_EVENT = "palette-synth:focus-panel";

const TOOLBAR_PANEL_SHORTCUTS = [
  {key: "1", panelKey: "palette", label: "Palette"},
  {key: "2", panelKey: "palette-adjustments", label: "Palette adjustments"},
  {key: "3", panelKey: "generation", label: "Generation"},
  {key: "4", panelKey: "source-levels", label: "Source levels"},
  {key: "5", panelKey: "mapping", label: "Mapping"},
  {key: "6", panelKey: "perceptual-weights", label: "Perceptual weights"},
  {key: "7", panelKey: "dither", panelKeys: ["dither", "blending"], label: "Dither / Blend"},
  {key: "8", panelKey: "pixel-art", label: "Pixel art"},
  {key: "9", panelKey: "cycle", label: "Cycle"},
  {key: "Shift+1", panelKey: "mask", label: "Mask"},
  {key: "Shift+2", panelKey: "recipes", label: "Recipes"},
  {key: "Shift+3", panelKey: "animation-export", label: "Animation export"}
];

const TOOLBAR_PANEL_SHORTCUT_BY_KEY = new Map(TOOLBAR_PANEL_SHORTCUTS.map(item => [item.key, item]));
const TOOLBAR_PANEL_SHORTCUT_BY_PANEL = new Map();
for (const item of TOOLBAR_PANEL_SHORTCUTS) {
  const keys = item.panelKeys || [item.panelKey];
  for (const panelKey of keys) if (!TOOLBAR_PANEL_SHORTCUT_BY_PANEL.has(panelKey)) TOOLBAR_PANEL_SHORTCUT_BY_PANEL.set(panelKey, item.key);
}

const INSPECTOR_TABS = ["pixel", "selection", "diagnostics", "xray", "histogram"];
const SNAPSHOT_SLOT_KEYS = ["a", "s", "d", "f"];

export const SHORTCUT_DEFINITIONS = [
  {key: "?", label: "Show keyboard shortcuts"},
  {key: "O", label: "Open main image"},
  {key: "Shift+O", label: "Open reference image"},
  {key: "Shift+R", label: "Reset settings"},
  {key: "C", label: "Toggle compare"},
  {key: "Shift+C", label: "Copy current palette hex"},
  {key: "P", label: "Toggle pixel-perfect preview"},
  {key: PALETTE_SWATCH_SCALE_HOTKEY, label: "Cycle palette swatch bar size"},
  {key: "I", label: "Toggle floating inspector"},
  {key: "Shift+I", label: "Switch inspector tab"},
  {key: "Shift+E", label: "Rotate assignment mode"},
  {key: "Inspector: ← / → / ↑ / ↓", label: "Move inspected pixel"},
  {key: "Inspector: A", label: "Copy source / copy output / add source"},
  {key: "Inspector: Esc", label: "Clear pixel, then close"},
  {key: "0", label: "Reset view"},
  {key: "- / =", label: "Zoom out / in"},
  {key: "[ / ]", label: "Nudge cycle offset"},
  {key: ", / .", label: "Previous / next palette preset"},
  {key: "← / →", label: "Previous / next seed"},
  {key: "A / S / D / F", label: "Load snapshot slots 1–4"},
  {key: "Shift+A / S / D / F", label: "Save snapshot slots 1–4"},
  {key: "X", label: "Export palette"},
  {key: "Shift+X", label: "Export full image PNG"},
  {key: "H", label: "Toggle difference heatmap"},
  {key: "B", label: "Pick up / put down mask brush"},
  {key: "M", label: "Switch to manual / preset mode"},
  {key: "Shift+M", label: "Capture current palette to manual"},
  {key: "G", label: "Switch to generated main-image mode"},
  {key: "Shift+-", label: "Collapse all toolbar panels"},
  {key: "1…9", label: "Open/focus toolbar panels 1–9"},
  {key: "Shift+1…3", label: "Open/focus lower panels"}
];

const RANGE_VALUE_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);
const NUMBER_VALUE_KEYS = new Set(["ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);
const TEXT_VALUE_KEYS = new Set(["Backspace", "Delete", "Enter", "ArrowLeft", "ArrowRight", "Home", "End"]);
const BUTTON_VALUE_KEYS = new Set(["Enter", " ", "Spacebar"]);
const RADIO_VALUE_KEYS = new Set([...BUTTON_VALUE_KEYS, "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);
const TEXT_INPUT_TYPES = new Set(["", "email", "password", "search", "tel", "text", "url"]);
const DATE_TIME_INPUT_TYPES = new Set(["date", "datetime-local", "month", "time", "week"]);

function closestTarget(target, selector) {
  return typeof target?.closest === "function" ? target.closest(selector) : null;
}

function inputType(input) {
  return String(input?.type || "text").toLowerCase();
}

function isPrintableKey(event) {
  return String(event?.key || "").length === 1;
}

function isUnshiftedDigitKey(event) {
  return !event?.shiftKey && /^[0-9]$/.test(String(event?.key || ""));
}

function isNumberEditKey(event) {
  const key = String(event?.key || "");
  return isUnshiftedDigitKey(event) || key === "." || key === "," || key === "-" || key === "+" || key === "e" || key === "E";
}

function inputCanConsumeShortcutKey(input, event) {
  const type = inputType(input);
  const key = String(event?.key || "");

  if (input?.disabled) return false;

  if (type === "range") return RANGE_VALUE_KEYS.has(key);
  if (type === "number") return !input?.readOnly && (NUMBER_VALUE_KEYS.has(key) || isNumberEditKey(event));
  if (type === "checkbox") return BUTTON_VALUE_KEYS.has(key);
  if (type === "radio") return RADIO_VALUE_KEYS.has(key);
  if (["button", "submit", "reset", "file", "color"].includes(type)) return BUTTON_VALUE_KEYS.has(key);

  if (TEXT_INPUT_TYPES.has(type)) {
    if (input?.readOnly) return false;
    return TEXT_VALUE_KEYS.has(key) || isPrintableKey(event);
  }

  if (DATE_TIME_INPUT_TYPES.has(type)) {
    if (input?.readOnly) return false;
    return RANGE_VALUE_KEYS.has(key) || isPrintableKey(event);
  }

  if (input?.readOnly) return false;
  return TEXT_VALUE_KEYS.has(key) || isPrintableKey(event);
}

function selectCanConsumeShortcutKey(select, event) {
  if (select?.disabled) return false;
  const key = String(event?.key || "");
  return RANGE_VALUE_KEYS.has(key) || BUTTON_VALUE_KEYS.has(key) || isPrintableKey(event);
}

function snapshotSlotIndexForEvent(event) {
  if (event?.ctrlKey || event?.metaKey || event?.altKey) return -1;
  const key = String(event?.key || "").toLowerCase();
  return SNAPSHOT_SLOT_KEYS.indexOf(key);
}

function snapshotSlotLabel(index) {
  return SNAPSHOT_SLOT_KEYS[index]?.toUpperCase?.() || String(index + 1);
}

export function shouldIgnoreShortcut(event) {
  if (event?.defaultPrevented) return true;
  if (event?.ctrlKey || event?.metaKey || event?.altKey) return true;

  const target = event?.target;
  if (!target) return false;

  // Modal/editor contexts still own the whole keyboard while they are active.
  if (closestTarget(target, "dialog[open], textarea, [contenteditable]")) return true;

  const input = closestTarget(target, "input");
  if (input) return inputCanConsumeShortcutKey(input, event);

  const select = closestTarget(target, "select");
  if (select) return selectCanConsumeShortcutKey(select, event);

  return false;
}

function normalizePanelKey(text = "") {
  return String(text).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function panelHeadingText(heading) {
  const explicitLabel = heading?.dataset?.panelLabel;
  if (explicitLabel) return explicitLabel;

  const childNodes = Array.from(heading?.childNodes || []);
  const directText = childNodes
    .filter(node => node?.nodeType === 3)
    .map(node => node.textContent || "")
    .join(" ")
    .trim();
  return directText || heading?.textContent || "";
}

function toolbarPanelShortcutKey(event) {
  if (event?.ctrlKey || event?.metaKey || event?.altKey) return null;
  const plainDigit = /^[1-9]$/.test(event?.key || "") ? event.key : null;
  if (plainDigit && !event.shiftKey) return plainDigit;

  const codeMatch = /^Digit([1-9])$/.exec(event?.code || "");
  if (codeMatch) return event.shiftKey ? `Shift+${codeMatch[1]}` : codeMatch[1];

  return null;
}

function dispatchToolbarPanelFocus(root, panelShortcut) {
  const toolPane = $("toolPane", root);
  const inspectorPane = $("pixelInspectorPane", root);
  const targets = [toolPane, inspectorPane].filter(target => target && typeof target.dispatchEvent === "function");
  if (!targets.length) return {handled: false, action: null};

  const panelKey = panelShortcut?.panelKey;
  const panelKeys = panelShortcut?.panelKeys || (panelKey ? [panelKey] : []);
  const CustomEventCtor = root?.defaultView?.CustomEvent || globalThis.CustomEvent;

  for (const target of targets) {
    const detail = {panelKey, panelKeys, toggle: true};
    let event;
    if (typeof CustomEventCtor === "function") {
      event = new CustomEventCtor(FOCUS_TOOLBAR_PANEL_EVENT, {
        bubbles: false,
        cancelable: true,
        detail
      });
    } else {
      event = {
        type: FOCUS_TOOLBAR_PANEL_EVENT,
        cancelable: true,
        defaultPrevented: false,
        detail,
        preventDefault() { this.defaultPrevented = true; }
      };
    }
    const dispatchResult = target.dispatchEvent(event);
    if (event.defaultPrevented || dispatchResult === false) return {handled: true, action: event.detail?.action || "focused"};
  }
  return {handled: false, action: null};
}

function collapseAllToolbarPanels(root) {
  const button = $("collapseAllPanelsButton", root) || root?.querySelector?.("[data-collapse-all-panels]");
  if (!button) return false;
  if (typeof button.click === "function") {
    button.click();
    return true;
  }
  return false;
}

function isCollapseAllShortcut(event) {
  if (event?.ctrlKey || event?.metaKey || event?.altKey || !event?.shiftKey) return false;
  return event.code === "Minus" || event.key === "_" || event.key === "-";
}

function isMaskBrushToggleShortcut(event) {
  if (event?.ctrlKey || event?.metaKey || event?.altKey || event?.shiftKey) return false;
  const key = String(event?.key || "").toLowerCase();
  return event.code === "KeyB" || key === "b";
}

function isInspectorTabShortcut(event) {
  if (event?.ctrlKey || event?.metaKey || event?.altKey || !event?.shiftKey) return false;
  const key = String(event?.key || "");
  return event.code === "KeyI" || key.toLowerCase() === "i" || key === "İ";
}

function isAssignmentModeShortcut(event) {
  if (event?.ctrlKey || event?.metaKey || event?.altKey || !event?.shiftKey) return false;
  const key = String(event?.key || "");
  return event.code === "KeyE" || key.toLowerCase() === "e";
}

function inspectorTabShortcutTargetIsEditable(event) {
  const target = event?.target;
  if (!target?.closest) return false;
  // Shift+I is an app-level navigation shortcut. Let it work from normal
  // toolbar controls, including number/text inputs and selects, because those
  // controls often retain focus after adjustment and otherwise make the
  // shortcut feel dead. Keep multiline/editor contexts protected.
  return !!target.closest("dialog[open], textarea, [contenteditable]");
}

function blurControlOnEscape(event) {
  if (event?.key !== "Escape") return false;
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target;
  if (!target?.closest || target.closest("dialog[open]")) return false;
  const control = target.closest(ESCAPE_BLUR_SELECTOR);
  if (!control || typeof control.blur !== "function") return false;
  control.blur();
  return true;
}

function annotateToolbarPanelShortcuts(root) {
  const toolPane = $("toolPane", root);
  if (!toolPane || typeof toolPane.querySelectorAll !== "function") return;
  const panels = Array.from(toolPane.querySelectorAll(".panel"));
  panels.forEach((panel, index) => {
    const heading = panel.querySelector?.("h2");
    if (!heading?.setAttribute) return;
    const key = panel.dataset?.panelKey || normalizePanelKey(panelHeadingText(heading)) || `panel-${index}`;
    const shortcut = TOOLBAR_PANEL_SHORTCUT_BY_PANEL.get(key);
    if (!shortcut) return;
    heading.setAttribute("aria-keyshortcuts", shortcut);
    if (heading.dataset) heading.dataset.panelShortcut = shortcut;
    else heading.setAttribute("data-panel-shortcut", shortcut);

    const label = String(shortcut || "");
    let hint = heading.querySelector?.(".panel-hotkey-hint");
    if (!hint && root?.createElement) {
      hint = root.createElement("span");
      hint.className = "panel-hotkey-hint";
      hint.setAttribute("aria-hidden", "true");
      const resetButton = heading.querySelector?.(".panel-reset-button");
      heading.insertBefore?.(hint, resetButton || null);
    }
    if (hint) hint.textContent = label;

    if ("title" in heading) {
      const baseTitle = heading.title || "Collapse / expand";
      if (!baseTitle.includes(shortcut)) heading.title = `${baseTitle} (${shortcut})`;
    }
  });
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrapNumber(value, min, max) {
  const span = max - min + 1;
  if (!Number.isFinite(value) || !Number.isFinite(span) || span <= 0) return clampNumber(value, min, max);
  return ((value - min) % span + span) % span + min;
}

function elementNumber(el, property, fallback) {
  const value = Number(el?.[property]);
  return Number.isFinite(value) ? value : fallback;
}

function setControlValue({els = {}, root, config, setOutputText}, key, value) {
  const control = els[key] || $(key, root);
  if (control) {
    if (control.type === "checkbox") control.checked = !!value;
    else control.value = value;
  }
  const out = $(`${key}Value`, root);
  setOutputText?.(key, out, value);
}

function clickElement(element) {
  if (!element) return false;
  if (typeof element.click === "function") {
    element.click();
    return true;
  }
  return false;
}

function showShortcutHelp({root, setStatus}) {
  if (!root?.createElement || !root?.body) {
    setStatus?.(SHORTCUT_DEFINITIONS.map(item => `${item.key}: ${item.label}`).join(" · "));
    return;
  }

  let dialog = $("shortcutHelpDialog", root);
  if (!dialog) {
    dialog = root.createElement("dialog");
    dialog.id = "shortcutHelpDialog";
    dialog.className = "shortcut-help-dialog";
    dialog.innerHTML = `
      <form method="dialog" class="shortcut-help-card">
        <div class="shortcut-help-header">
          <h3>Keyboard shortcuts</h3>
          <button type="submit" class="ghost mini-control" aria-label="Close shortcuts">Close</button>
        </div>
        <dl class="shortcut-help-list">
          ${SHORTCUT_DEFINITIONS.map(item => `<div><dt>${item.key}</dt><dd>${item.label}</dd></div>`).join("")}
        </dl>
      </form>`;
    root.body.append(dialog);
  }

  if (dialog.open) {
    dialog.close?.();
    return;
  }

  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.hidden = false;
}

function annotateShortcutTargets(root) {
  annotateToolbarPanelShortcuts(root);

  const pairs = [
    ["imageInput", "O"],
    ["referenceImageInput", "Shift+O"],
    ["resetButton", "Shift+R"],
    ["collapseAllPanelsButton", "Shift+-"],
    ["compareToggle", "C"],
    ["copyPaletteHexStrings", "Shift+C"],
    ["pixelPerfectToggle", "P"],
    ["paletteSwatchScaleToggle", PALETTE_SWATCH_SCALE_HOTKEY],
    ["togglePixelInspector", "I Shift+I"],
    ["assignMode", "Shift+E"],
    ["resetViewButton", "0"],
    ["zoomOutButton", "-"],
    ["zoomInButton", "="],
    ["cycleOffset", "[ ]"],
    ["presetName", ", ."],
    ["previousPresetAsManual", ","],
    ["nextPresetAsManual", "."],
    ["seed", "ArrowLeft ArrowRight"],
    ["exportPalette", "X"],
    ["downloadFullImage", "Shift+X"],
    ["diagnosticsOverlayDifference", "H"],
    ["maskPaint", "B"],
    ["paletteMode", "M G"],
    ["capturePalette", "Shift+M"]
  ];

  for (const [id, keys] of pairs) {
    const el = $(id, root);
    if (!el?.setAttribute) continue;
    el.setAttribute("aria-keyshortcuts", keys);
    if ("title" in el && el.title && !el.title.includes(keys)) el.title = `${el.title} (${keys})`;
  }
}

export function createShortcutDispatcher({
  root = globalThis.document,
  config = {},
  state = {},
  els = {},
  withHistory = (_label, mutator) => mutator(),
  setOutputText = () => {},
  handleControlDirty = () => {},
  updateConditionalPanels = () => {},
  setCompareEnabled = () => {},
  syncCycleControls = () => {},
  normalizedCycleOffset = value => value,
  manualCycleModeEnabled = () => false,
  markPaletteDirty = () => {},
  markTextureDirty = () => {},
  queueRender = () => {},
  loadFile = () => {},
  loadReferenceFile = () => {},
  exportPalette = () => {},
  downloadFullImage = () => {},
  copyCurrentPaletteHexStrings = () => {},
  captureCurrentPaletteToManual = () => {},
  switchPalettePreset = () => false,
  addPixelSourceToManualPalette = () => {},
  copyPixelHex = () => {},
  setPixelInspectorOpen = () => {},
  togglePixelInspector = () => {},
  setInspectorTab = () => {},
  clearDiagnosticPixel = () => {},
  nudgeDiagnosticPixel = () => {},
  pixelInspectorPanelIsOpen = () => false,
  pixelInspectorPaneIsOpen = () => !!state.diagnostics?.pixelInspectorOpen || pixelInspectorPanelIsOpen(),
  getDisplayViewRect = () => ({left: 0, top: 0, width: 0, height: 0}),
  zoomBy = () => {},
  resetView = () => {},
  resetSettings = () => {},
  cloneConfigSnapshot = () => cloneConfigSnapshotValue(config),
  replaceConfigSnapshot = snapshot => {
    Object.keys(config).forEach(key => delete config[key]);
    Object.assign(config, cloneConfigSnapshotValue(snapshot));
  },
  defaultConfigSnapshot = () => cloneDefaultConfig(),
  setDiagnosticOverlay = () => {},
  updateDiagnostics = () => {},
  setStatus = () => {}
} = {}) {
  const context = {els, root, config, setOutputText};
  const snapshotSlots = SNAPSHOT_SLOT_KEYS.map(() => cloneStoredConfigSnapshotValue(defaultConfigSnapshot()));

  function currentConfigSnapshot() {
    return cloneStoredConfigSnapshotValue(cloneConfigSnapshot());
  }

  function syncDirtyControl(key, value) {
    setControlValue(context, key, value);
    handleControlDirty(key);
  }

  function nudgeSeed(delta) {
    const control = els.seed || $("seed", root);
    const min = elementNumber(control, "min", 1);
    const max = elementNumber(control, "max", 500);
    const current = clampNumber(Math.round(Number(config.seed) || min), min, max);
    const next = wrapNumber(current + delta, min, max);
    withHistory("Change seed", () => {
      config.seed = next;
      syncDirtyControl("seed", config.seed);
      queueRender();
      setStatus(`Seed ${config.seed}.`);
    });
  }

  function nudgeCycleOffset(delta) {
    const next = normalizedCycleOffset((Number(config.cycleOffset) || 0) + delta, state.paletteRecords);
    withHistory("Change cycle offset", () => {
      config.cycleOffset = next;
      setControlValue(context, "cycleOffset", config.cycleOffset);
      if (manualCycleModeEnabled()) markPaletteDirty({swatches: false});
      syncCycleControls();
      queueRender();
      setStatus(`Cycle offset ${config.cycleOffset}.`);
    });
  }

  function saveSnapshotSlot(index) {
    const label = snapshotSlotLabel(index);
    snapshotSlots[index] = currentConfigSnapshot();
    setStatus(`Saved snapshot ${label}.`);
  }

  function loadSnapshotSlot(index) {
    const label = snapshotSlotLabel(index);
    const snapshot = cloneConfigSnapshotValue(snapshotSlots[index] || defaultConfigSnapshot());
    withHistory(`Load snapshot ${label}`, () => {
      replaceConfigSnapshot(snapshot, {cancelPendingHistory: false});
      setStatus(`Loaded snapshot ${label}.`);
    });
  }

  function handleSnapshotShortcut(event) {
    const index = snapshotSlotIndexForEvent(event);
    if (index < 0) return false;
    if (event.shiftKey) saveSnapshotSlot(index);
    else loadSnapshotSlot(index);
    return true;
  }

  function toggleCompare() {
    withHistory("Toggle before/after", () => {
      setCompareEnabled(!config.compareEnabled);
      setStatus(config.compareEnabled ? "Compare on." : "Compare off.");
    });
  }

  function togglePixelPerfect() {
    withHistory("Toggle pixel-perfect", () => {
      config.pixelPerfect = !config.pixelPerfect;
      setControlValue(context, "pixelPerfectToggle", config.pixelPerfect);
      els.canvas?.classList?.toggle?.("pixel-perfect", config.pixelPerfect);
      markTextureDirty();
      queueRender();
      setStatus(config.pixelPerfect ? "Pixel-perfect preview on." : "Pixel-perfect preview off.");
    });
  }

  function inspectorTabAvailable(tab, button) {
    if (!button || button.hidden || button.closest?.("[hidden]")) return false;
    if (button.classList?.contains?.("image-palette-only")) {
      const mode = root?.body?.dataset?.paletteMode || config.paletteMode;
      if (mode === "harmony" || mode === "cosine") return false;
    }
    const view = button.ownerDocument?.defaultView || root?.defaultView || globalThis;
    const style = typeof view?.getComputedStyle === "function" ? view.getComputedStyle(button) : null;
    return !style || (style.display !== "none" && style.visibility !== "hidden");
  }

  function inspectorTabButton(tab) {
    if (tab === "pixel") return els.inspectorTabPixel || $("inspectorTabPixel", root);
    if (tab === "selection") return els.inspectorTabSelection || $("inspectorTabSelection", root);
    if (tab === "diagnostics") return els.inspectorTabDiagnostics || $("inspectorTabDiagnostics", root);
    if (tab === "xray") return els.inspectorTabXray || $("inspectorTabXray", root);
    if (tab === "histogram") return els.inspectorTabHistogram || $("inspectorTabHistogram", root);
    return null;
  }

  function cycleInspectorTab() {
    const availableTabs = INSPECTOR_TABS.filter(tab => inspectorTabAvailable(tab, inspectorTabButton(tab)));
    const tabs = availableTabs.length ? availableTabs : INSPECTOR_TABS;
    const current = INSPECTOR_TABS.includes(state.diagnostics?.inspectorTab) ? state.diagnostics.inspectorTab : "pixel";
    const currentIndex = tabs.includes(current) ? tabs.indexOf(current) : -1;
    const next = tabs[(currentIndex + 1) % tabs.length];
    const wasOpen = !!state.diagnostics?.pixelInspectorOpen;

    if (!wasOpen) {
      // Prime the active tab before opening so the first open render lands on
      // the requested inspector view instead of flashing/sticking on Pixel.
      setInspectorTab(next, {focus: false, announce: false, update: false});
      setPixelInspectorOpen(true, {announce: false});
    }

    setInspectorTab(next, {focus: true, announce: true});
  }


  function zoomPreview(delta) {
    const rect = getDisplayViewRect();
    zoomBy(delta, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function setPaletteMode(mode, label) {
    if (config.paletteMode === mode) {
      setStatus(`${label} mode already selected.`);
      return;
    }
    withHistory(`Switch to ${label} palette`, () => {
      config.paletteMode = mode;
      syncDirtyControl("paletteMode", mode);
      updateConditionalPanels();
      queueRender();
      setStatus(`Palette mode: ${label}.`);
    });
  }

  function toggleDifferenceOverlay() {
    const current = state.diagnostics?.overlay?.mode === "difference";
    setDiagnosticOverlay({mode: current ? "none" : "difference"});
    updateDiagnostics();
  }

  function toggleMaskBrush() {
    return clickElement(els.maskPaint || $("maskPaint", root));
  }

  function assignmentModeOptions() {
    const control = els.assignMode || $("assignMode", root);
    const values = Array.from(control?.options || []).map(option => option.value).filter(Boolean);
    return values.length ? values : ["nearest", "blend", "dither"];
  }

  function assignmentModeLabel(value) {
    const control = els.assignMode || $("assignMode", root);
    const option = Array.from(control?.options || []).find(item => item.value === value);
    return (option?.textContent || value || "assignment").trim();
  }

  function rotateAssignmentMode() {
    const modes = assignmentModeOptions();
    const currentIndex = Math.max(0, modes.indexOf(config.assignMode));
    const next = modes[(currentIndex + 1) % modes.length];
    withHistory("Rotate assignment mode", () => {
      config.assignMode = next;
      syncDirtyControl("assignMode", next);
      updateConditionalPanels();
      updateDiagnostics();
      queueRender();
      setStatus(`Assignment: ${assignmentModeLabel(next)}.`);
    });
  }

  function inspectorNudgeStep(event) {
    return event.shiftKey ? Math.max(1, Math.round(Number(config.pixelBlockSize) || 1)) : 1;
  }

  function handleInspectorShortcut(event, key) {
    if (key === "Escape") {
      if (!pixelInspectorPaneIsOpen()) return false;
      const activeTab = state.diagnostics?.inspectorTab || "pixel";
      if (activeTab === "pixel" && state.diagnostics?.pixel) clearDiagnosticPixel({announce: true});
      else setPixelInspectorOpen(false, {announce: true});
      return true;
    }
    if (!pixelInspectorPanelIsOpen()) return false;
    if (key === "ArrowLeft") {
      nudgeDiagnosticPixel(-1, 0, {step: inspectorNudgeStep(event)});
      return true;
    }
    if (key === "ArrowRight") {
      nudgeDiagnosticPixel(1, 0, {step: inspectorNudgeStep(event)});
      return true;
    }
    if (key === "ArrowUp") {
      nudgeDiagnosticPixel(0, -1, {step: inspectorNudgeStep(event)});
      return true;
    }
    if (key === "ArrowDown") {
      nudgeDiagnosticPixel(0, 1, {step: inspectorNudgeStep(event)});
      return true;
    }
    const lower = key.toLowerCase?.();
    if (lower === "a" && !event.shiftKey) {
      addPixelSourceToManualPalette();
      return true;
    }
    return false;
  }

  const handlers = {
    "?": () => {
      showShortcutHelp({root, setStatus});
      return true;
    },
    "o": event => {
      if (event.shiftKey) {
        if (!clickElement(els.referenceImageInput || $("referenceImageInput", root))) loadReferenceFile();
      } else if (!clickElement($("imageInput", root))) {
        loadFile();
      }
      return true;
    },
    "r": event => {
      if (!event.shiftKey) return false;
      withHistory("Reset settings", resetSettings);
      return true;
    },
    "c": event => {
      if (event.shiftKey) {
        copyCurrentPaletteHexStrings();
        return true;
      }
      toggleCompare();
      return true;
    },
    "p": event => {
      if (event.shiftKey) {
        withHistory("Change palette swatch size", () => {
          cyclePaletteSwatchScale({config, els, root, setStatus});
        });
        return true;
      }
      togglePixelPerfect();
      return true;
    },
    "i": event => {
      if (event.shiftKey) cycleInspectorTab();
      else togglePixelInspector({announce: true});
      return true;
    },
    "0": event => {
      if (event.shiftKey) return false;
      resetView();
      return true;
    },
    "-": event => {
      if (event.shiftKey) return false;
      zoomPreview(220);
      return true;
    },
    "=": event => {
      if (event.shiftKey) return false;
      zoomPreview(-220);
      return true;
    },
    "+": event => {
      zoomPreview(-220);
      return true;
    },
    ",": event => {
      switchPalettePreset(-1);
      return true;
    },
    ".": event => {
      switchPalettePreset(1);
      return true;
    },
    "[": event => {
      nudgeCycleOffset(-1);
      return true;
    },
    "]": event => {
      nudgeCycleOffset(1);
      return true;
    },
    "ArrowLeft": event => {
      if (event.shiftKey) return false;
      nudgeSeed(-1);
      return true;
    },
    "ArrowRight": event => {
      if (event.shiftKey) return false;
      nudgeSeed(1);
      return true;
    },
    "x": event => {
      if (event.shiftKey) downloadFullImage();
      else exportPalette();
      return true;
    },
    "h": event => {
      if (event.shiftKey) return false;
      toggleDifferenceOverlay();
      return true;
    },
    "b": event => {
      if (event.shiftKey) return false;
      return toggleMaskBrush();
    },
    "m": event => {
      if (event.shiftKey) captureCurrentPaletteToManual("replace");
      else setPaletteMode("manual", "manual / preset");
      return true;
    },
    "g": event => {
      if (event.shiftKey) return false;
      setPaletteMode("generated", "generated from main image");
      return true;
    },
    "e": event => {
      if (!event.shiftKey) return false;
      rotateAssignmentMode();
      return true;
    },
    "a": handleSnapshotShortcut,
    "s": handleSnapshotShortcut,
    "d": handleSnapshotShortcut,
    "f": handleSnapshotShortcut
  };

  function handleInspectorTabKeydown(event) {
    if (event?.defaultPrevented || !isInspectorTabShortcut(event) || inspectorTabShortcutTargetIsEditable(event)) return false;
    cycleInspectorTab();
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    event.stopPropagation?.();
    return true;
  }

  function handleAssignmentModeKeydown(event) {
    if (event?.defaultPrevented || !isAssignmentModeShortcut(event) || inspectorTabShortcutTargetIsEditable(event)) return false;
    rotateAssignmentMode();
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    event.stopPropagation?.();
    return true;
  }

  function handleKeydown(event) {
    const key = event.key === "/" && event.shiftKey ? "?" : event.key;
    if (key === "Escape" && handleInspectorShortcut(event, key)) {
      event.preventDefault?.();
      return;
    }
    if (blurControlOnEscape(event)) {
      event.preventDefault?.();
      return;
    }
    if (handleInspectorTabKeydown(event)) return;
    if (handleAssignmentModeKeydown(event)) return;

    if (shouldIgnoreShortcut(event)) return;

    if (isMaskBrushToggleShortcut(event)) {
      if (toggleMaskBrush()) event.preventDefault?.();
      return;
    }

    if ((state.mask?.paintMode || "off") !== "off" || state.mask?.dragging) return;

    if (isCollapseAllShortcut(event)) {
      const collapsed = collapseAllToolbarPanels(root);
      setStatus(collapsed ? "Toolbar panels collapsed." : "Collapse-all control not found.");
      event.preventDefault?.();
      return;
    }

    const panelShortcutKey = toolbarPanelShortcutKey(event);
    if (panelShortcutKey) {
      const panelShortcut = TOOLBAR_PANEL_SHORTCUT_BY_KEY.get(panelShortcutKey);
      if (panelShortcut) {
        const result = dispatchToolbarPanelFocus(root, panelShortcut);
        const targetLabel = panelShortcut.label.endsWith("tab") ? panelShortcut.label : `${panelShortcut.label} panel`;
        const action = result.action === "collapsed" ? "collapsed" : "focused";
        setStatus(result.handled ? `${targetLabel} ${action}.` : `${targetLabel} not found.`);
        event.preventDefault?.();
        return;
      }
    }

    if (handleInspectorShortcut(event, key)) {
      event.preventDefault?.();
      return;
    }
    const handler = handlers[key] || handlers[key.toLowerCase?.()];
    if (!handler) return;
    if (handler(event) === false) return;
    event.preventDefault?.();
  }

  function handleCaptureKeydown(event) {
    if (handleInspectorTabKeydown(event)) return;
    handleAssignmentModeKeydown(event);
  }

  annotateShortcutTargets(root);
  root?.addEventListener?.("keydown", handleCaptureKeydown, true);
  root?.addEventListener?.("keydown", handleKeydown);

  return {
    handleKeydown,
    handleCaptureKeydown,
    destroy() {
      root?.removeEventListener?.("keydown", handleCaptureKeydown, true);
      root?.removeEventListener?.("keydown", handleKeydown);
    }
  };
}
