/** @typedef {import("../types.d.ts").RuntimeState} RuntimeState */

/**
 * @param {{document?: Document, maxImageSide?: number}} [options]
 * @returns {RuntimeState}
 */
export function createRuntimeState({document: doc = globalThis.document, maxImageSide = 2200} = {}) {
  if (!doc?.createElement) {
    throw new Error("createRuntimeState requires a document with createElement().");
  }

  const mask = {
    enabled: false,
    behavior: "cycleWithin",
    forbiddenSourceIndices: [],
    paintMode: "off",
    showOverlay: true,
    dragging: false,
    pointerId: null,
    lastPoint: null,
    captureTarget: null,
    brushSize: 48,
    canvas: null,
    ctx: null,
    texture: null,
    textureDirty: true,
    hasPaint: false
  };

  return {
    gl: null,
    program: null,
    programKey: "",
    texture: null,
    textureVersion: 0,
    paletteVersion: 0,
    originalCanvas: doc.createElement("canvas"),
    originalCtx: null,
    originalSourceVersion: 0,
    sourceCanvas: doc.createElement("canvas"),
    sourceCtx: null,
    imageData: null,
    sourceLevelsDirty: true,
    referenceOriginalCanvas: doc.createElement("canvas"),
    referenceOriginalCtx: null,
    referenceOriginalSourceVersion: 0,
    referenceCanvas: doc.createElement("canvas"),
    referenceCtx: null,
    referenceImageData: null,
    referenceImageName: "",
    referenceLevelsDirty: false,
    levels: {
      canvas: doc.createElement("canvas"),
      gl: null,
      program: null,
      texture: null
    },
    blockSample: {
      texture: null,
      framebuffer: null,
      program: null,
      programKey: "",
      width: 0,
      height: 0,
      blockSize: 0,
      sampleMode: "",
      dirty: true
    },
    paletteRegion: {
      enabled: false,
      dragging: false,
      pointerId: null,
      start: null,
      draftRect: null
    },
    mask,
    paletteRecords: [],
    palette: [],
    paletteBlock: null,
    paletteBaseBlock: null,
    paletteFeatures: null,
    paletteSourceIndices: null,
    paletteEntryCount: 0,
    textureDirty: true,
    paletteDirty: true,
    swatchesDirty: true,
    manualEditor: {
      sourceIndex: null,
      swatchId: null,
      colorInputActive: false
    },
    cycleAnimation: {
      playing: false,
      lastTick: 0,
      frameHandle: null
    },
    diagnostics: {
      signature: "",
      stats: null,
      histogramSignature: "",
      histogramSignatures: {},
      histogramStats: {},
      panelTab: "contribution",
      histogramTab: "luma",
      pixel: null,
      overlay: {
        mode: "none",
        swatchIndex: null
      }
    },
    paletteSelectionTrace: null,
    renderQueued: false,
    history: {
      undo: [],
      redo: [],
      pending: null,
      applying: false,
      limit: 80
    },
    recipes: [],
    manualPresets: [],
    animationExport: {
      frameCount: null,
      fps: 8,
      step: 1,
      prefix: "palette-synth-frame",
      exporting: false
    },
    maxImageSide,
    view: {
      zoom: 1,
      centerX: 0.5,
      centerY: 0.5,
      dragging: false,
      pointerId: null,
      lastClientX: 0,
      lastClientY: 0,
      clickStartX: 0,
      clickStartY: 0,
      movedForClick: false
    }
  };
}
