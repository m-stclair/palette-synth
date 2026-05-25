import { normalizeHexColor } from "../../color-utils.js";
import { createManualSwatchModel } from "../../manual/swatches.js";
import { createManualPaletteEditor } from "../../ui/manual-palette-editor.js";
import { createManualSwatchesList } from "../../ui/manual-swatches-list.js";

export function createManualDomain({
  els,
  state,
  config,
  history = {},
  render = {},
  copyPaletteHex,
  setStatus,
  clientPointToImagePixel
}) {
  const {
    beginHistory,
    commitHistory,
    withHistory
  } = history;
  const {
    markPaletteDirty = () => {},
    queueRender = () => {}
  } = render;

  const manualSwatches = createManualSwatchModel({
    getConfig: () => config,
    getRecords: () => state.paletteRecords,
    onAliasChange: () => {
      markPaletteDirty();
      queueRender();
    }
  });
  const {
    syncManualSwatches,
    manualSwatchIndex,
    manualSwatchAt,
    manualSwatchIndexForId,
    manualSourceHex,
    manualMatchAliasHex,
    setManualMatchAlias,
    insertManualSwatchAfter,
    removeManualSwatchAt,
    manualSwatchMuted,
    toggleManualSwatchMuted,
    manualSwatchEditable,
    paletteRecordForManualSwatchId
  } = manualSwatches;

  const manualSwatchesList = createManualSwatchesList({
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
  });
  const {renderManualSwatches} = manualSwatchesList;

  function setManualSourceColor(identifier, color) {
    const index = manualSwatchIndex(identifier);
    if (index < 0) return null;
    const safe = normalizeHexColor(color, manualSourceHex(index));
    const {lab, colorSpace, ...swatch} = config.manualPalette[index];
    config.manualPalette[index] = {...swatch, hex: safe};
    renderManualSwatches();
    markPaletteDirty();
    queueRender();
    return safe;
  }

  let manualPaletteEditor = null;

  function makeManualMatchAnchorSource(identifier, {announce = true} = {}) {
    const index = manualSwatchIndex(identifier);
    if (index < 0) return null;
    const swatch = config.manualPalette[index];
    const anchorHex = manualMatchAliasHex(swatch.id ?? index);
    if (!anchorHex) {
      if (announce) setStatus?.(`Swatch ${index + 1} has no extra match anchor to make into its source.`);
      return null;
    }
    const nextSourceHex = setManualSourceColor(swatch.id ?? index, anchorHex);
    if (!nextSourceHex) return null;
    setManualMatchAlias(swatch.id ?? index, null);
    manualPaletteEditor?.syncManualPaletteEditor?.(state.paletteRecords);
    if (announce) setStatus?.(`Swatch ${index + 1} source set to former match anchor ${nextSourceHex}.`);
    return config.manualPalette[index];
  }

  manualPaletteEditor = createManualPaletteEditor({
    els,
    getConfig: () => config,
    getState: () => state,
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
    onSourceColorChange: setManualSourceColor,
    onDuplicateSwatch: ({index, sourceHex, aliasHex}) => {
      const copy = insertManualSwatchAfter(index, sourceHex, aliasHex, "copy");
      if (!copy) return null;
      renderManualSwatches();
      markPaletteDirty();
      queueRender();
      return copy;
    },
    onRemoveSwatch: ({index}) => {
      const next = removeManualSwatchAt(index);
      renderManualSwatches();
      markPaletteDirty();
      queueRender();
      return next;
    },
    copyPaletteHex,
    setStatus,
    clientPointToImagePixel
  });

  return {
    swatches: manualSwatches,
    list: manualSwatchesList,
    editor: manualPaletteEditor,
    makeManualMatchAnchorSource,
    ...manualSwatches,
    ...manualSwatchesList,
    ...manualPaletteEditor
  };
}
