function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const FOCUS_TOOLBAR_PANEL_EVENT = "palette-synth:focus-panel";

const INSPECTOR_TAB_BY_PANEL_KEY = {
  "pixel-inspector": "pixel",
  "selection-diagnostics": "selection",
  diagnostics: "diagnostics",
  histogram: "histogram"
};

export function bindFloatingPixelInspector({
  els = {},
  state = {},
  config = {},
  setPixelInspectorOpen = () => {},
  togglePixelInspector = () => {},
  setInspectorTab = () => {},
  refreshDiagnosticPixel = () => {},
  clearDiagnosticPixel = () => {},
  copyPixelHex = () => {},
  setStatus = () => {}
} = {}) {
  const pane = els.pixelInspectorPane;
  const body = globalThis.document?.body;
  if (pane && body && pane.parentElement !== body) body.appendChild(pane);
  const handle = els.pixelInspectorHandle;
  const toggle = els.togglePixelInspector;
  const close = els.closePixelInspector;
  const clear = els.clearPixelInspector;
  const copySource = els.copyPixelSource;
  const copyFinal = els.copyPixelFinal;
  const tabButtons = [els.inspectorTabPixel, els.inspectorTabSelection, els.inspectorTabDiagnostics, els.inspectorTabHistogram].filter(Boolean);
  if (!pane) return {destroy() {}};

  const listeners = [];
  const add = (target, type, listener, options) => {
    target?.addEventListener?.(type, listener, options);
    if (target?.removeEventListener) listeners.push([target, type, listener, options]);
  };

  function copy(kind) {
    const pixel = state.diagnostics?.pixel;
    if (!pixel) {
      setStatus("Inspect a pixel first.");
      return;
    }
    const blendAmount = Number(config.blendAmount);
    const blendActive = Math.abs((Number.isFinite(blendAmount) ? blendAmount : 1) - 1) > 1e-6;
    const hex = kind === "source" ? pixel.sourceHex : (blendActive ? pixel.finalHex : (pixel.fxHex || pixel.finalHex));
    if (!hex) return;
    copyPixelHex(hex);
  }

  add(toggle, "click", () => togglePixelInspector({announce: true}));
  add(close, "click", () => setPixelInspectorOpen(false, {announce: true}));
  add(clear, "click", () => clearDiagnosticPixel({announce: true}));
  add(copySource, "click", () => copy("source"));
  add(copyFinal, "click", () => copy("final"));

  for (const button of tabButtons) {
    add(button, "click", () => {
      const tab = button.dataset?.inspectorTab;
      setInspectorTab(tab, {focus: false, announce: false});
    });
  }

  add(els.inspectorTabs, "keydown", event => {
    if (!tabButtons.length || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault?.();
    const currentIndex = Math.max(0, tabButtons.findIndex(button => button.getAttribute?.("aria-selected") === "true" || button.classList?.contains?.("is-active")));
    let nextIndex = currentIndex;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabButtons.length) % tabButtons.length;
    else if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabButtons.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabButtons.length - 1;
    setInspectorTab(tabButtons[nextIndex]?.dataset?.inspectorTab, {focus: true, announce: false});
  });

  add(pane, FOCUS_TOOLBAR_PANEL_EVENT, event => {
    const tab = INSPECTOR_TAB_BY_PANEL_KEY[event?.detail?.panelKey || event?.detail?.key];
    if (!tab) return;
    setInspectorTab(tab, {focus: false, announce: false, update: false});
    setPixelInspectorOpen(true, {announce: false});
    setInspectorTab(tab, {focus: true, announce: false, update: false});
    event.preventDefault?.();
  });

  add(pane, "dblclick", event => {
    if (event.target?.closest?.("button")) return;
    refreshDiagnosticPixel({announce: true});
  });

  if (handle) {
    add(handle, "pointerdown", event => {
      if (event.button !== 0 || event.target?.closest?.("button")) return;
      event.preventDefault?.();
      const startRect = pane.getBoundingClientRect?.();
      if (!startRect) return;
      const start = {x: event.clientX, y: event.clientY};
      const startLeft = startRect.left;
      const startTop = startRect.top;
      const pointerId = event.pointerId;
      handle.setPointerCapture?.(pointerId);
      pane.classList.add("is-dragging");

      const move = moveEvent => {
        if (moveEvent.pointerId !== pointerId) return;
        const maxLeft = Math.max(6, (globalThis.innerWidth || globalThis.document?.documentElement?.clientWidth || startRect.right) - pane.offsetWidth - 6);
        const maxTop = Math.max(6, (globalThis.innerHeight || globalThis.document?.documentElement?.clientHeight || startRect.bottom) - pane.offsetHeight - 6);
        pane.style.left = `${clamp(startLeft + moveEvent.clientX - start.x, 6, maxLeft)}px`;
        pane.style.top = `${clamp(startTop + moveEvent.clientY - start.y, 6, maxTop)}px`;
        pane.style.right = "auto";
      };

      const end = endEvent => {
        if (endEvent.pointerId !== pointerId) return;
        pane.classList.remove("is-dragging");
        handle.releasePointerCapture?.(pointerId);
        handle.removeEventListener?.("pointermove", move);
        handle.removeEventListener?.("pointerup", end);
        handle.removeEventListener?.("pointercancel", end);
        handle.removeEventListener?.("lostpointercapture", end);
      };

      handle.addEventListener?.("pointermove", move);
      handle.addEventListener?.("pointerup", end);
      handle.addEventListener?.("pointercancel", end);
      handle.addEventListener?.("lostpointercapture", end);
    });
  }

  return {
    destroy() {
      for (const [target, type, listener, options] of listeners) target.removeEventListener?.(type, listener, options);
    }
  };
}
