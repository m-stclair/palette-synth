import { COSINE_PALETTE_PRESETS, HARMONY_REGION_CONTRASTS, HARMONY_RELATIONSHIPS } from "../constants.js";
import { DEFAULT_CONFIG } from "../state/config.js";
import { labToHex, makePaletteRecord } from "../color-utils.js";
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
  activeManualMatchAliasCount,
  withHistory,
  markPaletteDirty,
  queueRender,
  syncCycleControls,
  syncManualPaletteEditor,
  openManualPaletteEditor,
  copyPaletteHex,
  setStatus
}) {
  function generatedSwatchLockable(record) {
    return isGeneratedPaletteMode() && !!activePaletteImageData() && !!record && Array.isArray(record.lab);
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
          ? `Cycle tags: click to toggle; Shift-click copies. ${cycleTags} tagged.`
          : "Cycle tags: click to choose cycling colors; Shift-click copies.";
      } else if (isGeneratedPaletteMode()) {
        const sourceLabel = activePaletteImageLabel();
        if (!activePaletteImageData()) {
          els.paletteHint.textContent = config.paletteMode === "generatedReference"
            ? "Choose reference image."
            : "Open image to generate palette.";
        } else if (activeLocks > 0) {
          els.paletteHint.textContent = `Generated palette from ${sourceLabel}: click locks; Shift-click copies. ${activeLocks}/${maxLocks} locked.`;
        } else {
          els.paletteHint.textContent = `Generated palette from ${sourceLabel}: click locks; Shift-click copies.`;
        }
      } else if (config.paletteMode === "harmony") {
        const relationship = HARMONY_RELATIONSHIPS[config.harmonyRelationship] ?? HARMONY_RELATIONSHIPS[DEFAULT_CONFIG.harmonyRelationship];
        const regionContrast = HARMONY_REGION_CONTRASTS[config.harmonyRegionContrast] ?? HARMONY_REGION_CONTRASTS[DEFAULT_CONFIG.harmonyRegionContrast];
        els.paletteHint.textContent = `${relationship.label} from ${config.seedSwatch}; ${regionContrast.label}. Shift-click copies hex.`;
      } else if (config.paletteMode === "cosine") {
        const preset = config.cosinePreset === "custom"
          ? {label: "Custom"}
          : COSINE_PALETTE_PRESETS[config.cosinePreset] ?? COSINE_PALETTE_PRESETS[DEFAULT_CONFIG.cosinePreset];
        els.paletteHint.textContent = `${preset.label} cosine palette; Shift-click copies hex.`;
      } else if (config.paletteMode === "manual") {
        const assist = Number(config.generatedAssist || 0) / 100;
        const adjusted = Math.abs((Number(config.paletteGamma) || 1) - 1) > 1e-6
          || Math.abs((Number(config.gammaC) || 1) - 1) > 1e-6
          || Math.abs(Number(config.paletteHue) || 0) > 1e-6;
        els.paletteHint.textContent = (assist > 0 && state.imageData) || adjusted
          ? "Manual palette: click edits source; Shift-click copies effective hex."
          : "Manual palette: click edits; Shift-click copies.";
      } else {
        els.paletteHint.textContent = "Shift-click copies hex.";
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

  function clearGeneratedLocks({announce = true} = {}) {
    if (!syncGeneratedLocks().length) {
      updateGeneratedLockUi();
      if (announce) setStatus("No generated families are locked.");
      return;
    }
    config.generatedLocks = [];
    markPaletteDirty();
    updateGeneratedLockUi();
    if (announce) setStatus("Cleared generated family locks.");
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
      setStatus(`Unlocked family ${seedHex}.`);
      queueRender();
      return;
    }
    const maxLocks = generatedFamilyCount();
    if (locks.length >= maxLocks) {
      setStatus(`All ${maxLocks} generated families are already locked.`);
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
    setStatus(`Locked family ${seedHex}.`);
    queueRender();
  }

  function renderSwatches() {
    const wrap = els.palettePreview;
    if (!wrap) return;
    wrap.innerHTML = "";
    const records = state.paletteRecords.length ? state.paletteRecords : state.palette.map((lab, sourceIndex) => makePaletteRecord({lab, source: "legacy", sourceIndex}));
    const cycleTagMode = manualCycleModeEnabled();
    wrap.classList.toggle("is-generated-lock-mode", isGeneratedPaletteMode() && !!activePaletteImageData() && !cycleTagMode);
    wrap.classList.toggle("is-manual-edit-mode", config.paletteMode === "manual" && !cycleTagMode);
    wrap.classList.toggle("is-cycle-tag-mode", cycleTagMode);
    for (const record of records) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.dataset.paletteId = record.id;
      chip.dataset.source = record.source;
      chip.dataset.familyId = record.familyId ?? "";
      chip.dataset.variant = record.variant ?? "single";
      chip.dataset.displayIndex = String(record.displayIndex ?? "");
      chip.dataset.sourceIndex = Number.isInteger(record.sourceIndex) ? String(record.sourceIndex) : "";
      chip.dataset.swatchId = record.swatchId ?? "";
      const hex = record.hex ?? labToHex(record.lab);
      const lockable = !cycleTagMode && generatedSwatchLockable(record);
      const editable = !cycleTagMode && manualSwatchEditable(record);
      const tagged = cycleTagMode && cycleTagged(record);
      const locked = lockable && !!record.locked;
      const editing = editable && state.manualEditor.swatchId === record.swatchId;
      const aliasHex = editable ? manualMatchAliasHex(record.swatchId ?? record.sourceIndex) : null;
      const sourceAliasHex = editable && config.aliasAllSources ? manualSourceHex(record.swatchId ?? record.sourceIndex) : null;
      chip.dataset.locked = locked ? "true" : "false";
      chip.dataset.cycleTagged = tagged ? "true" : "false";
      chip.style.background = hex;
      chip.setAttribute("aria-pressed", cycleTagMode ? String(tagged) : (lockable ? String(locked) : (editable ? String(editing) : "false")));
      if (cycleTagMode || lockable) chip.classList.add("is-lockable");
      if (editable) chip.classList.add("is-editable");
      if (editing) chip.classList.add("is-editing");
      if (aliasHex || (sourceAliasHex && sourceAliasHex !== hex)) {
        chip.classList.add("has-match-alias");
        const indicator = document.createElement("span");
        indicator.className = "chip-alias-indicator";
        indicator.setAttribute("aria-hidden", "true");
        indicator.style.background = aliasHex || sourceAliasHex;
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
      const titleParts = [hex];
      if (record.variant && record.variant !== "single") titleParts.push(record.variant);
      if (cycleTagMode) titleParts.push(tagged ? "Click to remove from manual cycle" : "Click to tag for manual cycle", "Shift-click to copy hex");
      else if (lockable) titleParts.push(locked ? "Click to unlock family" : "Click to lock family", "Shift-click to copy hex");
      else if (editable) {
        const sourceHex = manualSourceHex(record.swatchId ?? record.sourceIndex);
        if (sourceHex !== hex) titleParts.push(`source ${sourceHex}`);
        if (aliasHex) titleParts.push(`also matches ${aliasHex}`);
        if (sourceAliasHex && sourceAliasHex !== hex) titleParts.push(`also matches source ${sourceAliasHex}`);
        titleParts.push("Click to edit source/alias", "Shift-click to copy effective hex");
      }
      else titleParts.push("Click to copy hex");
      chip.title = titleParts.join(" · ");
      chip.addEventListener("click", async event => {
        if (cycleTagMode && !event.shiftKey) {
          withHistory("Toggle manual cycle tag", () => toggleManualCycleTag(record));
          return;
        }
        if (lockable && !event.shiftKey) {
          withHistory("Toggle generated lock", () => toggleGeneratedFamilyLock(record));
          return;
        }
        if (editable && !event.shiftKey) {
          openManualPaletteEditor(record);
          return;
        }
        await copyPaletteHex(hex);
      });
      wrap.append(chip);
    }
    const activeLocks = isGeneratedPaletteMode() ? activeGeneratedLocks().length : 0;
    const activeAliases = activeManualMatchAliasCount(records);
    const cycleTags = manualCycleModeEnabled() ? manualCycleIndices(records).length : 0;
    if (els.paletteCount) {
      if (manualCycleModeEnabled()) {
        els.paletteCount.textContent = `${records.length} colors · ${cycleTags} cycle tag${cycleTags === 1 ? "" : "s"}`;
      } else {
        els.paletteCount.textContent = isGeneratedPaletteMode()
          ? `${records.length} colors · ${activeLocks} lock${activeLocks === 1 ? "" : "s"}`
          : (activeAliases > 0 ? `${records.length} colors · ${activeAliases} match alias${activeAliases === 1 ? "" : "es"}` : `${records.length} colors`);
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
    renderSwatches
  };
}
