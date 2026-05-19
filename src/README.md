# `src/` module map

- `app-runtime.js` owns stateful UI orchestration: DOM binding, history, recipe storage, rendering flow, and export actions. It is now a normal ES module, not one giant function/IIFE wrapper; `startApp()` only loads shaders and boots `init()` when the DOM is ready.
- `constants.js` owns app-wide constants, harmony metadata, cosine palette presets, and the imported preset table bridge.
- `color-utils.js` owns stateless color/math helpers: OKLab conversion, palette record creation, hue distance, sorting, and family matching.
- `palette-export.js` owns text-based palette export serializers.
- `zip-store.js` owns the small stored-ZIP writer used by animation frame export.
- `shaders/` owns all GLSL. `index.js` is the only shader-loading API used by the runtime.

The split is intentionally conservative. The big runtime file is still where DOM state lives, but it is now module-scoped instead of trapped inside a giant startup closure. The volatile shader text and low-level helpers are already out of the thousand-line swamp, so future refactors can keep carving from the edges without changing behavior first.

## UI modules

- `ui/dom.js` owns DOM lookup, cached element collection, and low-level control/value-label syncing.
- `ui/controls.js` owns static event binding for controls and app-level UI actions.

Dynamic handlers created while rendering swatches/chips are still in `app-runtime.js`; they should move when the corresponding render code is extracted.

## GL modules

- `gl/context.js` owns WebGL2 context creation, drawing-buffer resize, and framebuffer clearing.
- `gl/programs.js` owns shader compilation, program linking, define injection, and cached program cleanup.
- `gl/textures.js` owns texture setup and canvas upload.
- `gl/levels-renderer.js` owns the levels-adjustment render pass.
- `gl/palette-renderer.js` owns the palette shader uniform upload and draw call.

The runtime still decides *what* to render: palette records, cycle offsets, comparison split, and config-derived settings. The GL modules decide *how* to talk to WebGL.

## Palette modules

- `palette/sampling.js` owns image-region normalization, patch-origin generation, and block sampling into OKLab candidates.
- `palette/selection.js` owns candidate scoring, tonal target pressure, spacing / hue novelty pressure, weighted picking, and selection-trace data.
- `palette/generation.js` owns palette record generation for preset, image-generated, harmony, cosine, and manual-assisted modes.

The runtime still owns app state and chooses which source image/config/manual swatches feed the generator. The palette modules own the actual color-selection machinery.

## Storage modules

- `storage/local-storage.js` owns guarded JSON reads/writes to `localStorage`.
- `storage/manual-presets.js` owns captured manual palette persistence and normalization.
- `storage/recipes.js` owns recipe IDs, recipe import/export envelopes, and recipe storage envelopes.
- `storage/workbench.js` owns dock, pane-size, and collapsed-panel preferences.

## Export modules

- `export/downloads.js` owns browser download side effects for blobs, canvases, JSON, and frame pacing.
- `export/palette-files.js` owns palette PNG/text export dispatch.
- `export/animation-zip.js` owns animation frame naming/packaging and ZIP download mechanics.

The runtime still chooses *what* to export and supplies rendered canvases; the export modules own the file/download machinery.


## Important object shapes

A few color objects intentionally carry several almost-the-same-looking fields. They are not aliases. This is the part that bites.

### `PaletteRecord`

Created by `makePaletteRecord()` in `color-utils.js`.

- `record.lab` is the feature coordinate. Matching, sorting, generated-family spacing, distance diagnostics, and palette adjustments use it.
- `record.hex` is the visible swatch color. The UI paints chips from it. Tooltips and histogram swatch markers should derive visible LCH from this value first, because sRGB byte quantization and gamut clamping can make `hex → Lab` disagree with the original `record.lab`.
- `record.sourceLab` and `record.seedLab` are provenance. They answer “where did this come from?”, not “what is on screen?”
- `record.adjustedLab` and `record.unadjustedLab` explain palette gamma/chroma/hue transforms. They should not be used as generic display colors.

Rule of thumb: if the user is looking at a swatch chip, use `visibleSwatchLab(record)` or `record.hex`. If the app is deciding which swatch a source pixel belongs to, use the feature/matching fields.

### `PaletteUniformEntry`

Created by `paletteUniformEntries()` in `palette/runtime.js`.

- `featureLab` is what source pixels match against.
- `renderLab` is what the shader, pixel inspector, and CPU histogram estimator blend toward.
- `sourceRecord` is the visible swatch that receives credit in contribution diagnostics.
- Alias entries add extra `featureLab` coordinates that map back to the same `renderLab` and `sourceRecord`.

This split is why contribution, pixel inspection, and output histograms can agree without reading the rendered canvas back from the GPU. It is also why using `record.lab` everywhere creates subtle, believable-looking bugs.
