import { cloneConfigSnapshot, cloneDefaultConfig } from "../state/config.js";
import { SELECT_WEIGHT_CONTROL_IDS } from "../ui/dom.js";

const noop = () => {};

const SELECT_WEIGHT_INDEX_BY_ID = new Map(SELECT_WEIGHT_CONTROL_IDS.map((id, index) => [id, index]));

const DEFAULT_ANIMATION_EXPORT = {
  frameCount: null,
  fps: 8,
  step: 1,
  prefix: "palette-synth-frame"
};

const ANIMATION_EXPORT_IDS = new Set(["animFrameCount", "animFps", "animStep", "animPrefix"]);

function panelControls(panel) {
  if (!panel?.querySelectorAll) return [];
  return Array.from(panel.querySelectorAll("input[id], select[id], textarea[id]"));
}

function panelResetTargets(panel, resetSnapshot = cloneDefaultConfig()) {
  const configKeys = new Set();
  const selectWeightIndexes = new Set();
  const animationKeys = new Set();
  const domControls = new Set();

  panelControls(panel).forEach(control => {
    if (!control?.id || control.type === "file") return;
    if (SELECT_WEIGHT_INDEX_BY_ID.has(control.id)) {
      selectWeightIndexes.add(SELECT_WEIGHT_INDEX_BY_ID.get(control.id));
      return;
    }
    if (Object.prototype.hasOwnProperty.call(resetSnapshot, control.id)) {
      configKeys.add(control.id);
      return;
    }
    if (ANIMATION_EXPORT_IDS.has(control.id)) {
      animationKeys.add(control.id);
      return;
    }
    domControls.add(control);
  });

  return {configKeys, selectWeightIndexes, animationKeys, domControls};
}

export function panelHasResettableControls(panel) {
  const targets = panelResetTargets(panel);
  return !!(targets.configKeys.size || targets.selectWeightIndexes.size || targets.animationKeys.size || targets.domControls.size);
}

function dispatchControlReset(control) {
  const EventCtor = control.ownerDocument?.defaultView?.Event || globalThis.Event;
  if (typeof EventCtor !== "function" || typeof control.dispatchEvent !== "function") return;
  control.dispatchEvent(new EventCtor("input", {bubbles: true}));
  control.dispatchEvent(new EventCtor("change", {bubbles: true}));
}

function resetDomControl(control) {
  if (!control) return;
  if (control.type === "checkbox" || control.type === "radio") {
    control.checked = !!control.defaultChecked;
  } else if (control.tagName === "SELECT") {
    const options = Array.from(control.options || []);
    const defaultIndex = options.findIndex(option => option.defaultSelected);
    control.selectedIndex = defaultIndex >= 0 ? defaultIndex : (options.length ? 0 : -1);
  } else if ("defaultValue" in control) {
    control.value = control.defaultValue;
  } else {
    control.value = "";
  }
  dispatchControlReset(control);
}

export function createResetController({
  state,
  config,
  replaceConfigSnapshot,
  resetView = noop,
  resetPaletteRegion = noop,
  syncAnimationExportUi = noop,
  setStatus = noop
}) {
  if (!state) throw new Error("createResetController requires state.");
  if (typeof replaceConfigSnapshot !== "function") throw new Error("createResetController requires replaceConfigSnapshot().");

  function resetSettings() {
    replaceConfigSnapshot(cloneDefaultConfig(), {cancelPendingHistory: false});
    resetView(false);
    resetPaletteRegion({announce: false, dirty: false});
  }

  function resetPanelControls(panel, {label = "panel"} = {}) {
    const resetSnapshot = cloneDefaultConfig();
    const targets = panelResetTargets(panel, resetSnapshot);
    const hasConfigTargets = targets.configKeys.size || targets.selectWeightIndexes.size;
    const hasAnimationTargets = targets.animationKeys.size;
    const hasDomTargets = targets.domControls.size;
    if (!hasConfigTargets && !hasAnimationTargets && !hasDomTargets) return false;

    if (hasConfigTargets) {
      const snapshot = cloneConfigSnapshot(config || {});
      targets.configKeys.forEach(key => {
        snapshot[key] = resetSnapshot[key];
      });
      if (targets.selectWeightIndexes.size) {
        const nextWeights = Array.isArray(snapshot.selectWeights) ? snapshot.selectWeights.slice() : resetSnapshot.selectWeights.slice();
        targets.selectWeightIndexes.forEach(index => {
          nextWeights[index] = resetSnapshot.selectWeights[index];
        });
        snapshot.selectWeights = nextWeights;
      }
      replaceConfigSnapshot(snapshot, {cancelPendingHistory: false});
    }

    if (hasAnimationTargets && state.animationExport) {
      if (targets.animationKeys.has("animFrameCount")) state.animationExport.frameCount = DEFAULT_ANIMATION_EXPORT.frameCount;
      if (targets.animationKeys.has("animFps")) state.animationExport.fps = DEFAULT_ANIMATION_EXPORT.fps;
      if (targets.animationKeys.has("animStep")) state.animationExport.step = DEFAULT_ANIMATION_EXPORT.step;
      if (targets.animationKeys.has("animPrefix")) state.animationExport.prefix = DEFAULT_ANIMATION_EXPORT.prefix;
      syncAnimationExportUi();
    }

    targets.domControls.forEach(resetDomControl);

    setStatus(`Reset ${label} controls.`);
    return true;
  }

  return {resetSettings, resetPanelControls, panelHasResettableControls};
}
