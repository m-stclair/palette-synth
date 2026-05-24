/** @typedef {import("../types.js").DeferredPort} DeferredPort */
/** @typedef {import("../types.js").AppPorts} AppPorts */

/**
 * @param {string} name
 * @returns {DeferredPort}
 */
function createDeferredPort(name) {
  let target = null;

  function method(methodName) {
    const fn = target?.[methodName];
    if (typeof fn !== "function") {
      throw new Error(`${name}.${methodName} called before ${name} is attached.`);
    }
    return fn.bind(target);
  }

  return {
    attach(next) {
      if (!next || typeof next !== "object") throw new Error(`${name} requires an object target.`);
      target = next;
      return next;
    },
    get() {
      return target;
    },
    call(methodName, ...args) {
      return method(methodName)(...args);
    },
    optionalCall(methodName, ...args) {
      const fn = target?.[methodName];
      return typeof fn === "function" ? fn.apply(target, args) : undefined;
    }
  };
}

/** @returns {AppPorts} */
export function createAppPorts() {
  const animationExport = createDeferredPort("animationExportController");
  const conditionalPanels = createDeferredPort("conditionalPanelsController");
  const config = createDeferredPort("configController");
  const cyclePreview = createDeferredPort("cyclePreviewController");
  const diagnostics = createDeferredPort("diagnosticsController");
  const mask = createDeferredPort("maskController");
  const paletteRegion = createDeferredPort("paletteRegionController");
  const renderedCanvas = createDeferredPort("renderedCanvasController");
  const renderSession = createDeferredPort("renderSessionController");
  const reset = createDeferredPort("resetController");

  return {
    animationExport,
    conditionalPanels,
    config,
    cyclePreview,
    diagnostics,
    mask,
    paletteRegion,
    renderedCanvas,
    renderSession,
    reset,

    animationExportActions: {
      animationLoopSpan: (...args) => animationExport.call("animationLoopSpan", ...args),
      syncAnimationExportUi: (...args) => animationExport.call("syncAnimationExportUi", ...args),
      sanitizeExportPrefix: (...args) => animationExport.call("sanitizeExportPrefix", ...args),
      useAnimationLoopSpan: (...args) => animationExport.call("useAnimationLoopSpan", ...args),
      exportAnimationPngZip: (...args) => animationExport.call("exportAnimationPngZip", ...args),
      exportAnimationGif: (...args) => animationExport.call("exportAnimationGif", ...args)
    },

    conditionalPanelsActions: {
      updateConditionalPanels: (...args) => conditionalPanels.call("updateConditionalPanels", ...args)
    },

    configActions: {
      cloneConfigSnapshot: (...args) => config.call("cloneConfigSnapshot", ...args),
      sanitizeConfigSnapshot: (...args) => config.call("sanitizeConfigSnapshot", ...args),
      replaceConfigSnapshot: (...args) => config.call("replaceConfigSnapshot", ...args),
      setOutputText: (...args) => config.call("setOutputText", ...args),
      handleControlDirty: (...args) => config.call("handleControlDirty", ...args)
    },

    cyclePreviewActions: {
      syncCycleControls: (...args) => cyclePreview.call("syncCycleControls", ...args),
      stopCyclePreview: (...args) => cyclePreview.call("stopCyclePreview", ...args),
      toggleCyclePreview: (...args) => cyclePreview.call("toggleCyclePreview", ...args)
    },

    diagnosticsActions: {
      updateDiagnostics: (...args) => diagnostics.call("updateDiagnostics", ...args),
      optionalUpdateDiagnostics: (...args) => diagnostics.optionalCall("updateDiagnostics", ...args),
      setDiagnosticOverlay: (...args) => diagnostics.call("setDiagnosticOverlay", ...args),
      optionalSetDiagnosticOverlay: (...args) => diagnostics.optionalCall("setDiagnosticOverlay", ...args)
    },

    maskActions: {
      syncMaskUi: (...args) => mask.call("syncMaskUi", ...args),
      updateMaskOverlay: (...args) => mask.call("updateMaskOverlay", ...args),
      optionalSyncMaskUi: (...args) => mask.optionalCall("syncMaskUi", ...args),
      optionalUpdateMaskOverlay: (...args) => mask.optionalCall("updateMaskOverlay", ...args)
    },

    paletteRegionActions: {
      cancelPaletteRegionDrag: (...args) => paletteRegion.call("cancelPaletteRegionDrag", ...args)
    },

    renderedCanvasActions: {
      renderFullImageCanvas: (...args) => renderedCanvas.call("renderFullImageCanvas", ...args)
    },

    render: {
      markTextureDirty: (...args) => renderSession.call("markTextureDirty", ...args),
      markPaletteDirty: (...args) => renderSession.call("markPaletteDirty", ...args),
      markMaskDirty: (...args) => renderSession.call("markMaskDirty", ...args),
      markLevelsDirty: (...args) => renderSession.call("markLevelsDirty", ...args),
      markEverythingDirty: (...args) => renderSession.call("markEverythingDirty", ...args),
      ensureTexture: (...args) => renderSession.call("ensureTexture", ...args),
      ensurePalette: (...args) => renderSession.call("ensurePalette", ...args),
      currentRenderSettings: (...args) => renderSession.call("currentRenderSettings", ...args),
      renderPaletteProgram: (...args) => renderSession.call("renderPaletteProgram", ...args),
      draw: (...args) => renderSession.call("draw", ...args),
      queueRender: (...args) => renderSession.call("queueRender", ...args)
    },

    resetActions: {
      resetSettings: (...args) => reset.call("resetSettings", ...args),
      resetPanelControls: (...args) => reset.call("resetPanelControls", ...args),
      panelHasResettableControls: (...args) => reset.call("panelHasResettableControls", ...args)
    }
  };
}
