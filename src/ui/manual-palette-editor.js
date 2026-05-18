import { clamp01, hexToLab, labToHex, normalizeHexColor } from "../color-utils.js";
import { attachColorPicker, syncColorPickerInput } from "./color-picker.js";

export function createManualPaletteEditor({
  els,
  getConfig,
  getState,
  syncManualSwatches,
  manualSwatchIndex,
  manualSwatchAt,
  manualSwatchIndexForId,
  manualSourceHex,
  manualMatchAliasHex,
  setManualMatchAlias,
  manualSwatchEditable,
  paletteRecordForManualSwatchId,
  beginHistory,
  commitHistory,
  withHistory,
  onSourceColorChange,
  onDuplicateSwatch,
  onRemoveSwatch,
  copyPaletteHex,
  setStatus
} = {}) {
  const config = () => getConfig?.() || {};
  const state = () => getState?.() || {};
  const editorState = () => {
    const currentState = state();
    if (!currentState.manualEditor) {
      currentState.manualEditor = {sourceIndex: null, swatchId: null, colorInputActive: false};
    }
    return currentState.manualEditor;
  };

  function ensureManualPaletteEditor() {
    if (els.paletteEditor) return els.paletteEditor;
    const editor = document.createElement("div");
    editor.id = "paletteEditor";
    editor.className = "palette-editor";
    editor.hidden = true;
    els.palettePreview?.after(editor);
    els.paletteEditor = editor;
    return editor;
  }

  function setManualSourceColor(identifier, color) {
    return typeof onSourceColorChange === "function" ? onSourceColorChange(identifier, color) : color;
  }

  function closeManualPaletteEditor() {
    const manualEditor = editorState();
    manualEditor.sourceIndex = null;
    manualEditor.swatchId = null;
    manualEditor.colorInputActive = false;
    if (els.paletteEditor) els.paletteEditor.hidden = true;
    if (els.palettePreview) {
      els.palettePreview.querySelectorAll(".chip.is-editing").forEach(chip => chip.classList.remove("is-editing"));
    }
  }

  function renderManualPaletteEditor(record = null) {
    const editor = ensureManualPaletteEditor();
    const manualEditor = editorState();
    const swatchId = record?.swatchId ?? manualEditor.swatchId;
    const index = swatchId ? manualSwatchIndexForId(swatchId) : (record?.sourceIndex ?? manualEditor.sourceIndex);
    const swatch = manualSwatchAt(index);
    if (config().paletteMode !== "manual" || !swatch || index < 0) {
      closeManualPaletteEditor();
      return;
    }

    manualEditor.swatchId = swatch.id;
    manualEditor.sourceIndex = index;
    const currentRecord = record?.swatchId === swatch.id ? record : paletteRecordForManualSwatchId(swatch.id);
    const sourceHex = manualSourceHex(swatch.id);
    const effectiveHex = currentRecord ? (currentRecord.hex ?? labToHex(currentRecord.lab)) : sourceHex;
    const cfg = config();
    const assistActive = clamp01(cfg.generatedAssist / 100) > 0 && !!state().imageData;
    const adjustmentsActive = Math.abs((Number(cfg.paletteGamma) || 1) - 1) > 1e-6
      || Math.abs((Number(cfg.gammaC) || 1) - 1) > 1e-6
      || Math.abs(Number(cfg.paletteHue) || 0) > 1e-6;
    const effectiveActive = assistActive || adjustmentsActive || effectiveHex !== sourceHex;

    editor.hidden = false;
    editor.innerHTML = "";

    const summary = document.createElement("div");
    summary.className = "palette-editor-summary";

    const sourceSwatch = document.createElement("span");
    sourceSwatch.className = "palette-editor-swatch";
    sourceSwatch.style.background = sourceHex;
    sourceSwatch.title = `Source ${sourceHex}`;

    const effectiveSwatch = document.createElement("span");
    effectiveSwatch.className = "palette-editor-swatch palette-editor-swatch-effective";
    effectiveSwatch.style.background = effectiveHex;
    effectiveSwatch.title = `Effective ${effectiveHex}`;

    const summaryText = document.createElement("div");
    summaryText.className = "palette-editor-text";
    const title = document.createElement("strong");
    title.textContent = `Swatch ${index + 1}`;
    const details = document.createElement("span");
    details.textContent = effectiveActive
      ? `source ${sourceHex} → effective ${effectiveHex}`
      : `source ${sourceHex}`;
    summaryText.append(title, details);
    summary.append(sourceSwatch, effectiveSwatch, summaryText);

    const controls = document.createElement("div");
    controls.className = "palette-editor-controls";

    const colorInput = document.createElement("input");
    colorInput.type = "text";
    colorInput.value = sourceHex;
    colorInput.title = "Edit source color";
    colorInput.setAttribute("aria-label", "Edit source color");
    attachColorPicker(colorInput, {label: "Edit source color"});
    const beginColorInputEdit = () => {
      editorState().colorInputActive = true;
    };
    const finishColorInputEdit = () => {
      commitHistory?.("Edit manual swatch");
      editorState().colorInputActive = false;
      syncManualPaletteEditor();
    };
    colorInput.addEventListener("pointerdown", beginColorInputEdit);
    colorInput.addEventListener("mousedown", beginColorInputEdit);
    colorInput.addEventListener("focus", beginColorInputEdit);
    colorInput.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") beginColorInputEdit();
    });
    colorInput.addEventListener("input", () => {
      beginColorInputEdit();
      beginHistory?.("Edit manual swatch");
      textInput.value = colorInput.value;
      setManualSourceColor(swatch.id, colorInput.value);
    });
    colorInput.addEventListener("change", finishColorInputEdit);
    colorInput.addEventListener("blur", () => commitHistory?.("Edit manual swatch"));

    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.value = sourceHex;
    textInput.spellcheck = false;
    textInput.setAttribute("aria-label", "Source hex color");
    textInput.addEventListener("change", () => {
      beginHistory?.("Edit manual swatch");
      const safe = normalizeHexColor(textInput.value, manualSourceHex(swatch.id));
      textInput.value = safe;
      colorInput.value = safe;
      syncColorPickerInput(colorInput);
      setManualSourceColor(swatch.id, safe);
      commitHistory?.("Edit manual swatch");
    });

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = assistActive ? "Copy effective" : "Copy hex";
    copyButton.addEventListener("click", () => copyPaletteHex?.(effectiveHex));

    const duplicateButton = document.createElement("button");
    duplicateButton.type = "button";
    duplicateButton.textContent = "Duplicate";
    duplicateButton.disabled = syncManualSwatches().length >= 42;
    duplicateButton.addEventListener("click", () => withHistory?.("Duplicate manual swatch", () => {
      const copy = onDuplicateSwatch?.({index, sourceHex, aliasHex: manualMatchAliasHex(swatch.id), swatchId: swatch.id});
      if (!copy) return;
      const nextEditor = editorState();
      nextEditor.swatchId = copy.id ?? copy.swatchId ?? null;
      nextEditor.sourceIndex = nextEditor.swatchId ? manualSwatchIndexForId(nextEditor.swatchId) : null;
    }));

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.disabled = syncManualSwatches().length <= 1;
    removeButton.addEventListener("click", () => withHistory?.("Remove manual swatch", () => {
      const next = onRemoveSwatch?.({index, swatchId: swatch.id});
      const nextEditor = editorState();
      nextEditor.swatchId = next?.id ?? next?.swatchId ?? null;
      nextEditor.sourceIndex = nextEditor.swatchId ? manualSwatchIndexForId(nextEditor.swatchId) : null;
    }));

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "ghost";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", closeManualPaletteEditor);

    controls.append(colorInput, textInput, copyButton, duplicateButton, removeButton, closeButton);

    const aliasHex = manualMatchAliasHex(swatch.id);
    const aliasSection = document.createElement("div");
    aliasSection.className = "palette-editor-alias";

    const aliasLabel = document.createElement("label");
    aliasLabel.className = "palette-editor-alias-toggle";

    const aliasToggle = document.createElement("input");
    aliasToggle.type = "checkbox";
    aliasToggle.checked = !!aliasHex;

    const aliasLabelText = document.createElement("span");
    aliasLabelText.textContent = "Also match as";
    aliasLabel.append(aliasToggle, aliasLabelText);

    const aliasColorInput = document.createElement("input");
    aliasColorInput.type = "text";
    aliasColorInput.value = aliasHex || sourceHex;
    aliasColorInput.disabled = !aliasToggle.checked;
    aliasColorInput.title = "Input color this swatch should also catch";
    aliasColorInput.setAttribute("aria-label", "Match alias color picker");
    attachColorPicker(aliasColorInput, {label: "Match alias color"});

    const aliasTextInput = document.createElement("input");
    aliasTextInput.type = "text";
    aliasTextInput.value = aliasHex || "";
    aliasTextInput.placeholder = "#00aa55";
    aliasTextInput.spellcheck = false;
    aliasTextInput.disabled = !aliasToggle.checked;
    aliasTextInput.setAttribute("aria-label", "Match alias hex color");

    const aliasCopyButton = document.createElement("button");
    aliasCopyButton.type = "button";
    aliasCopyButton.textContent = "Use source";
    aliasCopyButton.disabled = !aliasToggle.checked;
    aliasCopyButton.title = "Clear the alias; the swatch still matches itself.";

    const updateAliasControls = () => {
      const current = manualMatchAliasHex(swatch.id);
      aliasToggle.checked = !!current;
      aliasColorInput.disabled = !aliasToggle.checked;
      aliasTextInput.disabled = !aliasToggle.checked;
      aliasCopyButton.disabled = !aliasToggle.checked;
      aliasColorInput.value = current || sourceHex;
      syncColorPickerInput(aliasColorInput);
      aliasTextInput.value = current || "";
    };

    aliasToggle.addEventListener("change", () => withHistory?.("Toggle match alias", () => {
      setManualMatchAlias(swatch.id, aliasToggle.checked ? aliasColorInput.value : null);
      renderManualPaletteEditor(paletteRecordForManualSwatchId(swatch.id));
    }));

    const beginAliasInputEdit = () => {
      editorState().colorInputActive = true;
    };
    const finishAliasInputEdit = () => {
      commitHistory?.("Edit match alias");
      editorState().colorInputActive = false;
      syncManualPaletteEditor();
    };

    aliasColorInput.addEventListener("pointerdown", beginAliasInputEdit);
    aliasColorInput.addEventListener("focus", beginAliasInputEdit);
    aliasColorInput.addEventListener("input", () => {
      beginAliasInputEdit();
      beginHistory?.("Edit match alias");
      aliasTextInput.value = aliasColorInput.value;
      setManualMatchAlias(swatch.id, aliasColorInput.value);
    });
    aliasColorInput.addEventListener("change", finishAliasInputEdit);
    aliasColorInput.addEventListener("blur", () => commitHistory?.("Edit match alias"));

    aliasTextInput.addEventListener("change", () => {
      beginHistory?.("Edit match alias");
      const safe = normalizeHexColor(aliasTextInput.value, aliasColorInput.value || sourceHex);
      aliasTextInput.value = safe;
      aliasColorInput.value = safe;
      syncColorPickerInput(aliasColorInput);
      setManualMatchAlias(swatch.id, safe);
      commitHistory?.("Edit match alias");
    });

    aliasCopyButton.addEventListener("click", () => withHistory?.("Clear match alias", () => {
      setManualMatchAlias(swatch.id, null);
      updateAliasControls();
    }));

    aliasSection.append(aliasLabel, aliasColorInput, aliasTextInput, aliasCopyButton);
    editor.append(summary, controls, aliasSection);
  }

  function openManualPaletteEditor(record) {
    if (!manualSwatchEditable(record)) return;
    const manualEditor = editorState();
    manualEditor.colorInputActive = false;
    manualEditor.swatchId = record.swatchId;
    manualEditor.sourceIndex = manualSwatchIndexForId(record.swatchId);
    renderManualPaletteEditor(record);
    els.palettePreview?.querySelectorAll(".chip").forEach(chip => {
      chip.classList.toggle("is-editing", chip.dataset.swatchId === record.swatchId);
    });
    setStatus?.(`Editing source swatch ${manualEditor.sourceIndex + 1}.`);
  }

  function syncManualPaletteEditor(records = state().paletteRecords) {
    if (config().paletteMode !== "manual") {
      closeManualPaletteEditor();
      return;
    }
    const manualEditor = editorState();
    const swatchId = manualEditor.swatchId;
    if (!swatchId) return;
    const index = manualSwatchIndexForId(swatchId);
    if (index < 0) {
      closeManualPaletteEditor();
      return;
    }
    manualEditor.sourceIndex = index;
    if (manualEditor.colorInputActive && els.paletteEditor && !els.paletteEditor.hidden) return;
    const sourceHex = manualSourceHex(swatchId);
    const record = paletteRecordForManualSwatchId(swatchId, records);
    renderManualPaletteEditor(record || {sourceIndex: index, swatchId, lab: hexToLab(sourceHex), hex: sourceHex});
  }

  return {
    ensureManualPaletteEditor,
    closeManualPaletteEditor,
    renderManualPaletteEditor,
    openManualPaletteEditor,
    syncManualPaletteEditor
  };
}
