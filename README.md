# Palette Synth

Palette Synth is a dependency-free browser tool for palette extraction and remapping. It is a standalone extraction of
the **Palette Synth** effect from `vandal`, packaged as plain HTML, CSS, JavaScript modules, and GLSL shaders.

The app runs entirely in the browser. No build step. No server-side processing. The tiny local server is only there
because ES modules and shader `fetch()` calls need an HTTP origin; opening `index.html` directly from `file://` will
usually fail.

## Quick start

```sh
python3 -m http.server 8000
# open http://localhost:8000/
```

You can use any static file server. From the project root, serve this directory and open the served URL in a modern
browser with WebGL2 support.

## Development commands

```sh
npm run test:all  # run unit test suite, JS syntax check, and, if browser available, E2E smoke test
```

There are no runtime dependencies in `package.json`. The unit tests use Node's built-in test runner.
E2E smoke tests use playwright.

## Browser requirements

- WebGL2
- ES modules
- `fetch()` for local shader files
- Canvas / Blob / File APIs for image import and export
- `localStorage` for saved recipes, captured manual presets, and workbench preferences

## What the app does

Palette Synth takes an input image and renders a recolored version through a configurable palette pipeline:

1. Load an image, or use the built-in demo image.
2. Choose a palette source.
3. Adjust sampling, matching, levels, output mode, dithering, and cycling.
4. Inspect palette coverage and per-pixel assignments.
5. Export the current view, the full-resolution processed image, palettes, recipes, or animation frame ZIPs.

## Palette sources

- **Generated from main image** — samples the loaded image, scores candidate colors in OKLab, and selects a palette with
  configurable tonal, chroma, outlier, spacing, and hue-spread pressure.
- **Generated from reference image** — uses a separate image as the palette source while applying the palette to the
  main image.
- **Seed harmony** — builds palettes from classical relationships: complementary, split complement, triad, tetrad,
  square, analogous, accented analogous, and monochrome, with optional color-contrasting shadow/midtone/highlight bands.
- **Procedural cosine** — uses cosine palette presets inspired by Inigo Quilez's `a + b * cos(2π * (c * t + d))` form.
- **Manual / preset** — edits swatches directly, imports LUT images, loads built-in presets, or starts from captured
  generated palettes.

## Rendering controls

- Assignment modes: nearest, blend, and dither.
- Output modes: full replace, preserve luma, preserve chroma, hue wash, and shadow/highlight.
- OKLab perceptual weights for luma, chroma, and hue matching.
- Source levels: exposure, gamma, shoulder, curve center, and curve amount.
- Dither patterns: ordered 2×2, ordered 4×4, ordered 8×8, hash noise, etched lines, screenprint dots, crosshatch ink, stipple grain, woven threads, and contour wash.
- Palette cycling with global, banded, and manually tagged swatches.
- Pixel-perfect preview, zoom, pan, and before/after compare split.
- Optional pixel-art post-process: despeckle (3×3 mode filter, 1–4 passes). It runs at art-pixel granularity so it respects `pixelBlockSize`. The diagnostic overlay short-circuits the post-process pipeline so swatch/difference views always reflect raw palette output.

## Manual palette workflow

Manual palettes can be edited swatch by swatch. Generated, reference, harmony, and cosine palettes can also be captured
into manual swatches with four strategies:

- replace the manual palette
- append to the current manual palette
- fill unlocked manual slots
- save as a manual preset

Manual swatches can preserve source colors while using match aliases, which lets a swatch display one color but
participate in matching as another. That is the small secret trapdoor in the palette machine: visual color on one side,
matching color on the other.

## Diagnostics

The diagnostics panels explain why the current palette behaves the way it does:

- family selection traces for generated palettes
- assignment contribution bars
- palette collision warnings
- OKLCh hue/lightness X-Ray
- click-to-inspect pixel readouts for source, matched palette colors, weighted assignments, and output color

## Export options

Image exports:

- visible preview PNG
- full working-resolution PNG
- animation frame ZIP with PNG frames and manifest

Palette exports:

- PNG LUT
- `.hex`
- plain text
- JSON
- JavaScript array
- CSS variables
- SCSS variables
- CSV RGB
- GIMP/Inkscape GPL

Recipe exports:

- current recipe JSON
- selected saved recipe JSON
- all saved recipes JSON
- recipe import from JSON

## Persistence

Palette Synth stores user-created data in `localStorage`:

- saved recipes
- captured manual presets
- dock position, pane size, and collapsed panel preferences

The source image itself is not persisted.

## Project layout

```text
.
├── index.html              # Application shell and controls
├── style.css               # Full application styling
├── app.js                  # Browser entry point
├── palette-presets.js      # Built-in preset palette table on globalThis
├── package.json            # Module mode plus test/check scripts
├── src/                    # Application modules, shaders, and helpers
├── tests/                  # Node test suite
└── tools/                  # Repository maintenance scripts
```

## Runtime architecture

The runtime is intentionally split into small controllers around one composed app graph:

```text
index.html
  └─ app.js
      └─ src/app-runtime.js
          ├─ loads GLSL through src/shaders/index.js
          └─ creates src/app/create-app.js
              ├─ createAppCore()              # env, state, config, shader sources
              ├─ createAppPorts()             # named late-bound cross-domain ports
              ├─ status/history domains
              ├─ manual/palette domains
              ├─ view/diagnostics/render domains
              ├─ export/image/app-actions domains
              └─ createAppInitializer()       # DOM collection, WebGL startup, event binding
```

The CPU side builds palette records, config snapshots, diagnostics, and UI state. The GPU side handles levels and
palette remapping passes. The shader is the furnace; the controllers are plumbing; `create-app.js` is now mostly the
manifold where named domain pipes meet. Behavior should live in domain modules or lower-level controllers, not grow back
inside the composition root.

## Source map

### Root files

| Path                 | Purpose                                                                                                                  |
|----------------------|--------------------------------------------------------------------------------------------------------------------------|
| `index.html`         | Declares the app shell, canvas, toolbar, palette controls, diagnostics panels, recipe panel, and animation export panel. |
| `style.css`          | Defines the responsive workbench, dockable controls pane, preview canvas, swatch UI, diagnostics, and panel styling.     |
| `app.js`             | Starts the app and reports startup errors into the page.                                                                 |
| `palette-presets.js` | Provides the original built-in palette preset table as `globalThis.PALETTE_PRESETS`.                                     |
| `package.json`       | Enables ES modules and exposes `npm test` / `npm run check`.                                                             |
| `LICENSE`            | Project license.                                                                                                         |

### `src/` top-level modules

| Path                    | Purpose                                                                                                  |
|-------------------------|----------------------------------------------------------------------------------------------------------|
| `src/app-runtime.js`    | Loads shaders, creates the app, and waits for `DOMContentLoaded` before initialization.                  |
| `src/constants.js`      | App-wide constants, harmony metadata, cosine presets, and the built-in preset bridge.                    |
| `src/color-utils.js`    | Shared color math, OKLab/OKLCh conversion, seeded randomness, palette records, sorting, and hex helpers. |
| `src/demo-image.js`     | Inline demo SVG used when no image has been loaded yet.                                                  |
| `src/palette-export.js` | Serializes palettes to text-oriented export formats.                                                     |
| `src/zip-store.js`      | Minimal stored-ZIP writer used by animation export.                                                      |
| `src/README.md`         | Smaller module-map note for the source directory.                                                        |

### `src/app/`

| Path                                      | Purpose                                                                                         |
|-------------------------------------------|-------------------------------------------------------------------------------------------------|
| `src/app/create-app.js`                   | Composition root. Constructs domains, attaches ports, and returns the public app surface.       |
| `src/app/core.js`                         | Normalizes browser/env dependencies, shader sources, runtime state, cached elements, and config.|
| `src/app/ports.js`                        | Named late-bound ports for cross-domain callbacks that cannot be wired in strict construction order. |
| `src/app/initializer.js`                  | Consumes grouped domain deps, collects DOM elements, initializes WebGL, binds controls, and starts loading. |
| `src/app/domains/status-domain.js`        | Wires status text behavior.                                                                      |
| `src/app/domains/history-domain.js`       | Wires undo/redo plus Escape cancellation policy for mask/region interaction.                    |
| `src/app/domains/manual-domain.js`        | Wires manual swatch model, swatch list, and manual swatch editor.                               |
| `src/app/domains/palette-domain.js`       | Wires palette cycling, active palette runtime, preview swatches, locks, aliases, and cycle tags.|
| `src/app/domains/view-domain.js`          | Wires viewport, compare split, palette region selection, and mask painting.                     |
| `src/app/domains/diagnostics-domain.js`   | Wires diagnostics metrics, panels, overlay state, and pixel inspection controller.              |
| `src/app/domains/render-domain.js`        | Wires shader programs, level sources, and render session scheduling/dirty flags.                |
| `src/app/domains/export-domain.js`        | Wires full-image rendering, animation export, and image/palette download actions.               |
| `src/app/domains/image-domain.js`         | Wires main/reference image loading, object URL management, and demo image loading.              |
| `src/app/domains/app-actions-domain.js`   | Wires config, manual palette actions, randomization, conditional panels, and reset behavior.    |
| `src/app/config-controller.js`            | Applies config changes, marks render/session dirty flags, and syncs labels.                    |
| `src/app/runtime-state.js`                | Creates isolated mutable runtime state for canvases, images, palette records, and UI flags.    |
| `src/app/status-controller.js`            | Writes status text and transient messages.                                                     |
| `src/app/conditional-panels.js`           | Shows, hides, and annotates controls based on active palette/output/assignment modes.          |
| `src/app/reset-controller.js`             | Applies reset snapshots through the config controller.                                         |

### `src/ui/`

| Path                              | Purpose                                                                                                               |
|-----------------------------------|-----------------------------------------------------------------------------------------------------------------------|
| `src/ui/dom.js`                   | Central DOM ID list, element collection, and low-level config/value syncing.                                          |
| `src/ui/controls.js`              | Static event binding for sliders, selects, buttons, recipe controls, compare controls, and animation export controls. |
| `src/ui/workbench.js`             | Docking, resizing, collapsed panel state, and workbench preference persistence.                                       |
| `src/ui/viewport.js`              | Canvas sizing, fit/zoom/pan math, pointer normalization, and viewport controller.                                     |
| `src/ui/canvas-interactions.js`   | Pointer, wheel, pan, zoom, compare drag, pixel-inspection, and double-click routing.                                  |
| `src/ui/compare-split.js`         | Before/after split math and compare control synchronization.                                                          |
| `src/ui/palette-region.js`        | Palette sampling-region selection, overlay geometry, drag lifecycle, and region reset.                                |
| `src/ui/palette-preview.js`       | Renders palette swatches, generated locks, manual aliases, and cycle tagging affordances.                             |
| `src/ui/manual-palette-editor.js` | Popover/editor for manual swatch source colors, aliases, duplication, removal, and copy actions.                      |
| `src/ui/manual-swatches-list.js`  | Renders and mutates the manual swatch list in the controls pane.                                                      |
| `src/ui/diagnostics-panel.js`     | Formats and renders assignment summaries, X-Ray plots, collision warnings, selection traces, and pixel diagnostics.   |

### `src/palette/`

| Path                        | Purpose                                                                                                             |
|-----------------------------|---------------------------------------------------------------------------------------------------------------------|
| `src/palette/runtime.js`    | Selects the active palette source, normalizes generated/reference/manual inputs, and produces render-ready records. |
| `src/palette/generation.js` | Builds generated, preset, harmony, cosine, and manual-assisted palettes.                                            |
| `src/palette/sampling.js`   | Normalizes sample regions, creates patch origins, and samples image blocks into OKLab candidates.                   |
| `src/palette/selection.js`  | Scores candidates and selects diverse swatches using tonal, chroma, novelty, spacing, and hue-family pressure.      |
| `src/palette/cycle.js`      | Sorts and cycles palette records globally, in bands, or by manual cycle tags.                                       |

### `src/manual/`

| Path                                   | Purpose                                                                                                      |
|----------------------------------------|--------------------------------------------------------------------------------------------------------------|
| `src/manual/ids.js`                    | Sanitizes and creates stable manual swatch IDs and cycle keys.                                               |
| `src/manual/swatches.js`               | Normalizes manual swatches, aliases, captured entries, indexing, insert/remove behavior, and editability.    |
| `src/manual/manual-palette-actions.js` | Captures generated palettes, imports LUTs, loads presets, saves manual presets, and mutates manual palettes. |

### `src/runtime/`

| Path                              | Purpose                                                                                                     |
|-----------------------------------|-------------------------------------------------------------------------------------------------------------|
| `src/runtime/image-controller.js` | Loads main/reference images, creates scaled bitmap canvases, manages object URLs, and updates image status. |
| `src/runtime/render-session.js`   | Owns dirty flags, cached texture/program state, palette uniform preparation, and render scheduling.         |
| `src/runtime/shader-programs.js`  | Converts config into shader defines and builds cached palette/levels programs.                              |
| `src/runtime/level-sources.js`    | Applies CPU-selected source-level settings through the levels renderer.                                     |
| `src/runtime/cycle-preview.js`    | Runs/stops animated palette-cycle preview and coordinates animation controls.                               |

### `src/gl/`

| Path                                  | Purpose                                                                                        |
|---------------------------------------|------------------------------------------------------------------------------------------------|
| `src/gl/context.js`                   | Creates WebGL2 contexts, resizes drawing buffers, and clears framebuffers.                     |
| `src/gl/programs.js`                  | Compiles shaders, links programs, injects defines, caches programs, and disposes GL resources. |
| `src/gl/textures.js`                  | Creates/configures textures and uploads canvas sources.                                        |
| `src/gl/levels-renderer.js`           | Runs the source-levels pass.                                                                   |
| `src/gl/palette-renderer.js`          | Uploads uniforms and runs the palette remapping pass.                                          |
| `src/gl/offscreen-palette-target.js`  | Source-sized framebuffer + texture used as the palette pass target when post-process is active. |
| `src/gl/post-process-renderer.js`     | Manages ping-pong textures and runs the despeckle iterations.                                  |
| `src/gl/view-composite-renderer.js`   | Final viewport pass used for post-processing and compare; samples the paletted texture with view transform and compare-split. |

### `src/shaders/`

| Path                              | Purpose                                                                                                     |
|-----------------------------------|-------------------------------------------------------------------------------------------------------------|
| `src/shaders/index.js`            | Fetches shader source files for the runtime.                                                                |
| `src/shaders/fullscreen.vert`     | Fullscreen triangle/quad vertex shader.                                                                     |
| `src/shaders/levels.frag`         | Fragment shader for source exposure/gamma/curve adjustment.                                                 |
| `src/shaders/palette.frag`        | Main palette remapping shader: matching, output modes, dithering, cycle regions, and palette strip display. |
| `src/shaders/palette-post.frag`   | Post-palette despeckle (3×3 mode filter). |
| `src/shaders/view-composite.frag` | Final viewport blit used for post-processing and compare. Applies the view transform and compare-split. |

### `src/diagnostics/`

| Path                                 | Purpose                                                                                                      |
|--------------------------------------|--------------------------------------------------------------------------------------------------------------|
| `src/diagnostics/metrics.js`         | Computes CPU-side assignment weights, palette usage, collision checks, signatures, and diagnostic summaries. |
| `src/diagnostics/pixel-inspector.js` | Mirrors output-mode math on the CPU for click-to-inspect pixel diagnostics.                                  |
| `src/diagnostics/controller.js`      | Refreshes diagnostics panels and connects canvas clicks to pixel inspection.                                 |

### `src/export/`

| Path                                 | Purpose                                                                                             |
|--------------------------------------|-----------------------------------------------------------------------------------------------------|
| `src/export/downloads.js`            | Browser download helpers for blobs, canvases, JSON, and animation pacing.                           |
| `src/export/palette-files.js`        | Dispatches palette exports to PNG or text serializers.                                              |
| `src/export/rendered-canvas.js`      | Creates offscreen full-resolution renders and export-specific palette uniforms.                     |
| `src/export/export-actions.js`       | Wires UI export buttons to visible image, full image, and palette export actions.                   |
| `src/export/animation-controller.js` | Syncs animation export settings and starts frame ZIP export.                                        |
| `src/export/animation-zip.js`        | Sanitizes filenames, calculates loop spans, builds frame plans, and writes animation ZIP downloads. |

### `src/state/`

| Path                   | Purpose                                                                                            |
|------------------------|----------------------------------------------------------------------------------------------------|
| `src/state/config.js`  | Default config, reset config, enum maps, snapshot cloning, sanitization, and import normalization. |
| `src/state/history.js` | Undo/redo stacks, history snapshots, shortcuts, and history button state.                          |

### `src/storage/`

| Path                            | Purpose                                                                               |
|---------------------------------|---------------------------------------------------------------------------------------|
| `src/storage/local-storage.js`  | Guarded JSON read/write helpers for `localStorage`.                                   |
| `src/storage/manual-presets.js` | Manual preset IDs, normalization, loading, and saving.                                |
| `src/storage/recipes.js`        | Recipe IDs, names, import/export envelopes, normalization, storage, and file parsing. |
| `src/storage/workbench.js`      | Workbench dock/pane/collapsed-panel preference loading and saving.                    |

### `src/recipes/`

| Path                        | Purpose                                                                      |
|-----------------------------|------------------------------------------------------------------------------|
| `src/recipes/controller.js` | Saves, updates, loads, deletes, imports, and exports recipes through the UI. |

### `tests/`

The test suite mirrors the module boundaries. Tests are grouped by controller or helper name, for example
`palette-runtime.test.js`, `render-session.test.js`, `manual-palette-actions.test.js`, `diagnostics-panel.test.js`, and
`viewport.test.js`. This is the practical maintenance map: when a module moves, its matching test usually tells you what
behavior must stay nailed down.

### `tools/`

| Path                | Purpose                                               |
|---------------------|-------------------------------------------------------|
| `tools/check-js.js` | Recursively syntax-checks JavaScript files with Node. |

## Common maintenance tasks

### Add a new UI control

1. Add the element to `index.html`.
2. Add its ID to `src/ui/dom.js` if it needs central lookup.
3. Add default state and sanitization in `src/state/config.js`.
4. Bind control behavior in `src/ui/controls.js` or a dedicated controller.
5. Route dirty flags in `src/app/config-controller.js`.
6. Use the config in the owning domain or lower-level runtime/palette/shader module. Avoid adding behavior directly to `src/app/create-app.js`.
7. Add or update tests.


### Change app wiring

1. Find the owning domain in `src/app/domains/`.
2. Add behavior to that domain or to the lower-level controller it already wraps.
3. If another domain needs access, expose a named capability on the domain return object or through `src/app/ports.js`.
4. Keep `src/app/create-app.js` as a readable graph of constructors and port attachments. It should explain the machine, not become the machine again.
5. Add domain-level tests in `tests/app-domains.test.js` when the wiring surface changes.

### Add a new shader option

1. Add default config and sanitization in `src/state/config.js`.
2. Add UI in `index.html` and syncing in the UI modules.
3. Add define/uniform handling in `src/runtime/shader-programs.js`, `src/runtime/render-session.js`, or
   `src/gl/palette-renderer.js`.
4. Implement GLSL in `src/shaders/palette.frag` or `src/shaders/levels.frag`.
5. Mirror CPU behavior in diagnostics when needed.
6. Add tests for config, shader defines, render settings, and diagnostics.

### Add a new export format

1. Add an option in `index.html`.
2. Add serialization in `src/palette-export.js` for text formats, or `src/export/palette-files.js` for binary formats.
3. Verify dispatch through `src/export/export-actions.js`.
4. Add tests around the serializer or export action.

## Troubleshooting

- **Blank page from `file://`**: serve the folder over HTTP. Shader loading uses `fetch()`.
- **Startup error about WebGL**: use a browser/device with WebGL2 enabled.
- **Exports do nothing**: check whether the browser blocked downloads or whether no image/palette is active yet.
- **Saved recipes disappeared**: recipes live in this browser's `localStorage`; clearing site data removes them.
