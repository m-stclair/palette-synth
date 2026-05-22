import { colorInfoLabel, labToHex, normalizeHexColor, normalizeManualLab } from "../../color-utils.js";
import { createPaletteCycle } from "../../palette/cycle.js";
import { createPaletteRuntime } from "../../palette/runtime.js";
import { createPalettePreview } from "../../ui/palette-preview.js";

export function createPaletteDomain({
  els,
  state,
  config,
  manual,
  history = {},
  render = {},
  cyclePreviewActions = {},
  diagnosticsActions = {},
  copyPaletteHex,
  setStatus
}) {
  const {
    syncManualSwatches,
    manualSwatchLab,
    manualSwatchIndex,
    manualSwatchEditable,
    manualMatchAliasHex,
    manualSourceHex,
    manualSwatchMuted,
    toggleManualSwatchMuted,
    activeManualMatchAliasCount,
    setManualMatchAlias,
    makeManualMatchAnchorSource = () => null,
    syncManualPaletteEditor,
    openManualPaletteEditor,
    renderManualSwatches = () => {}
  } = manual;
  const {beginHistory = () => {}, commitHistory = () => {}, withHistory = (label, fn) => fn?.()} = history;
  const {
    markPaletteDirty = () => {},
    queueRender = () => {}
  } = render;
  const {syncCycleControls = () => {}} = cyclePreviewActions;
  const {setDiagnosticOverlay = () => {}} = diagnosticsActions;

  const cycle = createPaletteCycle({
    getConfig: () => config,
    getRecords: () => state.paletteRecords,
    syncManualSwatches: () => syncManualSwatches()
  });

  const runtime = createPaletteRuntime({
    config,
    state,
    syncManualSwatches,
    manualSwatchLab,
    manualSwatchEditable,
    manualMatchAliasHex
  });

  function repositionManualGraphSwatch(record, lab, {phase = "move", anchorHex = null, matchAnchorDropped = false} = {}) {
    if (!manualSwatchEditable(record)) {
      if (phase === "start") setStatus("Alt-drag reposition works on editable manual swatches.");
      return false;
    }
    const index = manualSwatchIndex(record.swatchId ?? record.sourceIndex);
    if (index < 0) return false;
    const swatches = syncManualSwatches();
    const current = swatches[index];
    if (!current) return false;
    if (phase === "start") {
      beginHistory("Alt-drag graph swatch");
      return true;
    }
    if (phase === "anchor") {
      const fallbackHex = Array.isArray(lab) ? labToHex(lab) : manualSourceHex(current.id ?? index);
      const safeAnchorHex = normalizeHexColor(anchorHex || fallbackHex, fallbackHex);
      if (!safeAnchorHex) return false;
      setManualMatchAlias?.(current.id ?? index, safeAnchorHex);
      syncManualPaletteEditor(state.paletteRecords);
      markPaletteDirty();
      queueRender();
      return true;
    }
    if (phase === "cancel") {
      commitHistory("Alt-drag graph swatch");
      return true;
    }
    const safeLab = normalizeManualLab(lab);
    if (!safeLab) return false;
    const hex = labToHex(safeLab);
    swatches[index] = {...current, hex, lab: safeLab, colorSpace: "oklab-scaled"};
    config.manualPalette = swatches;
    renderManualSwatches();
    syncManualPaletteEditor(state.paletteRecords);
    markPaletteDirty();
    queueRender();
    if (phase === "end" || phase === "cancel") {
      commitHistory("Alt-drag graph swatch");
      const anchorNote = matchAnchorDropped ? "; previous position kept as a match anchor" : "";
      setStatus(`Moved swatch ${index + 1} to ${colorInfoLabel(hex, safeLab)}${anchorNote}.`);
    }
    return true;
  }

  function makeGraphSwatchAnchorSource(record) {
    if (!manualSwatchEditable(record)) return false;
    const identifier = record.swatchId ?? record.sourceIndex;
    const index = manualSwatchIndex(identifier);
    if (index < 0) return false;
    const anchorHex = manualMatchAliasHex(identifier);
    if (!anchorHex) {
      setStatus(`Swatch ${index + 1} has no extra match anchor to make into its source.`);
      return false;
    }
    withHistory("Make match anchor source", () => {
      const next = makeManualMatchAnchorSource(identifier, {announce: false});
      const nextHex = next?.hex || anchorHex;
      setStatus(`Swatch ${index + 1} source set to former match anchor ${nextHex}.`);
    });
    return true;
  }

  const preview = createPalettePreview({
    els,
    config,
    state,
    syncGeneratedLocks: runtime.syncGeneratedLocks,
    activeGeneratedLocks: runtime.activeGeneratedLocks,
    generatedFamilyCount: runtime.generatedFamilyCount,
    isGeneratedPaletteMode: runtime.isGeneratedPaletteMode,
    activePaletteImageData: runtime.activePaletteImageData,
    activePaletteImageLabel: runtime.activePaletteImageLabel,
    manualCycleModeEnabled: cycle.manualCycleModeEnabled,
    syncCycleManualKeys: cycle.syncCycleManualKeys,
    cycleTaggable: cycle.cycleTaggable,
    cycleTagged: cycle.cycleTagged,
    manualCycleIndices: cycle.manualCycleIndices,
    manualSwatchEditable,
    manualMatchAliasHex,
    manualSourceHex,
    manualSwatchMuted,
    toggleManualSwatchMuted,
    activeManualMatchAliasCount,
    withHistory,
    markPaletteDirty,
    queueRender,
    syncCycleControls,
    syncManualPaletteEditor,
    openManualPaletteEditor,
    copyPaletteHex,
    setDiagnosticOverlay,
    setStatus
  });

  return {
    cycle,
    runtime,
    preview,
    repositionManualGraphSwatch,
    makeGraphSwatchAnchorSource,
    ...cycle,
    ...runtime,
    ...preview
  };
}
