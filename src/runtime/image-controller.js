import { DEFAULT_DEMO_IMAGE_ID, getDemoImage } from "../demo-image.js";
import { createLazyCanvasImageData } from "./lazy-image-data.js";

function sourceSize(source) {
  const width = source?.width || source?.naturalWidth || 0;
  const height = source?.height || source?.naturalHeight || 0;
  return {width, height};
}

export function scaledBitmapSize(source, maxImageSide) {
  const {width: sourceWidth, height: sourceHeight} = sourceSize(source);
  const longestSide = Math.max(sourceWidth, sourceHeight);
  const scale = longestSide > 0 ? Math.min(1, maxImageSide / longestSide) : 1;
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale))
  };
}

export function createImageController({
  state,
  config,
  els = {},
  root,
  Image,
  URL,
  cloneConfigSnapshot = () => ({}),
  pushHistorySnapshot = () => {},
  ensureLevelAdjustedSources = () => {},
  resetPaletteRegion = () => {},
  resetMask = () => {},
  resetView = () => {},
  markEverythingDirty = () => {},
  markPaletteDirty = () => {},
  updateConditionalPanels = () => {},
  queueRender = () => {},
  setStatus = () => {}
} = {}) {
  if (!state || !config) {
    throw new TypeError("createImageController requires state and config dependencies");
  }

  function createImage() {
    if (typeof Image !== "function") throw new TypeError("createImageController requires an Image constructor");
    return new Image();
  }

  function createObjectUrl(file) {
    if (!URL || typeof URL.createObjectURL !== "function") {
      throw new TypeError("createImageController requires URL.createObjectURL");
    }
    return URL.createObjectURL(file);
  }

  function revokeObjectUrl(url) {
    if (URL && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
  }

  function updateReferenceImageStatus() {
    const el = els.referenceImageStatus || root?.getElementById?.("referenceImageStatus");
    if (!el) return;
    if (!state.referenceImageData) {
      el.textContent = "None";
      return;
    }
    const name = state.referenceImageName || "reference image";
    el.textContent = `${name}: ${state.referenceImageData.width}×${state.referenceImageData.height}`;
  }

  function loadImageFromBitmapSource(source, name = "image") {
    const {width, height} = scaledBitmapSize(source, state.maxImageSide);

    state.originalCanvas.width = width;
    state.originalCanvas.height = height;
    state.originalCtx = state.originalCanvas.getContext("2d", {willReadFrequently: true});
    state.originalCtx.clearRect(0, 0, width, height);
    state.originalCtx.drawImage(source, 0, 0, width, height);
    state.originalSourceVersion = (Number(state.originalSourceVersion) || 0) + 1;

    state.sourceCanvas.width = width;
    state.sourceCanvas.height = height;
    state.sourceCtx = state.sourceCanvas.getContext("2d", {willReadFrequently: true});
    state.sourceLevelsDirty = true;
    ensureLevelAdjustedSources();

    resetPaletteRegion({announce: false, dirty: false});
    resetMask({announce: false, resize: true, keepEnabled: false});
    resetView(false);
    markEverythingDirty();
    setStatus(`${name}: ${width}×${height}`);
    queueRender();
  }

  function loadReferenceImageFromBitmapSource(source, name = "reference image") {
    const {width, height} = scaledBitmapSize(source, state.maxImageSide);

    state.referenceOriginalCanvas.width = width;
    state.referenceOriginalCanvas.height = height;
    state.referenceOriginalCtx = state.referenceOriginalCanvas.getContext("2d", {willReadFrequently: true});
    state.referenceOriginalCtx.clearRect(0, 0, width, height);
    state.referenceOriginalCtx.drawImage(source, 0, 0, width, height);
    state.referenceOriginalSourceVersion = (Number(state.referenceOriginalSourceVersion) || 0) + 1;

    state.referenceCanvas.width = width;
    state.referenceCanvas.height = height;
    state.referenceCtx = state.referenceCanvas.getContext("2d", {willReadFrequently: true});
    state.referenceCtx.clearRect(0, 0, width, height);
    state.referenceCtx.drawImage(source, 0, 0, width, height);
    state.referenceLevelsDirty = false;
    state.referenceImageData = createLazyCanvasImageData(state.referenceCtx, width, height, {
      canvas: state.referenceCanvas,
      version: state.referenceOriginalSourceVersion
    });

    state.referenceImageName = name;
    config.paletteMode = "generatedReference";
    if (els.paletteMode) els.paletteMode.value = config.paletteMode;
    markPaletteDirty();
    updateConditionalPanels();
    updateReferenceImageStatus();
    setStatus(`Reference ${name}: ${width}×${height}`);
    queueRender();
  }

  function loadReferenceFile(file) {
    if (!file) return;
    const before = cloneConfigSnapshot();
    const url = createObjectUrl(file);
    const img = createImage();
    img.onload = () => {
      loadReferenceImageFromBitmapSource(img, file.name);
      pushHistorySnapshot(before, "Load reference image");
      revokeObjectUrl(url);
    };
    img.onerror = () => {
      revokeObjectUrl(url);
      setStatus("Could not load that reference image.");
    };
    img.src = url;
  }

  function loadFile(file) {
    if (!file) return;
    const url = createObjectUrl(file);
    const img = createImage();
    img.onload = () => {
      loadImageFromBitmapSource(img, file.name);
      revokeObjectUrl(url);
    };
    img.onerror = () => {
      revokeObjectUrl(url);
      setStatus("Could not load that image.");
    };
    img.src = url;
  }

  function loadDemo(id = DEFAULT_DEMO_IMAGE_ID) {
    const demo = getDemoImage(id);
    const img = createImage();
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(demo.svg)}`;
    img.onload = () => loadImageFromBitmapSource(img, demo.statusName || demo.name || "demo image");
    img.onerror = () => setStatus(`Could not load ${demo.name || "demo image"}.`);
    img.src = url;
  }

  return {
    updateReferenceImageStatus,
    loadImageFromBitmapSource,
    loadReferenceImageFromBitmapSource,
    loadReferenceFile,
    loadFile,
    loadDemo
  };
}
