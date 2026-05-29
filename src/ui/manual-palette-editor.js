import { byteRgbToHex, clamp01, colorInfoLabel, hexToLab, labToHex, normalizeHexColor } from "../color-utils.js";
import { samplePixelBlockColor } from "../diagnostics/pixel-inspector.js";
import { effectivePixelBlockSize } from "../state/config.js";
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
  setStatus,
  clientPointToImagePixel
} = {}) {
  const config = () => getConfig?.() || {};
  const state = () => getState?.() || {};
  const editorState = () => {
    const currentState = state();
    if (!currentState.manualEditor) {
      currentState.manualEditor = {sourceIndex: null, swatchId: null, colorInputActive: false, aliasPickActive: false, aliasPickSwatchId: null};
    }
    return currentState.manualEditor;
  };
  let dismissHandlersBound = false;

  let aliasPickState = null;

  function clearAliasPickClass() {
    els.canvas?.classList?.remove?.("is-picking-alias");
  }

  function cancelAliasPick({announce = false} = {}) {
    const manualEditor = editorState();
    if (aliasPickState?.cleanup) aliasPickState.cleanup();
    aliasPickState = null;
    manualEditor.aliasPickActive = false;
    manualEditor.aliasPickSwatchId = null;
    clearAliasPickClass();
    if (announce) setStatus?.("Source-image match-anchor pick cancelled.");
  }

  function eventPathIncludes(event, node) {
    if (!node) return false;
    const path = typeof event?.composedPath === "function" ? event.composedPath() : null;
    return Array.isArray(path) && path.includes(node);
  }

  function nodeContains(root, target) {
    if (!root || !target) return false;
    if (root === target) return true;
    if (typeof root.contains === "function") return root.contains(target);
    let node = target;
    while (node) {
      if (node === root) return true;
      node = node.parentNode || null;
    }
    return false;
  }

  function targetWithinColorPickerPopover(event) {
    const target = event?.target;
    if (target?.closest?.(".app-color-picker-popover")) return true;
    const path = typeof event?.composedPath === "function" ? event.composedPath() : [];
    return Array.isArray(path) && path.some(node => node?.classList?.contains?.("app-color-picker-popover"));
  }

  function manualPaletteEditorOpen() {
    return !!els.paletteEditor && !els.paletteEditor.hidden;
  }

  function handleEditorDismissKeydown(event) {
    if (!manualPaletteEditorOpen() || event?.defaultPrevented) return;
    if (event?.key !== "Escape") return;
    if (editorState().aliasPickActive) {
      cancelAliasPick({announce: true});
      event.preventDefault?.();
      return;
    }
    closeManualPaletteEditor();
    event.preventDefault?.();
  }

  function handleEditorOutsidePointer(event) {
    if (!manualPaletteEditorOpen()) return;
    if (editorState().aliasPickActive) return;
    if (eventPathIncludes(event, els.paletteEditor) || nodeContains(els.paletteEditor, event?.target)) return;
    if (targetWithinColorPickerPopover(event)) return;
    closeManualPaletteEditor();
  }

  function bindEditorDismissHandlers() {
    if (dismissHandlersBound) return;
    const doc = els.paletteEditor?.ownerDocument || els.palettePreview?.ownerDocument || globalThis.document;
    doc?.addEventListener?.("keydown", handleEditorDismissKeydown);
    doc?.addEventListener?.("pointerdown", handleEditorOutsidePointer, true);
    dismissHandlersBound = true;
  }

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
    cancelAliasPick();
    const manualEditor = editorState();
    manualEditor.sourceIndex = null;
    manualEditor.swatchId = null;
    manualEditor.colorInputActive = false;
    manualEditor.aliasPickActive = false;
    manualEditor.aliasPickSwatchId = null;
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
    sourceSwatch.title = `Source ${colorInfoLabel(sourceHex)}`;

    const effectiveSwatch = document.createElement("span");
    effectiveSwatch.className = "palette-editor-swatch palette-editor-swatch-effective";
    effectiveSwatch.style.background = effectiveHex;
    effectiveSwatch.title = `Effective ${colorInfoLabel(effectiveHex, currentRecord?.lab)}`;

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
    colorInput.title = `Edit source color · ${colorInfoLabel(sourceHex)}`;
    colorInput.setAttribute("aria-label", "Edit source color");
    const sourceColorPicker = attachColorPicker(colorInput, {label: "Edit source color"});
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
    textInput.title = colorInfoLabel(sourceHex);
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
      onRemoveSwatch?.({index, swatchId: swatch.id});
      closeManualPaletteEditor();
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

    const routeLine = document.createElement("div");
    routeLine.className = "palette-editor-match-route";
    const routeTitle = document.createElement("strong");
    routeTitle.textContent = "Match anchors";
    const routeText = document.createElement("span");
    routeLine.append(routeTitle, routeText);

    const aliasLabel = document.createElement("label");
    aliasLabel.className = "palette-editor-alias-toggle";

    const aliasToggle = document.createElement("input");
    aliasToggle.type = "checkbox";
    aliasToggle.checked = !!aliasHex;

    const aliasLabelText = document.createElement("span");
    aliasLabelText.textContent = "Also catch pixels like";
    aliasLabel.append(aliasToggle, aliasLabelText);

    const aliasColorInput = document.createElement("input");
    aliasColorInput.type = "text";
    aliasColorInput.value = aliasHex || sourceHex;
    aliasColorInput.disabled = !aliasToggle.checked;
    aliasColorInput.title = `Input color this swatch should catch · ${colorInfoLabel(aliasHex || sourceHex)}`;
    aliasColorInput.setAttribute("aria-label", "Catch color picker");
    const aliasColorPicker = attachColorPicker(aliasColorInput, {label: "Catch color"});

    const aliasTextInput = document.createElement("input");
    aliasTextInput.type = "text";
    aliasTextInput.value = aliasHex || "";
    aliasTextInput.placeholder = "#00aa55";
    aliasTextInput.spellcheck = false;
    aliasTextInput.disabled = !aliasToggle.checked;
    aliasTextInput.setAttribute("aria-label", "Catch hex color");
    aliasTextInput.title = colorInfoLabel(aliasHex || sourceHex);

    const sourceLockButton = document.createElement("button");
    sourceLockButton.type = "button";
    sourceLockButton.textContent = "Also catch original source";
    sourceLockButton.title = "Add this swatch's source color as an extra match anchor. The swatch still also catches its current color.";

    const recolorButton = document.createElement("button");
    recolorButton.type = "button";
    recolorButton.textContent = "Recolor source pixels";
    recolorButton.title = "Add the source color as an extra match anchor, then open the swatch color picker. The swatch still also catches its current color.";

    const promoteAliasButton = document.createElement("button");
    promoteAliasButton.type = "button";
    promoteAliasButton.textContent = "Make anchor source";
    promoteAliasButton.title = "Set this swatch's source color to its extra match anchor, then clear that anchor.";

    const pickSourceImageButton = document.createElement("button");
    pickSourceImageButton.type = "button";
    pickSourceImageButton.textContent = "Pick from source image";
    pickSourceImageButton.disabled = !state().imageData || !els.canvas || typeof clientPointToImagePixel !== "function";
    pickSourceImageButton.title = pickSourceImageButton.disabled
      ? "Open a source image first"
      : "Click the source image to add that pixel color as an extra match anchor.";

    const aliasActions = document.createElement("div");
    aliasActions.className = "palette-editor-alias-actions";
    aliasActions.append(sourceLockButton, recolorButton, promoteAliasButton, pickSourceImageButton);

    const routeLabelFor = current => {
      const anchors = [`current ${effectiveHex}`];
      if (current) {
        const safeCurrent = normalizeHexColor(current, sourceHex);
        const sourceAnchored = safeCurrent === normalizeHexColor(sourceHex, sourceHex);
        anchors.push(`${sourceAnchored ? "source" : "extra"} ${safeCurrent}`);
      }
      if (cfg.aliasAllSources && Array.isArray(currentRecord?.sourceLab)) {
        const globalSourceHex = labToHex(currentRecord.sourceLab);
        const duplicate = anchors.some(anchor => anchor.endsWith(globalSourceHex));
        if (!duplicate) anchors.push(`global source ${globalSourceHex}`);
      }
      return `Catches ${anchors.join(" + ")} → renders ${effectiveHex}`;
    };

    const updateAliasControls = () => {
      const current = manualMatchAliasHex(swatch.id);
      aliasToggle.checked = !!current;
      aliasColorInput.disabled = !aliasToggle.checked;
      aliasTextInput.disabled = !aliasToggle.checked;
      promoteAliasButton.disabled = !current;
      aliasColorInput.value = current || sourceHex;
      syncColorPickerInput(aliasColorInput);
      aliasTextInput.value = current || "";
      routeText.textContent = routeLabelFor(current);
      aliasColorInput.title = `Input color this swatch should catch · ${colorInfoLabel(current || sourceHex)}`;
      aliasTextInput.title = colorInfoLabel(current || sourceHex);
    };

    aliasToggle.addEventListener("change", () => withHistory?.(aliasToggle.checked ? "Add match anchor" : "Remove extra match anchor", () => {
      setManualMatchAlias(swatch.id, aliasToggle.checked ? aliasColorInput.value : null);
      renderManualPaletteEditor(paletteRecordForManualSwatchId(swatch.id));
    }));

    const beginAliasInputEdit = () => {
      editorState().colorInputActive = true;
    };
    const finishAliasInputEdit = () => {
      commitHistory?.("Edit catch color");
      editorState().colorInputActive = false;
      syncManualPaletteEditor();
    };

    aliasColorInput.addEventListener("pointerdown", beginAliasInputEdit);
    aliasColorInput.addEventListener("focus", beginAliasInputEdit);
    aliasColorInput.addEventListener("input", () => {
      beginAliasInputEdit();
      beginHistory?.("Edit catch color");
      aliasTextInput.value = aliasColorInput.value;
      setManualMatchAlias(swatch.id, aliasColorInput.value);
      routeText.textContent = routeLabelFor(aliasColorInput.value);
    });
    aliasColorInput.addEventListener("change", finishAliasInputEdit);
    aliasColorInput.addEventListener("blur", () => commitHistory?.("Edit catch color"));

    aliasTextInput.addEventListener("change", () => {
      beginHistory?.("Edit catch color");
      const safe = normalizeHexColor(aliasTextInput.value, aliasColorInput.value || sourceHex);
      aliasTextInput.value = safe;
      aliasColorInput.value = safe;
      syncColorPickerInput(aliasColorInput);
      setManualMatchAlias(swatch.id, safe);
      routeText.textContent = routeLabelFor(safe);
      commitHistory?.("Edit catch color");
    });

    const beginSourceImageAliasPick = () => {
      if (!state().imageData || !els.canvas || typeof clientPointToImagePixel !== "function") {
        setStatus?.("Open a source image before picking a match anchor.");
        return;
      }
      cancelAliasPick();
      const manualEditor = editorState();
      manualEditor.aliasPickActive = true;
      manualEditor.aliasPickSwatchId = swatch.id;
      els.canvas.classList?.add?.("is-picking-alias");
      pickSourceImageButton.textContent = "Click source image…";
      pickSourceImageButton.disabled = true;

      const doc = els.canvas.ownerDocument || globalThis.document;
      const stopCanvasEvent = event => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        event?.stopImmediatePropagation?.();
      };
      const cleanup = () => {
        els.canvas?.removeEventListener?.("pointerdown", stopCanvasEvent, true);
        els.canvas?.removeEventListener?.("pointermove", stopCanvasEvent, true);
        els.canvas?.removeEventListener?.("click", pickFromCanvas, true);
        doc?.removeEventListener?.("keydown", cancelOnEscape, true);
      };
      const finishWithHex = pickedHex => {
        withHistory?.("Pick source-image match anchor", () => {
          setManualMatchAlias(swatch.id, pickedHex);
        });
        cancelAliasPick();
        setStatus?.(`Swatch ${index + 1} also catches source-image ${pickedHex}.`);
        renderManualPaletteEditor(paletteRecordForManualSwatchId(swatch.id));
      };
      function pickFromCanvas(event) {
        stopCanvasEvent(event);
        const imagePoint = clientPointToImagePixel(event.clientX, event.clientY);
        const sampled = imagePoint && samplePixelBlockColor(
          state().imageData,
          imagePoint.x,
          imagePoint.y,
          effectivePixelBlockSize(config()),
          config().pixelBlockSampleMode
        );
        if (!sampled) {
          cancelAliasPick();
          setStatus?.("Could not sample that source-image pixel.");
          renderManualPaletteEditor(paletteRecordForManualSwatchId(swatch.id));
          return;
        }
        finishWithHex(byteRgbToHex(sampled.r, sampled.g, sampled.b));
      }
      function cancelOnEscape(event) {
        if (event?.key !== "Escape") return;
        stopCanvasEvent(event);
        cancelAliasPick({announce: true});
        renderManualPaletteEditor(paletteRecordForManualSwatchId(swatch.id));
      }
      aliasPickState = {swatchId: swatch.id, cleanup};
      els.canvas.addEventListener?.("pointerdown", stopCanvasEvent, true);
      els.canvas.addEventListener?.("pointermove", stopCanvasEvent, true);
      els.canvas.addEventListener?.("click", pickFromCanvas, true);
      doc?.addEventListener?.("keydown", cancelOnEscape, true);
      setStatus?.(`Click the source image to add a match anchor for swatch ${index + 1}.`);
    };

    sourceLockButton.addEventListener("click", () => withHistory?.("Add source match anchor", () => {
      setManualMatchAlias(swatch.id, sourceHex);
      updateAliasControls();
      setStatus?.(`Swatch ${index + 1} also catches source ${sourceHex}.`);
    }));

    recolorButton.addEventListener("click", () => withHistory?.("Recolor source pixels", () => {
      setManualMatchAlias(swatch.id, sourceHex);
      updateAliasControls();
      setStatus?.(`Swatch ${index + 1} also catches source ${sourceHex}; choose a new render color.`);
      sourceColorPicker?.open?.({focus: true});
      colorInput.focus?.();
    }));

    promoteAliasButton.addEventListener("click", () => {
      const current = manualMatchAliasHex(swatch.id);
      if (!current) {
        updateAliasControls();
        setStatus?.(`Swatch ${index + 1} has no extra match anchor to make into its source.`);
        return;
      }
      withHistory?.("Make match anchor source", () => {
        const nextSourceHex = normalizeHexColor(current, sourceHex);
        setManualSourceColor(swatch.id, nextSourceHex);
        setManualMatchAlias(swatch.id, null);
        setStatus?.(`Swatch ${index + 1} source set to former match anchor ${nextSourceHex}.`);
        renderManualPaletteEditor({
          source: "manual",
          sourceIndex: index,
          swatchId: swatch.id,
          hex: nextSourceHex,
          lab: hexToLab(nextSourceHex)
        });
      });
    });

    pickSourceImageButton.addEventListener("click", beginSourceImageAliasPick);

    updateAliasControls();
    aliasSection.append(routeLine, aliasLabel, aliasColorInput, aliasTextInput, aliasActions);
    editor.append(summary, controls, aliasSection);
  }

  function openManualPaletteEditor(record) {
    if (!manualSwatchEditable(record)) return;
    bindEditorDismissHandlers();
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
