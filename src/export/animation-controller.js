import {
  animationLoopSpan as computeAnimationLoopSpan,
  buildAnimationFramePlan as createAnimationFramePlan,
  downloadAnimationPngZip,
  sanitizeExportPrefix as sanitizePrefix
} from "./animation-zip.js";
import { downloadAnimationGif } from "./animation-gif.js";

function noop() {}

export function createAnimationExportController({
  els = {},
  state,
  config,
  clamp,
  cyclePeriod,
  gcdInt,
  positiveMod,
  normalizedCycleOffset,
  manualCycleModeEnabled = () => false,
  getPaletteRecords = () => [],
  ensurePalette = noop,
  renderFullImageCanvas,
  setStatus = noop,
  downloadAnimationPngZipFn = downloadAnimationPngZip,
  downloadAnimationGifFn = downloadAnimationGif,
  now = () => new Date()
}) {
  function animationLoopSpan(records = state.paletteRecords, step = state.animationExport.step) {
    return computeAnimationLoopSpan(records, step, {cyclePeriod, gcdInt});
  }

  function setAnimationExporting(exporting) {
    state.animationExport.exporting = !!exporting;
    if (els.exportAnimationZipButton) els.exportAnimationZipButton.disabled = exporting || !state.imageData;
    if (els.exportAnimationGifButton) els.exportAnimationGifButton.disabled = exporting || !state.imageData;
    if (els.animUseLoopSpan) els.animUseLoopSpan.disabled = !!exporting;
    [els.animFrameCount, els.animFps, els.animStep, els.animPrefix].forEach(el => {
      if (el) el.disabled = !!exporting;
    });
  }

  function syncAnimationExportUi(records = state.paletteRecords) {
    const loopSpan = animationLoopSpan(records, state.animationExport.step);
    if (state.animationExport.frameCount == null) state.animationExport.frameCount = loopSpan;
    else state.animationExport.frameCount = clamp(Math.round(Number(state.animationExport.frameCount) || loopSpan), 1, 1000);
    state.animationExport.fps = clamp(Math.round(Number(state.animationExport.fps) || 8), 1, 60);
    state.animationExport.step = clamp(Math.round(Number(state.animationExport.step) || 1), 1, 64);
    state.animationExport.prefix = sanitizePrefix(state.animationExport.prefix);

    if (els.animFrameCount) els.animFrameCount.value = String(state.animationExport.frameCount);
    if (els.animFps) els.animFps.value = String(state.animationExport.fps);
    if (els.animStep) els.animStep.value = String(state.animationExport.step);
    if (els.animPrefix) els.animPrefix.value = state.animationExport.prefix;
    if (els.animLoopInfo) {
      const period = cyclePeriod(records);
      const startOffset = normalizedCycleOffset(config.cycleOffset, records);
      const regionName = manualCycleModeEnabled() ? "manual tags" : ["global", "thirds", "middle", "high", "low"][Number(config.CYCLE_MODE) || 0];
      els.animLoopInfo.textContent = `${loopSpan} frame${loopSpan === 1 ? "" : "s"} · ${regionName} · ${startOffset}/${Math.max(1, period)}`;
    }
    setAnimationExporting(state.animationExport.exporting);
  }

  function useAnimationLoopSpan() {
    const loopSpan = animationLoopSpan(state.paletteRecords, state.animationExport.step);
    state.animationExport.frameCount = loopSpan;
    syncAnimationExportUi(state.paletteRecords);
    setStatus(`Animation frame count set to the current loop span: ${loopSpan}.`);
  }

  function currentAnimationExportSettings(records = state.paletteRecords) {
    const safeRecords = Array.isArray(records) && records.length ? records : state.paletteRecords;
    const frameCount = clamp(Math.round(Number(state.animationExport.frameCount) || animationLoopSpan(safeRecords, state.animationExport.step)), 1, 1000);
    const fps = clamp(Math.round(Number(state.animationExport.fps) || 8), 1, 60);
    const step = clamp(Math.round(Number(state.animationExport.step) || 1), 1, 64);
    const prefix = sanitizePrefix(state.animationExport.prefix);
    const period = cyclePeriod(safeRecords);
    const startOffset = normalizedCycleOffset(config.cycleOffset, safeRecords);
    return {frameCount, fps, step, prefix, period, startOffset};
  }

  function buildAnimationFramePlan(settings, records = state.paletteRecords) {
    const safeRecords = Array.isArray(records) && records.length ? records : state.paletteRecords;
    const safe = currentAnimationExportSettings(safeRecords);
    const merged = {...safe, ...(settings || {})};
    return {
      ...createAnimationFramePlan(merged, {positiveMod}),
      loopSpan: animationLoopSpan(safeRecords, merged.step)
    };
  }

  function canExportAnimation() {
    if (state.animationExport.exporting) return false;
    if (!state.imageData || !state.sourceCanvas.width || !state.sourceCanvas.height) {
      setStatus("Open an image first, then export animation frames.");
      return false;
    }
    return true;
  }

  function animationManifest(plan, kind = "palette-synth-png-sequence") {
    return {
      app: "Palette Synth",
      kind,
      version: 1,
      exportedAt: now().toISOString(),
      width: state.sourceCanvas.width,
      height: state.sourceCanvas.height,
      fps: plan.fps,
      frameCount: plan.frameCount,
      stepPerFrame: plan.step,
      cyclePeriod: plan.period,
      loopSpan: plan.loopSpan,
      startOffset: plan.startOffset,
      cycleMode: manualCycleModeEnabled() ? "manual" : Number(config.CYCLE_MODE),
      files: plan.frames.map(frame => ({index: frame.index, cycleOffset: frame.cycleOffset, filename: frame.filename}))
    };
  }

  async function runAnimationExport({kind, manifestKind, download, successMessage}) {
    if (!canExportAnimation()) return;

    ensurePalette();
    const records = state.paletteRecords.length ? state.paletteRecords : getPaletteRecords();
    const settings = currentAnimationExportSettings(records);
    const plan = buildAnimationFramePlan(settings, records);

    setAnimationExporting(true);
    if (els.error) els.error.hidden = true;

    try {
      await download({
        plan,
        manifest: animationManifest(plan, manifestKind),
        renderFrameCanvas: frame => renderFullImageCanvas({cycleOffset: frame.cycleOffset, records}),
        onProgress: (frame, total) => setStatus(`Rendering ${kind} frame ${frame.index + 1}/${total}…`)
      });
      setStatus(successMessage(plan));
    } catch (err) {
      if (els.error) {
        els.error.textContent = `Animation export failed: ${err.message}`;
        els.error.hidden = false;
      }
      setStatus(`Animation export failed: ${err.message}`);
    } finally {
      setAnimationExporting(false);
      syncAnimationExportUi(records);
    }
  }

  async function exportAnimationPngZip() {
    await runAnimationExport({
      kind: "PNG",
      manifestKind: "palette-synth-png-sequence",
      download: downloadAnimationPngZipFn,
      successMessage: plan => `Exported ${plan.frameCount} PNG frame${plan.frameCount === 1 ? "" : "s"} as ${plan.prefix}.zip.`
    });
  }

  async function exportAnimationGif() {
    await runAnimationExport({
      kind: "GIF",
      manifestKind: "palette-synth-animated-gif",
      download: downloadAnimationGifFn,
      successMessage: plan => `Exported ${plan.frameCount} GIF frame${plan.frameCount === 1 ? "" : "s"} as ${plan.prefix}.gif.`
    });
  }

  return {
    animationLoopSpan,
    setAnimationExporting,
    syncAnimationExportUi,
    useAnimationLoopSpan,
    currentAnimationExportSettings,
    buildAnimationFramePlan,
    exportAnimationPngZip,
    exportAnimationGif,
    sanitizeExportPrefix: sanitizePrefix
  };
}
