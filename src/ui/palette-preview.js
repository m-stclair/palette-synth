import { COSINE_PALETTE_PRESETS, HARMONY_REGION_CONTRASTS, HARMONY_RELATIONSHIPS } from "../constants.js";
import { DEFAULT_CONFIG } from "../state/config.js";
import { syncPaletteSwatchScaleUi } from "./palette-swatch-scale.js";
import { colorInfoLabel, labToHex, makePaletteRecord } from "../color-utils.js";
import { syncDynamicUiSkin } from "./dynamic-skin.js";

export function swatchSeedLab(record) {
  return record.seedLab ? [...record.seedLab] : (record.sourceLab ? [...record.sourceLab] : [...record.lab]);
}

export function swatchSeedHex(record) {
  return labToHex(swatchSeedLab(record));
}

export function createPalettePreview({
  els,
  config,
  state,
  syncGeneratedLocks,
  activeGeneratedLocks,
  generatedFamilyCount,
  isGeneratedPaletteMode,
  activePaletteImageData,
  activePaletteImageLabel,
  manualCycleModeEnabled,
  syncCycleManualKeys,
  cycleTaggable,
  cycleTagged,
  manualCycleIndices,
  manualSwatchEditable,
  manualMatchAliasHex,
  manualSourceHex,
  manualSwatchMuted = identifier => !!identifier && false,
  toggleManualSwatchMuted = () => null,
  activeManualMatchAliasCount,
  withHistory,
  markPaletteDirty,
  queueRender,
  syncCycleControls,
  syncManualPaletteEditor,
  openManualPaletteEditor,
  copyPaletteHex,
  setDiagnosticOverlay = () => {},
  setStatus
}) {
  function generatedSwatchLockable(record) {
    return isGeneratedPaletteMode() && !!activePaletteImageData() && !!record && Array.isArray(record.lab);
  }

  function generatedLockLabel() {
    return config.generatedTintShadeFamilies === false ? "color" : "family";
  }

  function generatedLockLabelPlural() {
    return config.generatedTintShadeFamilies === false ? "colors" : "families";
  }

  function updateGeneratedLockUi() {
    const totalLocks = syncGeneratedLocks().length;
    const activeLocks = activeGeneratedLocks().length;
    const maxLocks = generatedFamilyCount();
    const cycleTags = syncCycleManualKeys().length;
    if (els.clearPaletteLocks) {
      const show = isGeneratedPaletteMode() && totalLocks > 0 && !manualCycleModeEnabled();
      els.clearPaletteLocks.hidden = !show;
      els.clearPaletteLocks.disabled = !show;
      els.clearPaletteLocks.textContent = totalLocks > 0 ? `Clear locks (${totalLocks})` : "Clear locks";
    }
    if (els.clearCycleTags) {
      const show = manualCycleModeEnabled() && cycleTags > 0;
      els.clearCycleTags.hidden = !show;
      els.clearCycleTags.disabled = !show;
      els.clearCycleTags.textContent = cycleTags > 0 ? `Clear cycle tags (${cycleTags})` : "Clear cycle tags";
    }
    if (els.paletteHint) {
      if (manualCycleModeEnabled()) {
        els.paletteHint.textContent = cycleTags > 0
          ? `Cycle tags: click to toggle; Shift-click shows diagnostic overlay. ${cycleTags} tagged.`
          : "Cycle tags: click to choose cycling colors; Shift-click shows diagnostic overlay.";
      } else if (isGeneratedPaletteMode()) {
        const sourceLabel = activePaletteImageLabel();
        if (!activePaletteImageData()) {
          els.paletteHint.textContent = config.paletteMode === "generatedReference"
            ? "Choose reference image."
            : "Open image to generate palette.";
        } else if (activeLocks > 0) {
          els.paletteHint.textContent = `Generated palette from ${sourceLabel}: click locks ${generatedLockLabelPlural()}; Shift-click shows diagnostic overlay. ${activeLocks}/${maxLocks} locked.`;
        } else {
          els.paletteHint.textContent = `Generated palette from ${sourceLabel}: click locks ${generatedLockLabelPlural()}; Shift-click shows diagnostic overlay.`;
        }
      } else if (config.paletteMode === "harmony") {
        const relationship = HARMONY_RELATIONSHIPS[config.harmonyRelationship] ?? HARMONY_RELATIONSHIPS[DEFAULT_CONFIG.harmonyRelationship];
        const regionContrast = HARMONY_REGION_CONTRASTS[config.harmonyRegionContrast] ?? HARMONY_REGION_CONTRASTS[DEFAULT_CONFIG.harmonyRegionContrast];
        const rampSteepness = Number(config.harmonyRampSteepness ?? DEFAULT_CONFIG.harmonyRampSteepness);
        els.paletteHint.textContent = `${relationship.label} from ${config.seedSwatch}; ${regionContrast.label}; ramp ${rampSteepness.toFixed(2)}×. Shift-click shows diagnostic overlay.`;
      } else if (config.paletteMode === "cosine") {
        const preset = config.cosinePreset === "custom"
          ? {label: "Custom"}
          : COSINE_PALETTE_PRESETS[config.cosinePreset] ?? COSINE_PALETTE_PRESETS[DEFAULT_CONFIG.cosinePreset];
        els.paletteHint.textContent = `${preset.label} cosine palette; Shift-click shows diagnostic overlay.`;
      } else if (config.paletteMode === "manual") {
        const assist = Number(config.generatedAssist || 0) / 100;
        const adjusted = Math.abs((Number(config.paletteGamma) || 1) - 1) > 1e-6
          || Math.abs((Number(config.gammaC) || 1) - 1) > 1e-6
          || Math.abs(Number(config.paletteHue) || 0) > 1e-6;
        els.paletteHint.textContent = (assist > 0 && state.imageData) || adjusted
          ? "Manual palette: click edits source/match anchors; Ctrl-click mutes/unmutes; Shift-click shows diagnostic overlay for the effective color."
          : "Manual palette: click edits source/match anchors; Ctrl-click mutes/unmutes; Shift-click shows diagnostic overlay.";
      } else {
        els.paletteHint.textContent = "Shift-click shows diagnostic overlay.";
      }
    }
  }

  function clearManualCycleTags({announce = true} = {}) {
    if (!syncCycleManualKeys().length) {
      updateGeneratedLockUi();
      syncCycleControls();
      if (announce) setStatus("No cycle tags are set.");
      return;
    }
    config.cycleManualKeys = [];
    if (manualCycleModeEnabled()) markPaletteDirty();
    updateGeneratedLockUi();
    syncCycleControls();
    if (announce) setStatus("Cleared manual cycle tags.");
    queueRender();
  }

  function toggleManualCycleTag(record) {
    if (!cycleTaggable(record)) return;
    const keys = syncCycleManualKeys();
    const index = keys.indexOf(record.cycleKey);
    if (index >= 0) {
      keys.splice(index, 1);
      config.cycleManualKeys = keys;
      markPaletteDirty();
      updateGeneratedLockUi();
      syncCycleControls();
      setStatus(`Removed ${record.hex ?? labToHex(record.lab)} from manual cycling.`);
      queueRender();
      return;
    }
    keys.push(record.cycleKey);
    config.cycleManualKeys = keys;
    markPaletteDirty();
    updateGeneratedLockUi();
    syncCycleControls();
    setStatus(`Tagged ${record.hex ?? labToHex(record.lab)} for manual cycling.`);
    queueRender();
  }

  function toggleManualSwatchMute(record) {
    if (!manualSwatchEditable(record)) return;
    const identifier = record.swatchId ?? record.sourceIndex;
    const wasMuted = manualSwatchMuted(identifier) || !!record.muted;
    const next = toggleManualSwatchMuted(identifier);
    if (!next) {
      setStatus("At least one manual swatch must stay active.");
      return;
    }
    markPaletteDirty();
    syncCycleControls();
    setStatus(`${next.hex ?? record.hex ?? labToHex(record.lab)} ${wasMuted ? "unmuted" : "muted"}; muted swatches stay visible but are not assigned.`);
    queueRender();
  }

  function diagnosticOverlayState() {
    const overlay = state.diagnostics?.overlay || {};
    const mode = ["swatch", "difference"].includes(overlay.mode) ? overlay.mode : "none";
    const swatchIndex = Number.isInteger(overlay.swatchIndex) ? overlay.swatchIndex : null;
    return {mode, swatchIndex};
  }

  function toggleDiagnosticOverlayForSwatch(swatchIndex) {
    const index = Number(swatchIndex);
    if (!Number.isInteger(index)) return;
    const current = diagnosticOverlayState();
    const alreadyActive = current.mode === "swatch" && current.swatchIndex === index;
    setDiagnosticOverlay(alreadyActive ? {mode: "none"} : {mode: "swatch", swatchIndex: index});
    renderSwatches();
  }

  function clearGeneratedLocks({announce = true} = {}) {
    if (!syncGeneratedLocks().length) {
      updateGeneratedLockUi();
      if (announce) setStatus(`No generated ${generatedLockLabelPlural()} are locked.`);
      return;
    }
    config.generatedLocks = [];
    markPaletteDirty();
    updateGeneratedLockUi();
    if (announce) setStatus(`Cleared generated ${generatedLockLabel()} locks.`);
    queueRender();
  }

  function toggleGeneratedFamilyLock(record) {
    if (!generatedSwatchLockable(record)) return;
    const locks = syncGeneratedLocks();
    const seedHex = swatchSeedHex(record);
    const existingIndex = locks.findIndex(entry => entry.hex === seedHex || (record.lockId && entry.id === record.lockId));
    if (existingIndex >= 0) {
      locks.splice(existingIndex, 1);
      config.generatedLocks = locks;
      markPaletteDirty();
      updateGeneratedLockUi();
      setStatus(`Unlocked ${generatedLockLabel()} ${seedHex}.`);
      queueRender();
      return;
    }
    const maxLocks = generatedFamilyCount();
    if (locks.length >= maxLocks) {
      setStatus(`All ${maxLocks} generated ${generatedLockLabelPlural()} are already locked.`);
      return;
    }
    locks.push({
      id: `lock-${Date.now().toString(36)}-${locks.length.toString(36)}`,
      hex: seedHex,
      lab: swatchSeedLab(record),
      colorSpace: "oklab-scaled"
    });
    config.generatedLocks = locks;
    markPaletteDirty();
    updateGeneratedLockUi();
    setStatus(`Locked ${generatedLockLabel()} ${seedHex}.`);
    queueRender();
  }

  function renderSwatches() {
    const wrap = els.palettePreview;
    if (!wrap) return;
    syncPaletteSwatchScaleUi({config, els});
    wrap.innerHTML = "";
    const records = state.paletteRecords.length ? state.paletteRecords : state.palette.map((lab, sourceIndex) => makePaletteRecord({lab, source: "legacy", sourceIndex}));
    const cycleTagMode = manualCycleModeEnabled();
    wrap.classList.toggle("is-generated-lock-mode", isGeneratedPaletteMode() && !!activePaletteImageData() && !cycleTagMode);
    wrap.classList.toggle("is-manual-edit-mode", config.paletteMode === "manual" && !cycleTagMode);
    wrap.classList.toggle("is-cycle-tag-mode", cycleTagMode);
    for (const [swatchPosition, record] of records.entries()) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      const hex = record.hex ?? labToHex(record.lab);
      const swatchIndex = Number.isInteger(record.displayIndex) ? record.displayIndex : swatchPosition;
      const diagnosticOverlay = diagnosticOverlayState();
      const diagnosticActive = diagnosticOverlay.mode === "swatch" && diagnosticOverlay.swatchIndex === swatchIndex;
      chip.dataset.paletteId = record.id;
      chip.dataset.source = record.source;
      chip.dataset.familyId = record.familyId ?? "";
      chip.dataset.variant = record.variant ?? "single";
      chip.dataset.displayIndex = String(record.displayIndex ?? "");
      chip.dataset.diagnosticSwatchIndex = String(swatchIndex);
      chip.dataset.sourceIndex = Number.isInteger(record.sourceIndex) ? String(record.sourceIndex) : "";
      chip.dataset.swatchId = record.swatchId ?? "";
      const lockable = !cycleTagMode && generatedSwatchLockable(record);
      const editable = !cycleTagMode && manualSwatchEditable(record);
      const muted = editable && (manualSwatchMuted(record.swatchId ?? record.sourceIndex) || !!record.muted);
      const tagged = cycleTagMode && cycleTagged(record);
      const locked = lockable && !!record.locked;
      const editing = editable && state.manualEditor.swatchId === record.swatchId;
      const sourceHex = editable ? manualSourceHex(record.swatchId ?? record.sourceIndex) : null;
      const aliasHex = editable ? manualMatchAliasHex(record.swatchId ?? record.sourceIndex) : null;
      const sourceAliasHex = editable && config.aliasAllSources ? sourceHex : null;
      chip.dataset.locked = locked ? "true" : "false";
      chip.dataset.cycleTagged = tagged ? "true" : "false";
      chip.dataset.muted = muted ? "true" : "false";
      chip.style.background = hex;
      chip.setAttribute("aria-pressed", cycleTagMode ? String(tagged) : (lockable ? String(locked) : (editable ? String(editing) : "false")));
      if (cycleTagMode || lockable) chip.classList.add("is-lockable");
      if (editable) chip.classList.add("is-editable");
      if (muted) chip.classList.add("is-muted");
      if (editing) chip.classList.add("is-editing");
      if (diagnosticActive) chip.classList.add("is-diagnostic-overlay");
      const extraAnchors = [];
      if (aliasHex) extraAnchors.push({hex: aliasHex, kind: sourceHex && aliasHex === sourceHex ? "source" : "extra"});
      if (sourceAliasHex && sourceAliasHex !== aliasHex) extraAnchors.push({hex: sourceAliasHex, kind: "global source"});
      if (extraAnchors.length) {
        chip.classList.add("has-match-alias");
        const indicator = document.createElement("span");
        const primaryAnchor = extraAnchors[0];
        indicator.className = `chip-alias-indicator${primaryAnchor.kind.includes("source") ? " is-source-alias" : ""}`;
        indicator.setAttribute("aria-hidden", "true");
        indicator.style.background = primaryAnchor.hex;
        const anchorList = extraAnchors.map(anchor => `${anchor.kind} ${colorInfoLabel(anchor.hex)}`).join(" + ");
        indicator.title = `Also catches ${anchorList}; current ${colorInfoLabel(hex, record.lab)} always matches → renders ${colorInfoLabel(hex, record.lab)}`;
        chip.append(indicator);
      }
      if (tagged) {
        chip.classList.add("is-cycle-tagged");
        const indicator = document.createElement("span");
        indicator.className = "chip-cycle-indicator";
        indicator.setAttribute("aria-hidden", "true");
        chip.append(indicator);
      }
      if (locked) {
        chip.classList.add("is-locked");
        const indicator = document.createElement("span");
        indicator.className = "chip-lock-indicator";
        indicator.setAttribute("aria-hidden", "true");
        chip.append(indicator);
      }
      const titleParts = [colorInfoLabel(hex, record.lab)];
      if (record.variant && record.variant !== "single") titleParts.push(record.variant);
      if (cycleTagMode) titleParts.push(tagged ? "Click to remove from manual cycle" : "Click to tag for manual cycle", diagnosticActive ? "Shift-click to turn off diagnostic overlay" : "Shift-click to show diagnostic overlay");
      else if (lockable) titleParts.push(locked ? `Click to unlock ${generatedLockLabel()}` : `Click to lock ${generatedLockLabel()}`, diagnosticActive ? "Shift-click to turn off diagnostic overlay" : "Shift-click to show diagnostic overlay");
      else if (editable) {
        if (muted) titleParts.push("muted; not assigned");
        if (sourceHex !== hex) titleParts.push(`source ${colorInfoLabel(sourceHex)}`);
        if (!muted) titleParts.push(`always catches current ${colorInfoLabel(hex, record.lab)}`);
        if (!muted && aliasHex) titleParts.push(`also catches ${colorInfoLabel(aliasHex)} → renders ${colorInfoLabel(hex, record.lab)}`);
        if (!muted && sourceAliasHex && sourceAliasHex !== aliasHex) titleParts.push(`also catches original source ${colorInfoLabel(sourceAliasHex)} → renders ${colorInfoLabel(hex, record.lab)}`);
        titleParts.push("Click to edit source/match anchors", muted ? "Ctrl-click to unmute" : "Ctrl-click to mute without removing", diagnosticActive ? "Shift-click to turn off diagnostic overlay" : "Shift-click to show diagnostic overlay for effective color");
      }
      else titleParts.push("Click to copy hex", diagnosticActive ? "Shift-click to turn off diagnostic overlay" : "Shift-click to show diagnostic overlay");
      chip.title = titleParts.join(" · ");
      chip.addEventListener("click", async event => {
        if (event.shiftKey) {
          toggleDiagnosticOverlayForSwatch(swatchIndex);
          return;
        }
        if (editable && (event.ctrlKey || event.metaKey)) {
          withHistory("Toggle manual swatch mute", () => toggleManualSwatchMute(record));
          return;
        }
        if (cycleTagMode) {
          withHistory("Toggle manual cycle tag", () => toggleManualCycleTag(record));
          return;
        }
        if (lockable) {
          withHistory("Toggle generated lock", () => toggleGeneratedFamilyLock(record));
          return;
        }
        if (editable) {
          openManualPaletteEditor(record);
          return;
        }
        await copyPaletteHex(hex);
      });
      chip.addEventListener("contextmenu", event => {
        if (!editable || !event.ctrlKey) return;
        event.preventDefault?.();
        withHistory("Toggle manual swatch mute", () => toggleManualSwatchMute(record));
      });
      wrap.append(chip);
    }
    const activeLocks = isGeneratedPaletteMode() ? activeGeneratedLocks().length : 0;
    const activeAliases = activeManualMatchAliasCount(records);
    const mutedCount = config.paletteMode === "manual" ? records.filter(record => !!record?.muted).length : 0;
    const cycleTags = manualCycleModeEnabled() ? manualCycleIndices(records).length : 0;
    if (els.paletteCount) {
      if (manualCycleModeEnabled()) {
        els.paletteCount.textContent = `${records.length} colors · ${cycleTags} cycle tag${cycleTags === 1 ? "" : "s"}`;
      } else if (config.paletteMode === "manual" && mutedCount > 0) {
        const countParts = [
          `${records.length} colors`,
          `${Math.max(0, records.length - mutedCount)} active`,
          `${mutedCount} muted`
        ];
        if (activeAliases > 0) countParts.push(`${activeAliases} extra anchor${activeAliases === 1 ? "" : "s"}`);
        els.paletteCount.textContent = countParts.join(" · ");
      } else {
        els.paletteCount.textContent = isGeneratedPaletteMode()
          ? `${records.length} colors · ${activeLocks} lock${activeLocks === 1 ? "" : "s"}`
          : (activeAliases > 0 ? `${records.length} colors · ${activeAliases} extra anchor${activeAliases === 1 ? "" : "s"}` : `${records.length} colors`);
      }
    }
    updateGeneratedLockUi();
    syncCycleControls(records);
    syncManualPaletteEditor(records);
    syncDynamicUiSkin({enabled: !!config.dynamicSkin, records});
  }

  return {
    generatedSwatchLockable,
    updateGeneratedLockUi,
    clearManualCycleTags,
    toggleManualCycleTag,
    clearGeneratedLocks,
    toggleGeneratedFamilyLock,
    syncPaletteSwatchScaleUi: (options = {}) => syncPaletteSwatchScaleUi({config, els, ...options}),
    renderSwatches
  };
}
