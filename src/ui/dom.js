export function $(id, root = document) {
  return root.getElementById(id);
}

export const UI_ELEMENT_IDS = [
  "canvas",
  "status",
  "error",
  "manualSwatches",
  "palettePreview",
  "paletteCount",
  "paletteHint",
  "paletteSwatchScaleToggle",
  "randomizePalette",
  "demoImageSelect",
  "clearCycleTags",
  "clearPaletteLocks",
  "viewStatus",
  "zoomOutButton",
  "zoomInButton",
  "resetViewButton",
  "pixelPerfectToggle",
  "dynamicSkin",
  "pixelBlockSize",
  "pixelBlockSizeValue",
  "pixelBlockSampleMode",
  "clarityAmount",
  "clarityAmountValue",
  "despeckleEnabled",
  "despeckleStrength",
  "despeckleStrengthValue",
  "cyclePreviewToggle",
  "cyclePreviewSpeed",
  "cyclePreviewSpeedValue",
  "cycleOffset",
  "cycleOffsetValue",
  "maskEnabled",
  "maskBehavior",
  "maskPaint",
  "maskShow",
  "maskErase",
  "maskClear",
  "maskBrushSize",
  "maskBrushSizeValue",
  "maskNote",
  "maskForbidPanel",
  "maskForbiddenColors",
  "undoButton",
  "redoButton",
  "recipeSelect",
  "recipeName",
  "saveRecipeButton",
  "loadRecipeButton",
  "deleteRecipeButton",
  "exportCurrentRecipeButton",
  "exportSelectedRecipeButton",
  "exportAllRecipesButton",
  "recipeImportInput",
  "animFrameCount",
  "animFps",
  "animStep",
  "animPrefix",
  "animLoopInfo",
  "animUseLoopSpan",
  "exportAnimationZipButton",
  "exportAnimationGifButton",
  "copyPaletteHexStrings",
  "cosineCustomA0",
  "cosineCustomA1",
  "cosineCustomA2",
  "cosineCustomB0",
  "cosineCustomB1",
  "cosineCustomB2",
  "cosineCustomC0",
  "cosineCustomC1",
  "cosineCustomC2",
  "cosineCustomD0",
  "cosineCustomD1",
  "cosineCustomD2",
  "referenceImageInput",
  "referenceImageStatus",
  "autoSourceLevels",
  "selectPaletteRegion",
  "clearPaletteRegion",
  "showPaletteRegion",
  "paletteRegionNote",
  "regionOverlay",
  "maskOverlay",
  "pixelProbeOverlay",
  "capturePalette",
  "capturePaletteMenu",
  "importPaletteText",
  "manualPaletteTextDialog",
  "manualPaletteTextInput",
  "cancelPaletteTextImport",
  "applyPaletteTextImport",
  "diagnosticsTabs",
  "diagnosticsContributionPanel",
  "diagnosticsHistogramPanel",
  "diagnosticsSummary",
  "diagnosticsSelection",
  "diagnosticsUsageHeading",
  "diagnosticsUsage",
  "diagnosticsHistogramHeading",
  "diagnosticsHistogram",
  "diagnosticsOverlayControls",
  "diagnosticsOverlayOff",
  "diagnosticsOverlayDifference",
  "diagnosticsOverlayStatus",
  "diagnosticsXray",
  "togglePixelInspector",
  "pixelInspectorPane",
  "pixelInspectorHandle",
  "inspectorTabs",
  "inspectorTabPixel",
  "inspectorTabSelection",
  "inspectorTabDiagnostics",
  "inspectorTabXray",
  "inspectorTabHistogram",
  "inspectorPanelPixel",
  "inspectorPanelSelection",
  "inspectorPanelDiagnostics",
  "inspectorPanelXray",
  "inspectorPanelHistogram",
  "closePixelInspector",
  "expandPixelInspector",
  "clearPixelInspector",
  "diagnosticsPixel",
  "copyPixelSource",
  "copyPixelFinal",
  "addPixelSourceToManualPalette"
];

export const SELECT_WEIGHT_CONTROL_IDS = [
  "selectMidtone",
  "selectOutlier",
  "selectChroma"
];

export function collectUiElements(target = {}, ids = UI_ELEMENT_IDS, root = document) {
  for (const id of ids) {
    target[id] = $(id, root);
  }
  return target;
}

export function syncConfigControls(config, root = document) {
  root.querySelectorAll("[id]").forEach(el => {
    if (Object.prototype.hasOwnProperty.call(config, el.id)) {
      if (el.type === "checkbox") el.checked = !!config[el.id];
      else el.value = config[el.id];
    }
  });
}

export function syncSelectWeightControls(config, root = document) {
  SELECT_WEIGHT_CONTROL_IDS.forEach((id, index) => {
    const el = $(id, root);
    const value = $(`${id}Value`, root);
    if (!el || !value) return;
    el.value = config.selectWeights[index];
    value.textContent = el.value;
  });
}

export function syncConfigValueLabels(config, root = document) {
  for (const key of Object.keys(config)) {
    const value = $(`${key}Value`, root);
    const control = $(key, root);
    if (value && control) {
      value.textContent = control.type === "checkbox" ? String(!!control.checked) : control.value;
    }
  }
}
