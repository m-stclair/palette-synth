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
