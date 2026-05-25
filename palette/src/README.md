# `src/` module map

The source tree is shaped around an explicit app graph. `app-runtime.js` loads shader text and calls `createPaletteSynthApp()`; `src/app/create-app.js` is the composition root that wires named domains together. Runtime behavior should live in a domain module or lower-level controller, not in the composition root.

## Startup path

```text
app.js
  → src/app-runtime.js
    → src/shaders/index.js
    → src/app/create-app.js
      → createAppCore()
      → createAppPorts()
      → create*Domain() modules
      → createAppInitializer()
```

`create-app.js` should read like the map of the machine: domain construction, port attachment, and the returned public surface. If a change adds behavior there, it is probably in the wrong room.

## App graph modules

- `app/core.js` owns environment normalization: `document`, `window`, animation-frame functions, `Image`, `URL`, shader source defaults, isolated runtime state, cached DOM element bag, and cloned config.
- `app/ports.js` owns named late-bound ports for cross-domain cycles. These are deliberate escape hatches, not a place to hide new behavior.
- `app/create-app.js` composes domains and returns `{init, state, config, els, cloneConfigSnapshot, replaceConfigSnapshot}`.
- `app/initializer.js` receives grouped domain dependencies, collects DOM elements, creates WebGL, binds controls, initializes panels, and starts the demo/image loading path. Flat initializer dependency bags are no longer supported.

## App domains

- `app/domains/status-domain.js` wires status text.
- `app/domains/history-domain.js` wires undo/redo and Escape cancellation policy for mask/region interactions.
- `app/domains/manual-domain.js` wires the manual swatch model, swatch list, and swatch editor.
- `app/domains/palette-domain.js` wires palette cycle state, active palette runtime, preview swatches, generated locks, manual aliases, and cycle tags.
- `app/domains/view-domain.js` wires viewport, compare split, palette region selection, and mask painting.
- `app/domains/diagnostics-domain.js` wires diagnostics metrics, diagnostics panel rendering, diagnostic overlays, and the pixel inspector controller.
- `app/domains/render-domain.js` wires shader program selection, source-level passes, render-session dirty flags, and render scheduling.
- `app/domains/export-domain.js` wires full-image offscreen rendering, animation export, and visible/full/palette download actions.
- `app/domains/image-domain.js` wires main/reference image loading, object URL cleanup, demo image loading, and render invalidation after image changes.
- `app/domains/app-actions-domain.js` wires config changes, manual palette actions, randomization, conditional panels, and reset behavior.

## UI modules

- `ui/dom.js` owns DOM lookup, cached element collection, and low-level control/value-label syncing.
- `ui/controls.js` owns static event binding for controls and app-level UI actions.
- `ui/workbench.js` owns dock, pane-size, and collapsed-panel preferences.
- `ui/viewport.js`, `ui/compare-split.js`, `ui/palette-region.js`, and `ui/cycle-mask.js` own canvas interaction geometry and interaction state.
- `ui/palette-preview.js`, `ui/manual-palette-editor.js`, and `ui/manual-swatches-list.js` own palette-facing UI rendering and swatch editing affordances.
- `ui/diagnostics-panel.js` owns diagnostics display formatting.

## Runtime / GL modules

- `runtime/image-controller.js` owns image decoding, scaled canvas creation, main/reference image state, and object URL cleanup.
- `runtime/shader-programs.js` owns config-to-shader-program selection and cached program building.
- `runtime/level-sources.js` owns the source-level adjustment pass.
- `runtime/render-session.js` owns dirty flags, texture/program state, palette uniforms, render scheduling, and draw orchestration.
- `runtime/cycle-preview.js` owns live palette-cycle preview playback.
- `gl/` modules own WebGL context creation, shader compilation, textures, levels rendering, palette rendering, post-processing, offscreen targets, and final view compositing.

## Palette / manual modules

- `palette/runtime.js` selects the active palette source and produces render-ready palette records.
- `palette/cycle.js` sorts and cycles palette records globally, in bands, or by manual cycle tags.
- `palette/generation.js`, `palette/sampling.js`, and `palette/selection.js` own the generated-palette machinery: sampling image regions, scoring OKLab candidates, and selecting diverse colors.
- `manual/swatches.js` owns manual swatch normalization, alias handling, indexing, insert/remove behavior, and editability.
- `manual/manual-palette-actions.js` owns captured palettes, LUT import, preset loading, preset saving, and manual palette mutation actions.

## Export / storage / recipes

- `export/` owns browser downloads, palette file dispatch, offscreen full-image rendering, animation export controls, frame ZIP construction, and GIF export helpers.
- `storage/` owns guarded `localStorage` reads/writes for recipes, manual presets, and workbench preferences.
- `recipes/controller.js` wires recipe save/load/update/delete/import/export behavior through the UI.

## Maintenance rule of thumb

When adding a feature, first choose the owning domain. Add behavior there or below it. Use `app/ports.js` only when two domains genuinely need late-bound access to each other. Keep `create-app.js` boring, explicit, and readable. Boring is the safety rail.

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
