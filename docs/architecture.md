# Palette Synth architecture

Palette Synth is intentionally split into small controllers around one composed app graph. The shader is the furnace; the controllers are plumbing; `src/app/create-app.js` is the manifold where named domain pipes meet.

Behavior should live in domain modules or lower-level controllers, not grow back inside the composition root.

## Project layout

```text
.
├── index.html              # Application shell and controls
├── style.css               # Full application styling
├── app.js                  # Browser entry point
├── palette-presets.js      # Built-in preset palette table on globalThis
├── package.json            # Module mode plus scripts
├── docs/                   # User and maintainer documentation
├── src/                    # Application modules, shaders, and helpers
├── tests/                  # Node test suite
└── tools/                  # Repository maintenance scripts
```

## Runtime graph

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

The CPU side builds palette records, config snapshots, diagnostics, and UI state. The GPU side handles levels and palette remapping passes.

`create-app.js` should read like the map of the machine: domain construction, port attachment, and the returned public surface. If a change adds behavior there, it is probably in the wrong room.

## Source map

### Root files

| Path | Purpose |
|---|---|
| `index.html` | Declares the app shell, canvas, toolbar, palette controls, diagnostics panels, recipe panel, and animation export panel. |
| `style.css` | Defines the responsive workbench, dockable controls pane, preview canvas, swatch UI, diagnostics, and panel styling. |
| `app.js` | Starts the app and reports startup errors into the page. |
| `palette-presets.js` | Provides the original built-in palette preset table as `globalThis.PALETTE_PRESETS`. |
| `package.json` | Enables ES modules and exposes start/test/check scripts. |
| `LICENSE` | Project license. |

### `src/` top-level modules

| Path | Purpose |
|---|---|
| `src/app-runtime.js` | Loads shaders, creates the app, and waits for `DOMContentLoaded` before initialization. |
| `src/constants.js` | App-wide constants, harmony metadata, cosine presets, and the built-in preset bridge. |
| `src/color-utils.js` | Shared color math, OKLab/OKLCh conversion, seeded randomness, palette records, sorting, and hex helpers. |
| `src/demo-image.js` | Inline demo SVG used when no image has been loaded yet. |
| `src/palette-export.js` | Serializes palettes to text-oriented export formats. |
| `src/zip-store.js` | Minimal stored-ZIP writer used by animation export. |
| `src/README.md` | Source directory module map and object-shape notes. |

### `src/app/`

| Path | Purpose |
|---|---|
| `src/app/create-app.js` | Composition root. Constructs domains, attaches ports, and returns the public app surface. |
| `src/app/core.js` | Normalizes browser/env dependencies, shader sources, runtime state, cached elements, and config. |
| `src/app/ports.js` | Named late-bound ports for cross-domain callbacks that cannot be wired in strict construction order. |
| `src/app/initializer.js` | Consumes grouped domain dependencies, collects DOM elements, initializes WebGL, binds controls, and starts loading. |
| `src/app/domains/status-domain.js` | Wires status text behavior. |
| `src/app/domains/history-domain.js` | Wires undo/redo plus Escape cancellation policy for mask/region interaction. |
| `src/app/domains/manual-domain.js` | Wires manual swatch model, swatch list, and manual swatch editor. |
| `src/app/domains/palette-domain.js` | Wires palette cycling, active palette runtime, preview swatches, locks, aliases, and cycle tags. |
| `src/app/domains/view-domain.js` | Wires viewport, compare split, palette region selection, and mask painting. |
| `src/app/domains/diagnostics-domain.js` | Wires diagnostics metrics, panels, overlay state, and pixel inspection controller. |
| `src/app/domains/render-domain.js` | Wires shader programs, level sources, and render session scheduling/dirty flags. |
| `src/app/domains/export-domain.js` | Wires full-image rendering, animation export, and image/palette download actions. |
| `src/app/domains/image-domain.js` | Wires main/reference image loading, object URL management, and demo image loading. |
| `src/app/domains/app-actions-domain.js` | Wires config, manual palette actions, randomization, conditional panels, and reset behavior. |
| `src/app/config-controller.js` | Applies config changes, marks render/session dirty flags, and syncs labels. |
| `src/app/runtime-state.js` | Creates isolated mutable runtime state for canvases, images, palette records, and UI flags. |
| `src/app/status-controller.js` | Writes status text and transient messages. |
| `src/app/conditional-panels.js` | Shows, hides, and annotates controls based on active palette/output/assignment modes. |
| `src/app/reset-controller.js` | Applies reset snapshots through the config controller. |
| `src/app/randomizer.js` | Generates randomized configuration changes within app-safe ranges. |

### `src/ui/`

| Path | Purpose |
|---|---|
| `src/ui/dom.js` | Central DOM ID list, element collection, and low-level config/value syncing. |
| `src/ui/controls.js` | Static event binding for sliders, selects, buttons, recipe controls, compare controls, and animation export controls. |
| `src/ui/workbench.js` | Docking, resizing, collapsed panel state, and workbench preference persistence. |
| `src/ui/viewport.js` | Canvas sizing, fit/zoom/pan math, pointer normalization, and viewport controller. |
| `src/ui/canvas-interactions.js` | Pointer, wheel, pan, zoom, compare drag, pixel-inspection, and double-click routing. |
| `src/ui/compare-split.js` | Before/after split math and compare control synchronization. |
| `src/ui/palette-region.js` | Palette sampling-region selection, overlay geometry, drag lifecycle, and region reset. |
| `src/ui/cycle-mask.js` | Cycle-mask drawing and interaction state. |
| `src/ui/palette-preview.js` | Renders palette swatches, generated locks, manual aliases, and cycle tagging affordances. |
| `src/ui/manual-palette-editor.js` | Popover/editor for manual swatch source colors, aliases, duplication, removal, and copy actions. |
| `src/ui/manual-swatches-list.js` | Renders and mutates the manual swatch list in the controls pane. |
| `src/ui/diagnostics-panel.js` | Formats and renders assignment summaries, X-Ray plots, collision warnings, selection traces, and pixel diagnostics. |
| `src/ui/floating-pixel-inspector.js` | Floating inspector behavior and pixel diagnostic display. |
| `src/ui/color-picker.js` | Color picker interactions and normalization. |
| `src/ui/dynamic-skin.js` | UI skin updates derived from current palette state. |
| `src/ui/dismissible-menus.js` | Dismissible menu/panel interactions. |
| `src/ui/range-scrub-skin-hold.js` | Range input scrubbing affordances. |
| `src/ui/shortcuts.js` | Keyboard shortcut binding. |

### `src/palette/`

| Path | Purpose |
|---|---|
| `src/palette/runtime.js` | Selects the active palette source, normalizes generated/reference/manual inputs, and produces render-ready records. |
| `src/palette/generation.js` | Builds generated, preset, harmony, cosine, and manual-assisted palettes. |
| `src/palette/sampling.js` | Normalizes sample regions, creates patch origins, and samples image blocks into OKLab candidates. |
| `src/palette/selection.js` | Scores and selects generated-palette candidates. |
| `src/palette/cycle.js` | Sorts and cycles palette records globally, in bands, or by manual cycle tags. |

### `src/manual/`

| Path | Purpose |
|---|---|
| `src/manual/ids.js` | Creates and normalizes manual swatch IDs. |
| `src/manual/swatches.js` | Owns manual swatch normalization, alias handling, indexing, insert/remove behavior, and editability. |
| `src/manual/manual-palette-actions.js` | Owns captured palettes, LUT import, preset loading, preset saving, and manual palette mutation actions. |

### `src/runtime/`

| Path | Purpose |
|---|---|
| `src/runtime/image-controller.js` | Owns image decoding, scaled canvas creation, main/reference image state, and object URL cleanup. |
| `src/runtime/shader-programs.js` | Owns config-to-shader-program selection and cached program building. |
| `src/runtime/level-sources.js` | Owns the source-level adjustment pass. |
| `src/runtime/render-session.js` | Owns dirty flags, texture/program state, palette uniforms, render scheduling, and draw orchestration. |
| `src/runtime/cycle-preview.js` | Owns live palette-cycle preview playback. |
| `src/runtime/source-auto-levels.js` | Computes automatic source-level adjustments. |
| `src/runtime/lazy-image-data.js` | Lazily reads and caches image data for CPU-side work. |

### `src/gl/`

| Path | Purpose |
|---|---|
| `src/gl/context.js` | Creates WebGL2 contexts, resizes drawing buffers, and clears framebuffers. |
| `src/gl/programs.js` | Compiles shaders, links programs, injects defines, caches programs, and disposes GL resources. |
| `src/gl/textures.js` | Creates/configures textures and uploads canvas sources. |
| `src/gl/uniforms.js` | Uniform lookup and upload helpers. |
| `src/gl/block-sampler.js` | GPU-backed block sampling helpers. |
| `src/gl/levels-renderer.js` | Runs the source-levels pass. |
| `src/gl/palette-renderer.js` | Uploads uniforms and runs the palette remapping pass. |
| `src/gl/offscreen-palette-target.js` | Source-sized framebuffer and texture used as the palette pass target when post-process is active. |
| `src/gl/post-process-renderer.js` | Manages ping-pong textures and runs the despeckle iterations. |
| `src/gl/view-composite-renderer.js` | Final viewport pass used for post-processing and compare. |

### `src/shaders/`

| Path | Purpose |
|---|---|
| `src/shaders/index.js` | Fetches shader source files for the runtime. |
| `src/shaders/fullscreen.vert` | Fullscreen triangle/quad vertex shader shared by the render passes. |
| `src/shaders/levels.frag` | Source-level adjustment pass for exposure, gamma, shoulder, curve center, and curve amount. |
| `src/shaders/clarity-lightness-blur.frag` | First clarity prep pass: horizontally blurs OKLab lightness from the source image. |
| `src/shaders/clarity-sharp-pass.frag` | Builds the clarity sharpness lightness signal from source lightness and the blurred local-lightness map. |
| `src/shaders/clarity-sharp-blur.frag` | Horizontally blurs the sharpness signal used by the final clarity blend. |
| `src/shaders/clarity.frag` | Final clarity pass: blends clarity-adjusted OKLab lightness back into the source image. |
| `src/shaders/block-sample.frag` | Block sampling pass for center, mean, and representative source sampling modes. |
| `src/shaders/palette.frag` | Main palette remapping shader: matching, output modes, dithering, cycle regions, and palette strip display. |
| `src/shaders/palette-post.frag` | Post-palette despeckle pass using a 3×3 mode filter. |
| `src/shaders/view-composite.frag` | Final viewport blit for post-processing and compare; applies view transform and compare split. |

### `src/diagnostics/`

| Path | Purpose |
|---|---|
| `src/diagnostics/metrics.js` | Computes CPU-side assignment weights, palette usage, collision checks, signatures, and diagnostic summaries. |
| `src/diagnostics/pixel-inspector.js` | Mirrors output-mode math on the CPU for click-to-inspect pixel diagnostics. |
| `src/diagnostics/output-color.js` | CPU-side output color helpers used by diagnostics. |
| `src/diagnostics/controller.js` | Refreshes diagnostics panels and connects canvas clicks to pixel inspection. |

### `src/export/`

| Path | Purpose |
|---|---|
| `src/export/downloads.js` | Browser download helpers for blobs, canvases, JSON, and animation pacing. |
| `src/export/palette-files.js` | Dispatches palette exports to PNG or text serializers. |
| `src/export/rendered-canvas.js` | Creates offscreen full-resolution renders and export-specific palette uniforms. |
| `src/export/export-actions.js` | Wires UI export buttons to visible image, full image, and palette export actions. |
| `src/export/animation-controller.js` | Syncs animation export settings and starts frame ZIP export. |
| `src/export/animation-zip.js` | Sanitizes filenames, calculates loop spans, builds frame plans, and writes animation ZIP downloads. |
| `src/export/animation-gif.js` | GIF export helpers. |

### `src/state/`

| Path | Purpose |
|---|---|
| `src/state/config.js` | Default config, reset config, enum maps, snapshot cloning, sanitization, and import normalization. |
| `src/state/history.js` | Undo/redo stacks, history snapshots, shortcuts, and history button state. |

### `src/storage/`

| Path | Purpose |
|---|---|
| `src/storage/local-storage.js` | Guarded JSON read/write helpers for `localStorage`. |
| `src/storage/manual-presets.js` | Manual preset IDs, normalization, loading, and saving. |
| `src/storage/recipes.js` | Recipe IDs, names, import/export envelopes, normalization, storage, and file parsing. |
| `src/storage/workbench.js` | Workbench dock/pane/collapsed-panel preference loading and saving. |

### `src/recipes/`

| Path | Purpose |
|---|---|
| `src/recipes/controller.js` | Saves, updates, loads, deletes, imports, and exports recipes through the UI. |

### `tests/`

The test suite mirrors the module boundaries. Tests are grouped by controller or helper name, for example `palette-runtime.test.js`, `render-session.test.js`, `manual-palette-actions.test.js`, `diagnostics-panel.test.js`, and `viewport.test.js`.

This is the practical maintenance map: when a module moves, its matching test usually tells you what behavior must stay nailed down.

### `tools/`

| Path | Purpose |
|---|---|
| `tools/check-js.js` | Recursively syntax-checks JavaScript files with Node. |
| `tools/run-e2e-if-browser.js` | Runs the E2E smoke test only when a browser is available. |
