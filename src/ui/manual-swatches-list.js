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
  function renderManualSwatches() {
    const wrap = els.manualSwatches;
    if (!wrap) return;
    wrap.innerHTML = "";
    const swatches = syncManualSwatches();
    swatches.forEach((swatch, index) => {
      const color = swatch.hex;
      const row = document.createElement("div");
      row.className = "swatch-row";
      row.dataset.swatchId = swatch.id;

      const input = document.createElement("input");
      input.type = "text";
      input.value = color;
      input.title = `Swatch ${index + 1} · ${colorInfoLabel(color)}`;
      input.setAttribute("aria-label", `Swatch ${index + 1} color picker`);
      attachColorPicker(input, {label: `Swatch ${index + 1}`});
      input.addEventListener("input", () => {
        beginHistory("Edit manual swatch");
        swatch.hex = normalizeHexColor(input.value, swatch.hex);
        input.value = swatch.hex;
        input.title = `Swatch ${index + 1} · ${colorInfoLabel(swatch.hex)}`;
        syncColorPickerInput(input);
        text.value = swatch.hex;
        text.title = colorInfoLabel(swatch.hex);
        config.manualPalette[index] = swatch;
        markPaletteDirty();
        queueRender();
      });
      input.addEventListener("change", () => commitHistory("Edit manual swatch"));
      input.addEventListener("blur", () => commitHistory("Edit manual swatch"));

      const text = document.createElement("input");
      text.type = "text";
      text.value = color;
      text.spellcheck = false;
      text.title = colorInfoLabel(color);
      text.addEventListener("change", () => {
        beginHistory("Edit manual swatch");
        const safe = normalizeHexColor(text.value, swatch.hex);
        swatch.hex = safe;
        config.manualPalette[index] = swatch;
        input.value = safe;
        input.title = `Swatch ${index + 1} · ${colorInfoLabel(safe)}`;
        syncColorPickerInput(input);
        text.value = safe;
        text.title = colorInfoLabel(safe);
        markPaletteDirty();
        queueRender();
        commitHistory("Edit manual swatch");
      });

      const lock = document.createElement("button");
      lock.type = "button";
      lock.className = "swatch-lock";
      lock.textContent = swatch.locked ? "●" : "○";
      lock.title = swatch.locked ? "Locked during capture" : "Unlocked during capture";
      lock.setAttribute("aria-pressed", String(!!swatch.locked));
      lock.addEventListener("click", () => withHistory("Toggle manual swatch lock", () => {
        swatch.locked = !swatch.locked;
        config.manualPalette[index] = swatch;
        renderManualSwatches();
      }));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "−";
      remove.disabled = swatches.length <= 1;
      remove.addEventListener("click", () => withHistory("Remove manual swatch", () => {
        const next = removeManualSwatchAt(index);
        if (state.manualEditor.swatchId === swatch.id) {
          state.manualEditor.swatchId = next?.id ?? null;
          state.manualEditor.sourceIndex = next ? manualSwatchIndexForId(next.id) : null;
        }
        renderManualSwatches();
        markPaletteDirty();
        queueRender();
      }));

      row.append(input, text, lock, remove);
      wrap.append(row);
    });
  }

  return {renderManualSwatches};
}
