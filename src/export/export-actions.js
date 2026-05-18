import { $ } from "../ui/dom.js";
import { labToHex, paletteLabs } from "../color-utils.js";
import { downloadCanvasAsPng as defaultDownloadCanvasAsPng } from "./downloads.js";
import { downloadPaletteExport as defaultDownloadPaletteExport } from "./palette-files.js";

export function createExportActions({
  els,
  state,
  draw,
  renderFullImageCanvas,
  ensurePalette,
  getPaletteRecords,
  root = globalThis.document,
  downloadCanvasAsPng = defaultDownloadCanvasAsPng,
  downloadPaletteExport = defaultDownloadPaletteExport
}) {
  function reportExportError(label, err) {
    if (!els.error) return;
    els.error.textContent = `${label} failed: ${err.message}`;
    els.error.hidden = false;
  }

  function downloadCanvas() {
    draw();
    downloadCanvasAsPng(els.canvas, "palette-synth-view.png")
      .catch(err => reportExportError("View export", err));
  }

  function downloadFullImage() {
    try {
      const canvas = renderFullImageCanvas();
      if (!canvas) return;
      downloadCanvasAsPng(canvas, "palette-synth-full.png")
        .catch(err => reportExportError("Full export", err));
    } catch (err) {
      reportExportError("Full export", err);
    }
  }

  function currentPaletteHexColors() {
    ensurePalette();
    const labs = state.palette.length ? state.palette : paletteLabs(getPaletteRecords());
    return labs.map(labToHex);
  }

  async function exportPalette() {
    const format = $("paletteExportFormat", root)?.value || "png";
    try {
      await downloadPaletteExport(format, currentPaletteHexColors());
    } catch (err) {
      reportExportError("Palette export", err);
    }
  }

  return {
    reportExportError,
    downloadCanvas,
    downloadFullImage,
    currentPaletteHexColors,
    exportPalette
  };
}
