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
  setStatus
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

  const manualPaletteEditor = createManualPaletteEditor({
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
    onSourceColorChange: (identifier, color) => {
      const index = manualSwatchIndex(identifier);
      if (index < 0) return null;
      const safe = normalizeHexColor(color, manualSourceHex(index));
      const {lab, colorSpace, ...swatch} = config.manualPalette[index];
      config.manualPalette[index] = {...swatch, hex: safe};
      renderManualSwatches();
      markPaletteDirty();
      queueRender();
      return safe;
    },
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
    setStatus
  });

  return {
    swatches: manualSwatches,
    list: manualSwatchesList,
    editor: manualPaletteEditor,
    ...manualSwatches,
    ...manualSwatchesList,
    ...manualPaletteEditor
  };
}
