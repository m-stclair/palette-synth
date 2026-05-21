// Composition root only.
// Wire app domains here; keep behavior inside domain modules or lower-level controllers.

import {
  clamp,
  positiveMod
} from "../color-utils.js";

import { createCyclePreviewController } from "../runtime/cycle-preview.js";
import { createAppInitializer } from "./initializer.js";
import { createAppCore } from "./core.js";
import { createStatusDomain } from "./domains/status-domain.js";
import { createHistoryDomain } from "./domains/history-domain.js";
import { createManualDomain } from "./domains/manual-domain.js";
import { createPaletteDomain } from "./domains/palette-domain.js";
import { createDiagnosticsDomain } from "./domains/diagnostics-domain.js";
import { createViewDomain } from "./domains/view-domain.js";
import { createRenderDomain } from "./domains/render-domain.js";
import { createExportDomain } from "./domains/export-domain.js";
import { createImageDomain } from "./domains/image-domain.js";
import { createAppActionsDomain } from "./domains/app-actions-domain.js";
import { createAppPorts } from "./ports.js";


export function createPaletteSynthApp(options = {}) {
  const core = createAppCore(options);
  const {
    env,
    shaders,
    state,
    els,
    config
  } = core;
  const {
    document,
    window,
    Image,
    URL,
    requestAnimationFrame,
    cancelAnimationFrame,
    requestFrame,
    cancelFrame
  } = env;
  const ports = createAppPorts();
  const {
    cloneConfigSnapshot,
    replaceConfigSnapshot
  } = ports.configActions;
  const {
    markPaletteDirty,
    queueRender
  } = ports.render;

  const status = createStatusDomain({els, state});
  const {setStatus} = status;

  const history = createHistoryDomain({
    els,
    state,
    getSnapshot: cloneConfigSnapshot,
    applySnapshot: replaceConfigSnapshot,
    setStatus,
    maskActions: ports.maskActions,
    paletteRegionActions: ports.paletteRegionActions
  });

  const view = createViewDomain({
    els,
    state,
    config,
    render: ports.render,
    configActions: ports.configActions,
    history,
    conditionalPanelsActions: ports.conditionalPanelsActions,
    setStatus
  });

  const manual = createManualDomain({
    els,
    state,
    config,
    history,
    render: ports.render,
    copyPaletteHex,
    setStatus,
    clientPointToImagePixel: view.clientPointToImagePixel
  });

  const palette = createPaletteDomain({
    els,
    state,
    config,
    manual,
    history,
    render: ports.render,
    cyclePreviewActions: ports.cyclePreviewActions,
    diagnosticsActions: ports.diagnosticsActions,
    copyPaletteHex,
    setStatus
  });
  ports.paletteRegion.attach(view.paletteRegionController);
  ports.mask.attach(view.maskController);

  const diagnostics = createDiagnosticsDomain({
    els,
    state,
    config,
    palette,
    render: ports.render,
    view,
    env: {
      requestFrame,
      cancelFrame
    },
    setStatus
  });
  ports.diagnostics.attach(diagnostics);

  const render = createRenderDomain({
    els,
    state,
    config,
    shaders,
    palette,
    view,
    diagnostics,
    env: {requestFrame}
  });
  ports.renderSession.attach(render.renderSessionController);

  const exporting = createExportDomain({
    els,
    state,
    config,
    root: document,
    shaders,
    palette,
    render,
    setStatus
  });
  ports.renderedCanvas.attach(exporting.renderedCanvasController);
  ports.animationExport.attach(exporting.animationExportController);
  const {syncAnimationExportUi} = exporting;

  const image = createImageDomain({
    els,
    state,
    config,
    root: document,
    env: {Image, URL},
    configActions: ports.configActions,
    history,
    render,
    view,
    conditionalPanelsActions: ports.conditionalPanelsActions,
    setStatus
  });

  const cyclePreviewController = createCyclePreviewController({
    els,
    state,
    config,
    cyclePeriod: palette.cyclePeriod,
    normalizedCycleOffset: palette.normalizedCycleOffset,
    positiveMod,
    manualCycleModeEnabled: palette.manualCycleModeEnabled,
    markPaletteDirty,
    queueRender,
    setStatus,
    syncAnimationExportUi,
    requestAnimationFrame,
    cancelAnimationFrame
  });
  ports.cyclePreview.attach(cyclePreviewController);

  async function copyPaletteHex(hex) {
    try {
      await navigator.clipboard.writeText(hex);
      setStatus(`Copied ${hex}`);
    } catch {
      setStatus(hex);
    }
  }

  const appActions = createAppActionsDomain({
    els,
    state,
    config,
    root: document,
    env: {window, Image, URL},
    ports,
    history,
    manual,
    palette,
    view,
    render: ports.render,
    exporting,
    setStatus
  });
  const appInitializer = createAppInitializer({
    core,
    env,
    startup: {
      root: document,
      windowRef: window,
      clamp,
      createWebgl2Context: options.createWebgl2Context
    },
    history,
    render,
    palette,
    cyclePreview: cyclePreviewController,
    manual,
    view,
    diagnostics,
    files: image,
    exporting,
    appActions,
    status,
    copyPixelHex: copyPaletteHex
  });
  const {init} = appInitializer;

  return {
    init,
    state,
    config,
    els,
    cloneConfigSnapshot,
    replaceConfigSnapshot
  };
}
