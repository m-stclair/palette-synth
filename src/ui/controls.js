import { $, SELECT_WEIGHT_CONTROL_IDS } from "./dom.js";
import { COSINE_VECTOR_KEYS, normalizeCosineCustomVectors } from "../state/config.js";
import { createShortcutDispatcher } from "./shortcuts.js";
import { attachColorPicker, syncColorPickerInput } from "./color-picker.js";

export function cosineCustomInputId(key, channel) {
  return `cosineCustom${key.toUpperCase()}${channel}`;
}

export function syncCosineCustomVectorControls(config, root = document) {
  config.cosineCustomVectors = normalizeCosineCustomVectors(config.cosineCustomVectors);
  for (const key of COSINE_VECTOR_KEYS) {
    for (let channel = 0; channel < 3; channel++) {
      const el = $(cosineCustomInputId(key, channel), root);
      if (el) el.value = config.cosineCustomVectors[key][channel];
    }
  }
}

function bindCosineCustomVectorControls({
  config,
  handleControlDirty,
  updateConditionalPanels,
  queueRender,
  beginHistory,
  commitHistory
}) {
  syncCosineCustomVectorControls(config);
  for (const key of COSINE_VECTOR_KEYS) {
    for (let channel = 0; channel < 3; channel++) {
      const el = $(cosineCustomInputId(key, channel));
      if (!el) continue;
      const applyVectorValue = () => {
        config.cosineCustomVectors = normalizeCosineCustomVectors(config.cosineCustomVectors);
        const value = Number(el.value);
        config.cosineCustomVectors[key][channel] = Number.isFinite(value) ? value : 0;
        handleControlDirty("cosineCustomVectors");
        updateConditionalPanels();
        queueRender();
      };
      el.addEventListener("input", () => {
        beginHistory("Change cosine custom vectors");
        applyVectorValue();
      });
      el.addEventListener("change", () => {
        beginHistory("Change cosine custom vectors");
        applyVectorValue();
        commitHistory("Change cosine custom vectors");
      });
      el.addEventListener("blur", () => commitHistory("Change cosine custom vectors"));
    }
  }
}


export const SIMPLE_CONTROL_KEYS = [
  "paletteMode",
  "presetName",
  "paletteSize",
  "seedSwatch",
  "harmonyRelationship",
  "harmonyRegionContrast",
  "cosinePreset",
  "deltaL",
  "paletteGamma",
  "gammaC",
  "paletteHue",
  "aliasAllSources",
  "cycleOffset",
  "softness",
  "blendK",
  "lumaWeight",
  "chromaWeight",
  "hueWeight",
  "maxDistanceEnabled",
  "maxDistance",
  "hueSpread",
  "minDistance",
  "assignMode",
  "outputMode",
  "shadowCutoff",
  "highlightCutoff",
  "blendAmount",
  "showPalette",
  "sortMode",
  "blockSize",
  "seed",
  "samplingMode",
  "CYCLE_MODE",
  "cyclePreviewSpeed",
  "ditherPattern",
  "ditherAngle",
  "ditherLumaAmount",
  "ditherScale",
  "generatedAssist",
  "levelsExposure",
  "levelsGamma",
  "levelsShoulder",
  "levelsCenter",
  "levelsCurveAmount",
  "clarityAmount",
  "pixelBlockSize",
  "pixelBlockSampleMode",
  "despeckleEnabled",
  "despeckleStrength",
  "dynamicSkin"
];

const COLOR_CONTROL_KEYS = new Set(["seedSwatch"]);

const CONDITIONAL_PANEL_KEYS = new Set([
  "paletteMode",
  "cosinePreset",
  "assignMode",
  "outputMode",
  "CYCLE_MODE"
]);

export function bindControls({
  els,
  config,
  state,
  controlValue,
  normalizedCycleOffset,
  setOutputText,
  handleControlDirty,
  manualCycleModeEnabled,
  markPaletteDirty,
  syncCycleControls,
  updateConditionalPanels,
  queueRender,
  beginHistory,
  commitHistory
}) {
  for (const key of SIMPLE_CONTROL_KEYS) {
    const el = $(key);
    if (!el) continue;
    els[key] = el;
    if (key === "paletteMode" && config[key] === "preset") config[key] = "manual";
    if (el.type === "checkbox") el.checked = !!config[key];
    else el.value = config[key];
    if (COLOR_CONTROL_KEYS.has(key)) {
      attachColorPicker(el, {label: key === "seedSwatch" ? "Seed swatch" : key});
      syncColorPickerInput(el);
    }
    const out = $(`${key}Value`);
    if (out) out.textContent = el.type === "checkbox" ? String(!!el.checked) : el.value;

    const applyControlValue = () => {
      let nextValue = controlValue(el);
      if (key === "cycleOffset") {
        nextValue = normalizedCycleOffset(nextValue, state.paletteRecords);
      }

      const changed = !Object.is(config[key], nextValue);
      config[key] = nextValue;

      setOutputText(key, out, config[key]);

      if (!changed) return false;

      handleControlDirty(key);

      if (key === "cycleOffset" || key === "CYCLE_MODE" || key === "cyclePreviewSpeed") {
        if (manualCycleModeEnabled() && key === "cycleOffset") {
          markPaletteDirty({swatches: false});
        }
        syncCycleControls();
      }

      if (CONDITIONAL_PANEL_KEYS.has(key)) updateConditionalPanels();
      queueRender();
      return true;
    };

    el.addEventListener("input", () => {
      beginHistory(`Change ${key}`);
      applyControlValue();
    });
    el.addEventListener("change", () => {
      beginHistory(`Change ${key}`);
      applyControlValue();
      commitHistory(`Change ${key}`);
    });
    el.addEventListener("blur", () => commitHistory(`Change ${key}`));
  }

  bindCosineCustomVectorControls({
    config,
    handleControlDirty,
    updateConditionalPanels,
    queueRender,
    beginHistory,
    commitHistory
  });

  for (const [index, key] of SELECT_WEIGHT_CONTROL_IDS.entries()) {
    const el = $(key);
    if (!el) continue;
    el.value = config.selectWeights[index];
    const out = $(`${key}Value`);
    if (out) out.textContent = el.value;
    el.addEventListener("input", () => {
      beginHistory(`Change ${key}`);
      config.selectWeights[index] = Number(el.value);
      if (out) out.textContent = el.value;
      markPaletteDirty();
      queueRender();
    });
    el.addEventListener("change", () => commitHistory(`Change ${key}`));
    el.addEventListener("blur", () => commitHistory(`Change ${key}`));
  }
}

export function bindCompareControls({
  els,
  config,
  withHistory,
  setCompareEnabled,
  setCompareSplit,
  beginHistory,
  commitHistory
}) {
  els.compareToggle = $("compareToggle");
  els.compareSplit = $("compareSplit");
  els.compareSplitValue = $("compareSplitValue");

  if (els.compareToggle) {
    els.compareToggle.checked = !!config.compareEnabled;
    els.compareToggle.addEventListener("change", event => {
      withHistory("Toggle before/after", () => setCompareEnabled(event.target.checked));
    });
  }

  if (els.compareSplit) {
    els.compareSplit.value = Math.round(config.compareSplit * 100);
    els.compareSplit.addEventListener("input", event => {
      beginHistory("Change compare split");
      setCompareSplit(Number(event.target.value) / 100, {updateControl: false});
    });
    els.compareSplit.addEventListener("change", () => commitHistory("Change compare split"));
    els.compareSplit.addEventListener("blur", () => commitHistory("Change compare split"));
  }

  setCompareEnabled(config.compareEnabled);
  setCompareSplit(config.compareSplit);
}


export function hasDraggedFiles(event) {
  const dataTransfer = event?.dataTransfer;
  if (!dataTransfer) return false;

  const {types} = dataTransfer;
  if (types) {
    if (typeof types.includes === "function" && types.includes("Files")) return true;
    if (typeof types.contains === "function" && types.contains("Files")) return true;
    if (typeof types[Symbol.iterator] === "function" && Array.from(types).includes("Files")) return true;
  }

  return !!dataTransfer.files?.length;
}

export function bindImageDropControls({documentRef = document, windowRef = window, loadFile}) {
  let dragDepth = 0;

  const setDragging = dragging => {
    documentRef.body?.classList.toggle("dragging", dragging);
  };

  const clearDragging = () => {
    dragDepth = 0;
    setDragging(false);
  };

  const handleDragEnter = event => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepth += 1;
    setDragging(true);
  };

  const handleDragOver = event => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };

  const handleDragLeave = event => {
    if (!hasDraggedFiles(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (event.clientX <= 0 || event.clientY <= 0 || event.clientX >= windowRef.innerWidth || event.clientY >= windowRef.innerHeight) {
      clearDragging();
    }
  };

  const handleDrop = event => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    clearDragging();
    loadFile(event.dataTransfer.files?.[0]);
  };

  documentRef.addEventListener("dragenter", handleDragEnter);
  documentRef.addEventListener("dragover", handleDragOver);
  documentRef.addEventListener("dragleave", handleDragLeave);
  documentRef.addEventListener("drop", handleDrop);
  documentRef.addEventListener("dragend", clearDragging);
  windowRef.addEventListener?.("blur", clearDragging);
}

export function bindAppControls({
  els,
  config,
  state,
  withHistory,
  beginHistory,
  commitHistory,
  bindHistoryShortcuts,
  updateHistoryButtons,
  setOutputText,
  handleControlDirty,
  updateConditionalPanels,
  normalizedCycleOffset,
  manualCycleModeEnabled,
  setCompareEnabled,
  setCompareSplit,
  syncCycleControls,
  queueRender,
  loadFile,
  loadReferenceFile,
  downloadCanvas,
  downloadFullImage,
  exportPalette,
  copyCurrentPaletteHexStrings,
  captureCurrentPaletteToManual,
  closeCapturePaletteMenu,
  loadPresetAsManual,
  switchPalettePreset,
  addManualSwatch,
  addPixelSourceToManualPalette,
  copyPixelHex,
  setPixelInspectorOpen,
  togglePixelInspector,
  clearDiagnosticPixel,
  nudgeDiagnosticPixel,
  pixelInspectorPanelIsOpen,
  importLut,
  openManualPaletteTextDialog,
  closeManualPaletteTextDialog,
  importManualPaletteText,
  clearManualCycleTags,
  clearGeneratedLocks,
  togglePaletteRegionSelection,
  resetPaletteRegion,
  updatePaletteRegionUi,
  updatePaletteRegionOverlay,
  setStatus,
  toggleCyclePreview,
  getDisplayViewRect,
  zoomBy,
  resetView,
  markTextureDirty,
  markPaletteDirty,
  undoHistory,
  redoHistory,
  resetSettings,
  setDiagnosticOverlay,
  updateDiagnostics
}) {
  bindCompareControls({
    els,
    config,
    withHistory,
    setCompareEnabled,
    setCompareSplit,
    beginHistory,
    commitHistory
  });

  syncCycleControls();
  window.addEventListener("resize", queueRender);

  $("imageInput")?.addEventListener("change", event => loadFile(event.target.files?.[0]));
  $("referenceImageInput")?.addEventListener("change", event => loadReferenceFile(event.target.files?.[0]));
  $("downloadImage")?.addEventListener("click", downloadCanvas);
  $("downloadFullImage")?.addEventListener("click", downloadFullImage);
  $("exportPalette")?.addEventListener("click", exportPalette);
  $("copyPaletteHexStrings")?.addEventListener("click", copyCurrentPaletteHexStrings);
  $("capturePalette")?.addEventListener("click", () => captureCurrentPaletteToManual("replace"));
  $("capturePaletteMenu")?.querySelectorAll("[data-capture-strategy]").forEach(button => {
    button.addEventListener("click", () => {
      closeCapturePaletteMenu();
      captureCurrentPaletteToManual(button.dataset.captureStrategy || "replace");
    });
  });
  $("loadPresetAsManual")?.addEventListener("click", () => loadPresetAsManual());
  $("previousPresetAsManual")?.addEventListener("click", () => switchPalettePreset?.(-1));
  $("nextPresetAsManual")?.addEventListener("click", () => switchPalettePreset?.(1));
  $("addSwatch")?.addEventListener("click", addManualSwatch);
  $("addPixelSourceToManualPalette")?.addEventListener("click", addPixelSourceToManualPalette);
  $("importPaletteText")?.addEventListener("click", openManualPaletteTextDialog);
  $("cancelPaletteTextImport")?.addEventListener("click", closeManualPaletteTextDialog);
  $("applyPaletteTextImport")?.addEventListener("click", importManualPaletteText);
  $("manualPaletteTextDialog")?.addEventListener("click", event => {
    if (event.target === event.currentTarget) closeManualPaletteTextDialog();
  });
  $("lutInput")?.addEventListener("change", event => importLut(event.target.files?.[0]));
  $("clearCycleTags")?.addEventListener("click", () => withHistory("Clear cycle tags", () => clearManualCycleTags()));
  $("clearPaletteLocks")?.addEventListener("click", () => withHistory("Clear generated locks", () => clearGeneratedLocks()));
  $("selectPaletteRegion")?.addEventListener("click", togglePaletteRegionSelection);
  $("clearPaletteRegion")?.addEventListener("click", () => withHistory("Use full image", () => resetPaletteRegion({announce: true, dirty: true})));
  $("showPaletteRegion")?.addEventListener("change", event => withHistory("Toggle region box", () => {
    config.showPaletteRegion = !!event.target.checked;
    updatePaletteRegionUi();
    updatePaletteRegionOverlay();
    setStatus(config.showPaletteRegion ? "Selection box shown." : "Selection box hidden. Region sampling is unchanged.");
  }));
  $("cyclePreviewToggle")?.addEventListener("click", () => toggleCyclePreview());
  $("zoomOutButton")?.addEventListener("click", () => {
    const rect = getDisplayViewRect();
    zoomBy(220, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  $("zoomInButton")?.addEventListener("click", () => {
    const rect = getDisplayViewRect();
    zoomBy(-220, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  $("resetViewButton")?.addEventListener("click", () => resetView());
  $("pixelPerfectToggle")?.addEventListener("change", event => withHistory("Toggle pixel-perfect", () => {
    config.pixelPerfect = !!event.target.checked;
    els.canvas.classList.toggle("pixel-perfect", config.pixelPerfect);
    markTextureDirty();
    queueRender();
  }));
  $("undoButton")?.addEventListener("click", undoHistory);
  $("redoButton")?.addEventListener("click", redoHistory);

  bindHistoryShortcuts();
  updateHistoryButtons();

  $("resetButton")?.addEventListener("click", () => withHistory("Reset settings", resetSettings));

  createShortcutDispatcher({
    root: document,
    config,
    state,
    els,
    withHistory,
    setOutputText,
    handleControlDirty,
    updateConditionalPanels,
    setCompareEnabled,
    syncCycleControls,
    normalizedCycleOffset,
    manualCycleModeEnabled,
    markPaletteDirty,
    markTextureDirty,
    queueRender,
    loadFile,
    loadReferenceFile,
    exportPalette,
    downloadFullImage,
    captureCurrentPaletteToManual,
    switchPalettePreset,
    addPixelSourceToManualPalette,
    copyPixelHex,
    setPixelInspectorOpen,
    togglePixelInspector,
    clearDiagnosticPixel,
    nudgeDiagnosticPixel,
    pixelInspectorPanelIsOpen,
    getDisplayViewRect,
    zoomBy,
    resetView,
    resetSettings,
    setDiagnosticOverlay,
    updateDiagnostics,
    setStatus
  });

  bindImageDropControls({loadFile});
}

export function bindAnimationExportControls({
  els,
  state,
  clamp,
  animationLoopSpan,
  syncAnimationExportUi,
  sanitizeExportPrefix,
  useAnimationLoopSpan,
  exportAnimationPngZip,
  exportAnimationGif
}) {
  if (!els.animFrameCount) return;
  syncAnimationExportUi(state.paletteRecords);
  els.animFrameCount.addEventListener("input", () => {
    state.animationExport.frameCount = clamp(Math.round(Number(els.animFrameCount.value) || animationLoopSpan(state.paletteRecords, state.animationExport.step)), 1, 1000);
    syncAnimationExportUi(state.paletteRecords);
  });
  els.animFps.addEventListener("input", () => {
    state.animationExport.fps = clamp(Math.round(Number(els.animFps.value) || 8), 1, 60);
    syncAnimationExportUi(state.paletteRecords);
  });
  els.animStep.addEventListener("input", () => {
    state.animationExport.step = clamp(Math.round(Number(els.animStep.value) || 1), 1, 64);
    syncAnimationExportUi(state.paletteRecords);
  });
  els.animPrefix.addEventListener("change", () => {
    state.animationExport.prefix = sanitizeExportPrefix(els.animPrefix.value);
    syncAnimationExportUi(state.paletteRecords);
  });
  els.animUseLoopSpan?.addEventListener("click", useAnimationLoopSpan);
  els.exportAnimationZipButton?.addEventListener("click", exportAnimationPngZip);
  els.exportAnimationGifButton?.addEventListener("click", exportAnimationGif);
}

export function bindRecipeControls({
  els,
  loadStoredRecipes,
  updateRecipeControls,
  selectedRecipe,
  saveCurrentRecipe,
  loadSelectedRecipe,
  deleteSelectedRecipe,
  exportCurrentRecipe,
  exportSelectedRecipe,
  exportAllRecipes,
  importRecipeFile
}) {
  if (!els.recipeSelect) return;
  loadStoredRecipes();
  updateRecipeControls();
  els.recipeSelect.addEventListener("change", () => {
    const recipe = selectedRecipe();
    if (els.recipeName) els.recipeName.value = recipe?.name || "";
    updateRecipeControls(recipe?.id);
  });
  els.saveRecipeButton?.addEventListener("click", saveCurrentRecipe);
  els.loadRecipeButton?.addEventListener("click", loadSelectedRecipe);
  els.deleteRecipeButton?.addEventListener("click", deleteSelectedRecipe);
  els.exportCurrentRecipeButton?.addEventListener("click", exportCurrentRecipe);
  els.exportSelectedRecipeButton?.addEventListener("click", exportSelectedRecipe);
  els.exportAllRecipesButton?.addEventListener("click", exportAllRecipes);
  els.recipeImportInput?.addEventListener("change", event => importRecipeFile(event.target.files?.[0]));
}
