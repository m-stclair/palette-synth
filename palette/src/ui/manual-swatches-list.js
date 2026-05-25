import { colorInfoLabel, normalizeHexColor } from "../color-utils.js";
import { attachColorPicker, syncColorPickerInput } from "./color-picker.js";

export function createManualSwatchesList({
  els,
  config,
  state,
  syncManualSwatches,
  manualSwatchIndexForId,
  removeManualSwatchAt,
  beginHistory,
  commitHistory,
  withHistory,
  markPaletteDirty,
  queueRender
}) {
  const swatchRowPool = [];

  function activeSwatchState(entry) {
    return entry?.state?.swatch ? entry.state : null;
  }

  function syncSwatchRow(entry, swatch, index, swatches) {
    const color = swatch.hex;
    const label = `Swatch ${index + 1}`;
    entry.state.swatch = swatch;
    entry.state.index = index;
    entry.state.swatches = swatches;

    entry.row.className = "swatch-row";
    entry.row.dataset.swatchId = swatch.id;

    entry.input.value = color;
    entry.input.title = `${label} · ${colorInfoLabel(color)}`;
    entry.input.setAttribute("aria-label", `${label} color picker`);
    syncColorPickerInput(entry.input);

    entry.text.value = color;
    entry.text.title = colorInfoLabel(color);

    entry.lock.textContent = swatch.locked ? "●" : "○";
    entry.lock.title = swatch.locked ? "Locked during capture" : "Unlocked during capture";
    entry.lock.setAttribute("aria-pressed", String(!!swatch.locked));

    entry.remove.disabled = swatches.length <= 1;
  }

  function applyColorInput(entry) {
    const swatchState = activeSwatchState(entry);
    if (!swatchState) return;
    const {swatch, index} = swatchState;
    beginHistory("Edit manual swatch");
    swatch.hex = normalizeHexColor(entry.input.value, swatch.hex);
    config.manualPalette[index] = swatch;
    syncSwatchRow(entry, swatch, index, swatchState.swatches);
    markPaletteDirty();
    queueRender();
  }

  function applyTextInput(entry) {
    const swatchState = activeSwatchState(entry);
    if (!swatchState) return;
    const {swatch, index} = swatchState;
    beginHistory("Edit manual swatch");
    swatch.hex = normalizeHexColor(entry.text.value, swatch.hex);
    config.manualPalette[index] = swatch;
    syncSwatchRow(entry, swatch, index, swatchState.swatches);
    markPaletteDirty();
    queueRender();
    commitHistory("Edit manual swatch");
  }

  function createSwatchRow() {
    const entry = {
      row: document.createElement("div"),
      input: document.createElement("input"),
      text: document.createElement("input"),
      lock: document.createElement("button"),
      remove: document.createElement("button"),
      state: {
        swatch: null,
        index: -1,
        swatches: []
      }
    };

    entry.row.className = "swatch-row";

    entry.input.type = "text";
    attachColorPicker(entry.input, {label: "Manual swatch"});
    entry.input.addEventListener("input", () => applyColorInput(entry));
    entry.input.addEventListener("change", () => commitHistory("Edit manual swatch"));
    entry.input.addEventListener("blur", () => commitHistory("Edit manual swatch"));

    entry.text.type = "text";
    entry.text.spellcheck = false;
    entry.text.addEventListener("change", () => applyTextInput(entry));

    entry.lock.type = "button";
    entry.lock.className = "swatch-lock";
    entry.lock.addEventListener("click", () => {
      const swatchState = activeSwatchState(entry);
      if (!swatchState) return;
      const {swatch, index} = swatchState;
      withHistory("Toggle manual swatch lock", () => {
        swatch.locked = !swatch.locked;
        config.manualPalette[index] = swatch;
        renderManualSwatches();
      });
    });

    entry.remove.type = "button";
    entry.remove.textContent = "−";
    entry.remove.addEventListener("click", () => {
      const swatchState = activeSwatchState(entry);
      if (!swatchState) return;
      const {swatch, index} = swatchState;
      withHistory("Remove manual swatch", () => {
        const next = removeManualSwatchAt(index);
        if (state.manualEditor.swatchId === swatch.id) {
          state.manualEditor.swatchId = next?.id ?? null;
          state.manualEditor.sourceIndex = next ? manualSwatchIndexForId(next.id) : null;
        }
        renderManualSwatches();
        markPaletteDirty();
        queueRender();
      });
    });

    entry.row.append(entry.input, entry.text, entry.lock, entry.remove);
    return entry;
  }

  function pooledSwatchRow(index) {
    while (swatchRowPool.length <= index) swatchRowPool.push(createSwatchRow());
    return swatchRowPool[index];
  }

  function renderManualSwatches() {
    const wrap = els.manualSwatches;
    if (!wrap) return;
    const swatches = syncManualSwatches();
    const rows = swatches.map((swatch, index) => {
      const entry = pooledSwatchRow(index);
      syncSwatchRow(entry, swatch, index, swatches);
      return entry.row;
    });

    for (let index = swatches.length; index < swatchRowPool.length; index++) {
      swatchRowPool[index].state.swatch = null;
      swatchRowPool[index].state.index = -1;
      swatchRowPool[index].state.swatches = [];
    }

    wrap.innerHTML = "";
    wrap.append(...rows);
  }

  return {renderManualSwatches};
}
