import { $, SELECTION_APPEAL_WEIGHT_CONTROLS } from "./dom.js";
import { COSINE_VECTOR_KEYS, effectivePixelBlockSize, isPixelArtEnabled, normalizeCosineCustomVectors, pixelBlockSliderValue, snapPaletteSizeToFamilyMultiple } from "../state/config.js";
import { createShortcutDispatcher } from "./shortcuts.js";
import { cyclePaletteSwatchScale, syncPaletteSwatchScaleUi } from "./palette-swatch-scale.js";
import { attachColorPicker, syncColorPickerInput } from "./color-picker.js";
import { DEFAULT_DEMO_IMAGE_ID, demoImages } from "../demo-image.js";
import { calculateAutoSourceLevelsFromCanvas } from "../runtime/source-auto-levels.js";

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
  "harmonyRampSteepness",
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
  "neutralIsCategory",
  "monotoneBlendDither",
  "blendPairRescue",
  "maxDistanceEnabled",
  "maxDistance",
  "tonalZoneWeight",
  "widthBonus",
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
  "generatedTintShadeFamilies",
  "cosineCustomTintShadeFamilies",
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
  "ditherProtectionEnabled",
  "edgeTightenEnabled",
  "edgeTightenStrength",
  "dynamicSkin"
];

const COLOR_CONTROL_KEYS = new Set(["seedSwatch"]);

const CONDITIONAL_PANEL_KEYS = new Set([
  "paletteMode",
  "cosinePreset",
  "assignMode",
  "outputMode",
  "monotoneBlendDither",
  "CYCLE_MODE",
  "generatedTintShadeFamilies",
  "cosineCustomTintShadeFamilies"
]);

function generatedPaletteUsesFamilySizes(config) {
  return ["generated", "generatedReference"].includes(config?.paletteMode)
    && config?.generatedTintShadeFamilies !== false;
}

function paletteSizeMinimum(config) {
  return generatedPaletteUsesFamilySizes(config) || ["harmony", "cosine"].includes(config?.paletteMode) ? 3 : 2;
}

export function syncGeneratedPaletteSizeControl(config, {root = document, setOutputText = null, snapToFamilies = false} = {}) {
  const el = $("paletteSize", root);
  if (!el || !config) return false;
  const usesFamilies = generatedPaletteUsesFamilySizes(config);
  const min = paletteSizeMinimum(config);
  el.step = usesFamilies ? "3" : "1";
  el.min = String(min);

  let sizeChanged = false;
  if (usesFamilies && snapToFamilies) {
    const snapped = snapPaletteSizeToFamilyMultiple(config.paletteSize);
    if (snapped !== config.paletteSize) {
      config.paletteSize = snapped;
      sizeChanged = true;
    }
  } else if (config.paletteSize < min) {
    config.paletteSize = min;
    sizeChanged = true;
  }

  el.value = config.paletteSize;
  const out = $("paletteSizeValue", root);
  if (typeof setOutputText === "function") setOutputText("paletteSize", out, config.paletteSize);
  else if (out) out.textContent = String(config.paletteSize);
  return sizeChanged;
}
export function pixelBlockSizeOutputText(config, value = config?.pixelBlockSize) {
  const raw = Number(value);
  const enabled = raw > 0 && isPixelArtEnabled(config);
  if (!enabled) return "Off";
  const size = Math.max(1, Math.min(16, Math.round(raw || effectivePixelBlockSize(config))));
  return size === 1 ? "1 source px" : `${size}×${size} source px`;
}

export function syncPixelArtControls(config, {root = document, setOutputText = null} = {}) {
  if (!config) return;
  const slider = $("pixelBlockSize", root);
  const sliderValue = pixelBlockSliderValue(config);
  if (slider) slider.value = sliderValue;

  const out = $("pixelBlockSizeValue", root);
  if (typeof setOutputText === "function") setOutputText("pixelBlockSize", out, sliderValue);
  else if (out) out.textContent = pixelBlockSizeOutputText(config, sliderValue);

  const options = $("pixelArtOptions", root);
  if (options) options.hidden = !isPixelArtEnabled(config);
  if (root?.body?.dataset) root.body.dataset.pixelArtEnabled = isPixelArtEnabled(config) ? "true" : "false";
}

function applyPixelBlockSizeSliderValue(config, rawValue) {
  const sliderValue = Math.max(0, Math.min(16, Math.round(Number(rawValue) || 0)));
  const nextEnabled = sliderValue > 0;
  const nextSize = nextEnabled ? sliderValue : 1;
  const enabledChanged = !Object.is(!!config.pixelArtEnabled, nextEnabled);
  const sizeChanged = !Object.is(config.pixelBlockSize, nextSize);
  config.pixelArtEnabled = nextEnabled;
  config.pixelBlockSize = nextSize;
  return {enabledChanged, sizeChanged, changed: enabledChanged || sizeChanged};
}


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
    else if (key === "pixelBlockSize") el.value = pixelBlockSliderValue(config);
    else el.value = config[key];
    if (COLOR_CONTROL_KEYS.has(key)) {
      attachColorPicker(el, {label: key === "seedSwatch" ? "Seed swatch" : key});
      syncColorPickerInput(el);
    }
    const out = $(`${key}Value`);
    setOutputText(key, out, el.type === "checkbox" ? !!el.checked : el.value);

    const applyControlValue = () => {
      if (key === "pixelBlockSize") {
        const {enabledChanged, sizeChanged, changed} = applyPixelBlockSizeSliderValue(config, el.value);
        syncPixelArtControls(config, {setOutputText});
        if (!changed) return false;
        if (enabledChanged) handleControlDirty("pixelArtEnabled");
        if (sizeChanged) handleControlDirty("pixelBlockSize");
        queueRender();
        return true;
      }

      let nextValue = controlValue(el);
      if (key === "cycleOffset") {
        nextValue = normalizedCycleOffset(nextValue, state.paletteRecords);
      }

      const changed = !Object.is(config[key], nextValue);
      config[key] = nextValue;

      const syncsPaletteSize = key === "generatedTintShadeFamilies" || key === "paletteMode";
      const sizeChanged = syncsPaletteSize
        ? syncGeneratedPaletteSizeControl(config, {setOutputText, snapToFamilies: generatedPaletteUsesFamilySizes(config)})
        : false;

      setOutputText(key, out, config[key]);

      if (!changed && !sizeChanged) return false;

      if (changed) handleControlDirty(key);
      if (sizeChanged) handleControlDirty("paletteSize");

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

  syncGeneratedPaletteSizeControl(config, {setOutputText});
  syncPixelArtControls(config, {setOutputText});

  bindCosineCustomVectorControls({
    config,
    handleControlDirty,
    updateConditionalPanels,
    queueRender,
    beginHistory,
    commitHistory
  });

  for (const {id, configKey} of SELECTION_APPEAL_WEIGHT_CONTROLS) {
    const el = $(id);
    if (!el) continue;
    el.value = config[configKey];
    const out = $(`${id}Value`);
    if (out) out.textContent = el.value;
    el.addEventListener("input", () => {
      beginHistory(`Change ${configKey}`);
      config[configKey] = Number(el.value);
      if (out) out.textContent = el.value;
      markPaletteDirty();
      queueRender();
    });
    el.addEventListener("change", () => commitHistory(`Change ${configKey}`));
    el.addEventListener("blur", () => commitHistory(`Change ${configKey}`));
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

export function populateDemoImageSelect(select, demos = demoImages, documentRef = document) {
  if (!select) return;
  select.textContent = "";
  for (const demo of demos) {
    const option = documentRef.createElement("option");
    option.value = demo.id;
    option.textContent = demo.name;
    option.title = demo.description || demo.name;
    select.append(option);
  }
  select.value = demos.some(demo => demo.id === DEFAULT_DEMO_IMAGE_ID) ? DEFAULT_DEMO_IMAGE_ID : demos[0]?.id || "";
}


function syncControlValue(root, config, setOutputText, key) {
  const el = $(key, root);
  if (!el) return;
  el.value = config[key];
  setOutputText?.(key, $(`${key}Value`, root), config[key]);
}

export function applyAutoSourceLevels({
  state,
  config,
  root = document,
  setOutputText,
  handleControlDirty,
  queueRender,
  setStatus,
  calculator = calculateAutoSourceLevelsFromCanvas
} = {}) {
  const result = calculator(state?.originalCanvas, state?.originalCtx);
  if (!result) {
    setStatus?.("Could not auto-level this source image.");
    return false;
  }

  const exposureChanged = !Object.is(config.levelsExposure, result.levelsExposure);
  const gammaChanged = !Object.is(config.levelsGamma, result.levelsGamma);
  config.levelsExposure = Number(result.levelsExposure.toFixed(2));
  config.levelsGamma = Number(result.levelsGamma.toFixed(2));
  syncControlValue(root, config, setOutputText, "levelsExposure");
  syncControlValue(root, config, setOutputText, "levelsGamma");

  if (exposureChanged || gammaChanged) {
    handleControlDirty?.("levelsExposure");
    queueRender?.();
  }
  setStatus?.(`Auto levels: lifted p${Math.round(result.highPercentile * 100)} to ${Math.round(result.highTarget * 100)}%.`);
  return true;
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
  invalidateCanvasRenderSize,
  loadFile,
  loadReferenceFile,
  loadDemo,
  downloadCanvas,
  downloadFullImage,
  exportPalette,
  copyCurrentPaletteHexStrings,
  randomizePalette,
  captureCurrentPaletteToManual,
  closeCapturePaletteMenu,
  loadPresetAsManual,
  switchPalettePreset,
  addManualSwatch,
  addManualKMeansSwatch,
  refitUnlockedManualWithKMeans,
  addPixelSourceToManualPalette,
  copyPixelHex,
  setPixelInspectorOpen,
  togglePixelInspector,
  togglePixelLoupe,
  setInspectorTab,
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
  cloneConfigSnapshot,
  replaceConfigSnapshot,
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
  window.addEventListener("resize", () => {
    if (typeof invalidateCanvasRenderSize === "function") {
      invalidateCanvasRenderSize({queue: true, afterCurrent: true});
    } else {
      queueRender();
    }
  });

  const demoImageSelect = $("demoImageSelect");
  if (demoImageSelect) {
    els.demoImageSelect = demoImageSelect;
    populateDemoImageSelect(demoImageSelect);
    demoImageSelect.addEventListener("change", event => loadDemo?.(event.target.value));
  }
  $("imageInput")?.addEventListener("change", event => loadFile(event.target.files?.[0]));
  $("referenceImageInput")?.addEventListener("change", event => loadReferenceFile(event.target.files?.[0]));
  $("autoSourceLevels")?.addEventListener("click", () => withHistory("Auto source levels", () => applyAutoSourceLevels({
    state,
    config,
    setOutputText,
    handleControlDirty,
    queueRender,
    setStatus
  })));
  $("downloadImage")?.addEventListener("click", downloadCanvas);
  $("downloadFullImage")?.addEventListener("click", downloadFullImage);
  $("exportPalette")?.addEventListener("click", exportPalette);
  $("copyPaletteHexStrings")?.addEventListener("click", copyCurrentPaletteHexStrings);
  $("randomizePalette")?.addEventListener("click", () => randomizePalette?.());
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
  $("addKMeansSwatch")?.addEventListener("click", addManualKMeansSwatch);
  $("refitUnlockedKMeans")?.addEventListener("click", refitUnlockedManualWithKMeans);
  $("addPixelSourceToManualPalette")?.addEventListener("click", addPixelSourceToManualPalette);
  $("importPaletteText")?.addEventListener("click", openManualPaletteTextDialog);
  $("cancelPaletteTextImport")?.addEventListener("click", closeManualPaletteTextDialog);
  $("applyPaletteTextImport")?.addEventListener("click", importManualPaletteText);
  $("manualPaletteTextDialog")?.addEventListener("click", event => {
    if (event.target === event.currentTarget) closeManualPaletteTextDialog();
  });
  $("lutInput")?.addEventListener("change", event => importLut(event.target.files?.[0]));
  syncPaletteSwatchScaleUi({config, els});
  $("paletteSwatchScaleToggle")?.addEventListener("click", () => withHistory("Change palette swatch size", () => {
    cyclePaletteSwatchScale({config, els, setStatus});
  }));
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
    copyCurrentPaletteHexStrings,
    captureCurrentPaletteToManual,
    switchPalettePreset,
    addPixelSourceToManualPalette,
    copyPixelHex,
    setPixelInspectorOpen,
    togglePixelInspector,
    togglePixelLoupe,
    setInspectorTab,
    clearDiagnosticPixel,
    nudgeDiagnosticPixel,
    pixelInspectorPanelIsOpen,
    getDisplayViewRect,
    zoomBy,
    resetView,
    resetSettings,
    cloneConfigSnapshot,
    replaceConfigSnapshot,
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
