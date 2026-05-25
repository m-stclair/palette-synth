export function createCyclePreviewController({
  els = {},
  state,
  config,
  cyclePeriod,
  normalizedCycleOffset,
  positiveMod,
  manualCycleModeEnabled = () => false,
  markPaletteDirty = () => {},
  queueRender = () => {},
  setStatus = () => {},
  syncAnimationExportUi = () => {},
  requestAnimationFrame = globalThis.requestAnimationFrame,
  cancelAnimationFrame = globalThis.cancelAnimationFrame
} = {}) {
  if (!state || !config) throw new Error("Cycle preview controller requires state and config.");
  if (typeof cyclePeriod !== "function") throw new Error("Cycle preview controller requires cyclePeriod.");
  if (typeof normalizedCycleOffset !== "function") throw new Error("Cycle preview controller requires normalizedCycleOffset.");
  if (typeof positiveMod !== "function") throw new Error("Cycle preview controller requires positiveMod.");

  function syncCycleControls(records = state.paletteRecords) {
    const period = cyclePeriod(records);
    const offset = normalizedCycleOffset(config.cycleOffset, records);
    config.cycleOffset = offset;
    if (els.cycleOffset) {
      els.cycleOffset.max = String(Math.max(0, period - 1));
      els.cycleOffset.value = String(offset);
    }
    if (els.cycleOffsetValue) els.cycleOffsetValue.textContent = String(offset);
    if (els.cyclePreviewToggle) els.cyclePreviewToggle.textContent = state.cycleAnimation.playing ? "Pause preview" : "Play preview";
    if (els.cyclePreviewSpeedValue) els.cyclePreviewSpeedValue.textContent = `${Number(config.cyclePreviewSpeed).toFixed(1)} steps/s`;
    syncAnimationExportUi(records);
  }

  function stopCyclePreview() {
    state.cycleAnimation.playing = false;
    state.cycleAnimation.lastTick = 0;
    if (state.cycleAnimation.frameHandle) {
      cancelAnimationFrame(state.cycleAnimation.frameHandle);
      state.cycleAnimation.frameHandle = null;
    }
    syncCycleControls();
  }

  function cyclePreviewFrame(timestamp) {
    if (!state.cycleAnimation.playing) {
      state.cycleAnimation.frameHandle = null;
      return;
    }
    const period = cyclePeriod(state.paletteRecords);
    if (!state.cycleAnimation.lastTick) state.cycleAnimation.lastTick = timestamp;
    const dt = timestamp - state.cycleAnimation.lastTick;
    const stepDuration = 1000 / Math.max(0.25, Number(config.cyclePreviewSpeed) || 1);
    if (period > 1 && dt >= stepDuration) {
      const steps = Math.max(1, Math.floor(dt / stepDuration));
      config.cycleOffset = positiveMod(normalizedCycleOffset(config.cycleOffset, state.paletteRecords) + steps, period);
      state.cycleAnimation.lastTick = timestamp;
      syncCycleControls();
      if (manualCycleModeEnabled()) markPaletteDirty({swatches: false});
      queueRender();
    } else if (period <= 1) {
      state.cycleAnimation.lastTick = timestamp;
      if (config.cycleOffset !== 0) syncCycleControls();
    }
    state.cycleAnimation.frameHandle = requestAnimationFrame(cyclePreviewFrame);
  }

  function startCyclePreview() {
    if (state.cycleAnimation.playing) return;
    state.cycleAnimation.playing = true;
    state.cycleAnimation.lastTick = 0;
    syncCycleControls();
    const period = cyclePeriod(state.paletteRecords);
    if (period <= 1) {
      setStatus(manualCycleModeEnabled()
        ? "Preview running; tag colors whenever you want them to cycle."
        : "Preview running; the current cycle region has one color.");
    }
    state.cycleAnimation.frameHandle = requestAnimationFrame(cyclePreviewFrame);
  }

  function toggleCyclePreview() {
    if (state.cycleAnimation.playing) stopCyclePreview();
    else startCyclePreview();
  }

  return {
    syncCycleControls,
    stopCyclePreview,
    toggleCyclePreview
  };
}
