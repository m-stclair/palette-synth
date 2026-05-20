import { colorInfoLabel, normalizeHexColor } from "../color-utils.js";
import { attachColorPicker, syncColorPickerInput } from "./color-picker.js";

const MIN_RETAINED_POOLED_ROWS = 64;

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
  const activeRows = new Map();
  const rowPool = [];

  function currentIndexFor(view) {
    const id = view.binding.swatch?.id;
    const found = id ? manualSwatchIndexForId(id) : -1;
    return found >= 0 ? found : view.binding.index;
  }

  function updateColorControls(view, hex = view.binding.swatch?.hex || "#000000") {
    const index = view.binding.index;
    const label = `Swatch ${index + 1}`;
    const info = colorInfoLabel(hex);
    const valueChanged = view.input.value !== hex;
    const labelChanged = view.label !== label;

    if (valueChanged) view.input.value = hex;
    if (labelChanged) {
      view.label = label;
      view.input.setAttribute("aria-label", label);
      view.picker?.setLabel?.(label);
    }
    if (valueChanged || labelChanged) syncColorPickerInput(view.input);
    else view.input.title = `${label} · ${info}`;

    if (view.text.value !== hex) view.text.value = hex;
    view.text.title = info;
  }

  function createRow() {
    const doc = els.manualSwatches?.ownerDocument || globalThis.document;
    const binding = {swatch: null, index: -1, count: 0};

    const row = doc.createElement("div");
    row.className = "swatch-row";

    const input = doc.createElement("input");
    input.type = "text";
    const picker = attachColorPicker(input, {label: "Swatch"});

    const text = doc.createElement("input");
    text.type = "text";
    text.spellcheck = false;

    const lock = doc.createElement("button");
    lock.type = "button";
    lock.className = "swatch-lock";

    const remove = doc.createElement("button");
    remove.type = "button";
    remove.textContent = "−";

    const view = {row, input, picker, text, lock, remove, binding, label: null};

    input.addEventListener("input", () => {
      const swatch = binding.swatch;
      if (!swatch) return;
      const index = currentIndexFor(view);
      if (index < 0) return;

      beginHistory("Edit manual swatch");
      swatch.hex = normalizeHexColor(input.value, swatch.hex);
      config.manualPalette[index] = swatch;
      updateColorControls(view, swatch.hex);
      markPaletteDirty();
      queueRender();
    });
    input.addEventListener("change", () => commitHistory("Edit manual swatch"));
    input.addEventListener("blur", () => commitHistory("Edit manual swatch"));

    text.addEventListener("change", () => {
      const swatch = binding.swatch;
      if (!swatch) return;
      const index = currentIndexFor(view);
      if (index < 0) return;

      beginHistory("Edit manual swatch");
      const safe = normalizeHexColor(text.value, swatch.hex);
      swatch.hex = safe;
      config.manualPalette[index] = swatch;
      updateColorControls(view, safe);
      markPaletteDirty();
      queueRender();
      commitHistory("Edit manual swatch");
    });

    lock.addEventListener("click", () => {
      const swatch = binding.swatch;
      if (!swatch) return;
      const index = currentIndexFor(view);
      if (index < 0) return;

      withHistory("Toggle manual swatch lock", () => {
        swatch.locked = !swatch.locked;
        config.manualPalette[index] = swatch;
        renderManualSwatches();
      });
    });

    remove.addEventListener("click", () => {
      const swatch = binding.swatch;
      if (!swatch) return;
      const index = currentIndexFor(view);
      if (index < 0) return;

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

    row.append(input, text, lock, remove);
    return view;
  }

  function acquireRow() {
    return rowPool.pop() || createRow();
  }

  function recycleRow(view) {
    view.picker?.close?.({commit: false});
    view.binding.swatch = null;
    view.binding.index = -1;
    view.binding.count = 0;
    view.row.remove?.();
    rowPool.push(view);
  }

  function destroyRow(view) {
    view.picker?.destroy?.();
    view.binding.swatch = null;
    view.row.remove?.();
  }

  function trimRowPool(activeCount) {
    const maxPooledRows = Math.max(MIN_RETAINED_POOLED_ROWS, activeCount * 2);
    while (rowPool.length > maxPooledRows) destroyRow(rowPool.pop());
  }

  function updateRow(view, swatch, index, count) {
    view.binding.swatch = swatch;
    view.binding.index = index;
    view.binding.count = count;

    view.row.dataset.swatchId = swatch.id;
    updateColorControls(view, swatch.hex);

    view.lock.textContent = swatch.locked ? "●" : "○";
    view.lock.title = swatch.locked ? "Locked during capture" : "Unlocked during capture";
    view.lock.setAttribute("aria-pressed", String(!!swatch.locked));

    view.remove.disabled = count <= 1;
  }

  function syncChildOrder(parent, rows) {
    if (typeof parent.insertBefore !== "function" || !("firstChild" in parent)) {
      parent.innerHTML = "";
      parent.append(...rows);
      return;
    }

    let cursor = parent.firstChild;
    for (const row of rows) {
      if (row === cursor) {
        cursor = cursor.nextSibling;
        continue;
      }
      parent.insertBefore(row, cursor || null);
    }
    while (cursor) {
      const next = cursor.nextSibling;
      cursor.remove?.();
      cursor = next;
    }
  }

  function renderManualSwatches() {
    const wrap = els.manualSwatches;
    if (!wrap) return;

    const swatches = syncManualSwatches();
    const nextIds = new Set(swatches.map(swatch => swatch.id));

    for (const [id, view] of activeRows) {
      if (!nextIds.has(id)) {
        activeRows.delete(id);
        recycleRow(view);
      }
    }

    const rows = swatches.map((swatch, index) => {
      let view = activeRows.get(swatch.id);
      if (!view) {
        view = acquireRow();
        activeRows.set(swatch.id, view);
      }
      updateRow(view, swatch, index, swatches.length);
      return view.row;
    });

    syncChildOrder(wrap, rows);
    trimRowPool(swatches.length);
  }

  return {renderManualSwatches};
}
