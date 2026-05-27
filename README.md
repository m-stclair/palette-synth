# Palette Synth

Palette Synth is a dependency-free browser tool for palette extraction and remapping. You can use it for utilitarian colorist work,
but it is primarily intended as a synthetic limited-color media instrument, emulator for imaginary media, and color toy. 
It is a standalone extraction and expansion of the **Palette Synth** effect from [`vandal`](https://github.com/m-stclair/vandal), packaged as 
plain HTML, CSS, JavaScript modules, and GLSL shaders. 

(Note: Unlike `vandal` as a whole, Palette Synth does not intend to model ink, paper, screens, phosphors, plate separations, 
registration, dot gain, lens/scan artifacts, etc., etc. It asks very deep questions about palette-space transformation in particular.
Pixelization, dithering, and local contrast enhancement are as far as it goes into the spatial domain.)

The app runs entirely in the browser. No build step. No server-side processing. A tiny local server is only necessary
because ES modules and shader `fetch()` calls need an HTTP origin; opening `index.html` directly from `file://` will
usually fail.

## Quick start

From the project root, serve this directory and open the served URL in a modern browser with WebGL2 support. 
You can use any static server, but if you have python installed:

```sh
python3 -m http.server 8000
# open http://localhost:8000/
```

Alternatively: use the live version at m-stclair.github.io/palette-synth.

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
- Source levels: exposure, gamma, clarity, tone curve shoulder, tone curve center, tone curve amount.
- Dither patterns: ordered 2×2, ordered 4×4, ordered 8×8, hash noise, etched lines, screenprint dots, crosshatch ink, stipple grain, woven threads, and contour wash.
- Palette cycling with global, banded, and manually tagged swatches.
- Pixel-perfect preview, zoom, pan, and before/after compare split.
- Optional pixel-art post-process: despeckle (3×3 mode filter, 1–4 passes). It runs at art-pixel granularity so it respects `pixelBlockSize`. The diagnostic overlay short-circuits the post-process pipeline so swatch/difference views always reflect raw palette output.

## Palette generation options

Use **Mode** to choose where the palette comes from.

**Generated from main image** samples the loaded image and builds a palette from its colors. This is the best starting point when you want the output to feel native to the image.

**Generated from reference image** samples a separate image for color, then applies that palette to the main image. Use this when you want one image to borrow the mood of another.

**Seed harmony** builds a palette from a single seed color. Choose a color relationship like complementary, triad, tetrad, analogous, or monochrome, then adjust how shadows, midtones, and highlights shift across the palette.

**Procedural cosine** creates a synthetic palette from smooth mathematical waves. Presets like Sinebow, Aurora, Ember, Candy, and Mineral give different color rhythms. Custom vectors expose the raw formula controls for deeper tweaking.

**Manual / preset** uses hand-picked swatches or built-in presets. Generated palettes can also be captured into the manual palette for further editing.

### Shared generation controls

**Size** sets how many colors the generated palette should contain.

**Seed** changes the random sampling pattern while keeping results repeatable. Same settings, same seed, same palette.

**Palette region** limits sampling to a selected area of the main image. Useful when the full image has junk colors you do not want driving the palette.

**Capture palette** saves the current generated palette into the manual palette. You can replace the manual palette, append to it, fill only unlocked manual slots, or save it as a preset.

**Palette locks** let you keep generated swatches while the rest of the palette changes around them. Click a generated swatch to lock it; use **Clear locks** to release them.

### Image-generated palette controls

**Tint/shade families** expands each selected color into related light, base, and dark variants. Turn it off when you want every palette slot picked directly from the image.

**Tint/shade** controls how far those light and dark variants move from the base color.

**Sample width** controls the size of pixel blocks for sampling candidate swatches. Low values can catch colors that only appear in single sharp details or edges; higher values can help avoid
filling your palette with compression artifacts and detector noise. The default is 3, meaning that samples are the mean of 3x3-pixel squares.

**Sample placement** chooses how samples are spatially distributed. **Random** is loose and organic. **Stratified + jittered** spreads samples more evenly across the image or selected region.

**Tonal zone weight** multiplies both tonal need pressure and tonal crowding pressure. `1` keeps the default behavior, `0` disables both forces, and `2` doubles both. These pressures
encourage distribution across coarsely-defined lightness regions while ignoring small-scale clumping.

**Width bonus** multiplies both the novelty bonus and the range expansion bonus. `1` keeps the default behavior, `0` disables those width-seeking bonuses, and `2` doubles them. These factors
tend to encourage less-clumped palettes and in particular a wider shadow/highlight range, but aren't a strict cap like selection spacing.

**Hue spread** is pushes the palette toward a wider variety of hues without directly encouraging or discouraging clumping in other dimensions.

**Selection spacing** controls how different selected colors need to be. Higher spacing avoids similar colors when possible; lower spacing allows tighter, subtler color groupings. At its 
lowest value, 1, it is essentially just a "de-dupe". Selection spacing takes precedence over all other factors. On large palettes, particularly for relatively homogeneous 
images, it can easily dominate the effects of other settings, because later picks are forced to spread away from early high-scoring picks, and there are only so many meaningfully
different ways to arrange swatches across the color surface while keeping far from one another.

**Midtone appeal**, **outlier appeal**, and **chroma appeal** are intended primarily as secondary 'nudges' to swaatch selection. However, at high values 
or if other factors are suppressed, they can dominate. Because they are flat per-swatch bonuses (not dependent on prior picks), when their effects dominate, they can produce
very repetitive palettes.

- **Midtone appeal** favors candidates away from pure shadow or highlight when positive, and favors more extreme brightness/darkness when negative. 
- **Outlier appeal** favors colors far away from image average when positive, and close to image average when negative. This can be good for highlighting
  or suppressing accents and noise.
- **Chroma appeal** favors stronger, more saturated colors when positive, and more muted colors when negative.



### Harmony controls

**Seed swatch** is the starting color for harmony palettes.

**Color relationship** chooses the hue structure: complementary, split complement, triad, tetrad, square, analogous, accented analogous, or monochrome.

**Tonal region color** controls how shadows, midtones, and highlights shift in hue. For example, shadows can cool down while highlights warm up.

**Tonal ramp steepness** controls how aggressively the harmony spreads across light and dark regions. Low values stay close to the seed; high values create stronger separation.

### Cosine controls

**Cosine preset** chooses the procedural color curve.

**Custom cosine vectors** expose the formula behind the palette. Each row affects lightness, chroma, or hue over the palette: `a` sets the center, `b` sets the swing, `c` sets the frequency, and `d` sets the phase. Small changes can move the whole palette fast. This is the weird machine room. Powerful, but sharp.

### Manual palette controls

Manual palettes can be edited swatch by swatch. Generated, reference, harmony, and cosine palettes can also be captured
into manual swatches with four strategies:

- replace the manual palette (Shift +M)
- append to the current manual palette
- fill unlocked manual slots
- save as a manual preset

Manual swatches use additive match anchors: each swatch always catches its current color, and can also catch
extra colors that route to the same rendered swatch. Use per-swatch **Also catch original source**,
**Pick from source image**, or the global **Also catch all original sources** when palette adjustments move
the visible colors but source pixels should still route to the edited swatches.

Manual palettes can also be edited in X-Ray in the inspector window (see next section).


## Editing Palettes in the X-Ray

### Opening the X-Ray

The X-Ray lives in the **Inspector** panel as one of five tabs: *Pixel*, *Families*, *Diagnostics*, **X-Ray**, and *Histogram*. Click the **X-Ray** tab to open it, or cycle through inspector tabs with **Shift+I** until you land on it. (**I** on its own toggles the floating inspector open and closed, if it's hidden entirely.)

Once you're there, you'll see a plot of your current palette plus a small row of view buttons across the top. Those buttons matter, because *which view you're in determines what you can edit*.

### The five views, and which ones let you edit

The X-Ray offers five ways of looking at the same palette. They aren't restyled versions of one chart; each one surfaces a genuinely different property of your colors.

| View | What it shows | Editable? |
|------|--------------|-----------|
| **Scatter** | Hue across the x-axis, lightness up the y-axis | **Yes** |
| **Wheel** | A polar OKLCh wheel — hue around the rim, chroma as distance from center | **Yes** |
| **Tonal** | A one-dimensional lightness ramp, left (dark) to right (light) | **Yes** |
| **Proximity** | A pairwise distance matrix that surfaces colors sitting too close together | No — read-only |
| **Cylinder** | A rotatable 3D LCH volume you can orbit by dragging | No — read-only |

The short version: **Scatter, Wheel, and Tonal are the editing views.** Proximity and Cylinder are diagnostic — they're there to help you *decide* what to change, not to change it. Dragging a swatch in Proximity or Cylinder won't move it; the swatch markers there simply aren't draggable. (You can still *click* a marker in any view — more on that below.)

This split is deliberate. Each editable view gives you a different kind of control:

- **Scatter** is your two-axis workhorse. One drag adjusts both hue and lightness at once.
- **Wheel** is for hue-and-chroma decisions — rotate a color around the rim, or pull it toward the center to desaturate it, while its lightness stays put.
- **Tonal** is the most surgical. It changes *only* lightness, so you can fix a tonal gap without disturbing hue or chroma at all.

### What you can and can't move

**You can only reposition editable manual swatches.**

The X-Ray plots every color in your active palette, but they don't all behave the same way. Generated colors, locked colors, and colors derived from a source image are shown for context — you can see them, you can click them, but you can't drag them. Only unlocked swatches in a **manual palette** will respond to a reposition gesture.

If you try to drag something that isn't editable, the app won't move it. Instead, you'll see a status message: *"Alt-drag reposition works on editable manual swatches."* That's not an error — it's the app telling you that you've grabbed the wrong kind of color. If you want to edit a generated palette by hand, capture it to your manual palette first (**Shift+M** does this), and then its swatches become fair game.

### Repositioning a swatch — the core gesture

Moving a swatch is an **Alt-drag**. Hold the **Alt** key, press on a swatch marker, and drag.

1. Switch to **Scatter**, **Wheel**, or **Tonal**.
2. Hold **Alt**.
3. Press on the swatch marker you want to move.
4. Drag. The swatch follows your pointer, and the preview updates live as you go.
5. Release.

A few things worth knowing about how the drag *feels*:

- **It's live.** The image preview re-renders continuously while you drag, so you're editing against the real result, not a guess. What you see at release is what you get.
- **Each view constrains the drag to its own axes.** In Scatter you're moving in hue *and* lightness. In Wheel you're moving in hue *and* chroma, with lightness held constant. In Tonal you're moving lightness *only* — drag left or right and nothing else changes. Pick your view based on which properties you want to leave alone.
- **The neutral column is real.** In Scatter, there's a narrow band on the far left labeled "neutral." Drag a swatch into it and the color collapses to a true neutral — chroma drops to zero. Drag back out and it picks up chroma again. It's a quick way to make something gray, or to rescue a near-gray that's drifting.

When you let go, the move is committed to history, and the status line confirms it: something like *"Moved swatch 3 to …"* with the new color. Which means — yes — **undo works.** If a drag goes somewhere ugly, **Ctrl+Z** (or your platform's undo) puts it back. The whole Alt-drag, from press to release, is a single undoable step.

#### If a drag goes wrong mid-gesture

If you start a drag and think better of it, releasing after a real move still commits. But a drag that's canceled by the system — say, the pointer leaves the window — is treated as a cancel: the swatch snaps back to where it started and nothing is recorded. The reliable "undo" is still just Alt-drag normally and then **Ctrl+Z**.

### Recoloring pixels

By default, an Alt+drag replaces the swatch's source color. Sometimes you want to move the visible output color while making sure that the swatch still matches the original source color.

**Hold Shift while Alt-dragging to do exactly this.** At the moment your pointer moves, the swatch's original color is pinned as a match anchor (shown in X-Ray as a rotated diamond connected to the swatch by a dashed line), and the swatch's new position becomes the rendered output. Source pixels near both the original position and the new position will route to this swatch.

This is particularly useful after capturing a generated palette — you can nudge swatches toward better target colors while preserving the image's original color routing.

### Promoting a match anchor back into the source (or: undoing pixel recoloring)

The companion gesture: if a swatch has an extra match anchor and you decide you actually want *that* color to be the swatch's real source, you can promote it.

**Alt+Shift+double-click** a draggable swatch marker. The swatch's match anchor becomes its source color, and the status line confirms the swap. If the swatch doesn't have a match anchor to promote, the app tells you so rather than doing anything surprising — *"Swatch N has no extra match anchor to make into its source."*

**This also works as a reset of the anchor-drop above.** Drop an anchor while dragging, move it around, decide you didn't want to recolor those pixels in the first place: alt-shift-double-click places the swatch back in its original location with no extra match anchor.

### Clicking a swatch (no Alt) — selecting and the modifier menu

Plain interactions — no Alt held — don't move anything. They *select* and *toggle*. A click, or pressing **Enter** or **Space** on a focused marker, activates that swatch, and modifiers change what "activate" means:

- **Plain click / Enter / Space** — selects the swatch. If it's an editable manual swatch, this is also how you open it for editing in the manual palette editor.
- **Shift+click** — toggles the *diagnostic overlay* for that swatch, isolating its pixels in the preview so you can see exactly where that color lands in the image. Shift+click the same swatch again to turn the overlay off.
- **Ctrl+click** (or **Cmd+click**) on an editable swatch — toggles **mute**. A muted swatch stays in your palette but is pulled out of active assignment; the X-Ray draws it with a small diagonal slash so you can spot it at a glance. One guard rail here: the app won't let you mute your last remaining active swatch — a palette needs at least one color doing the work.

Every marker is keyboard-reachable: **Tab** to a swatch, and **Enter** or **Space** activates it just like a click. The editing *drags*, though, are pointer gestures — there isn't a keyboard equivalent for Alt-drag repositioning.

### Reading the markers

While you're editing, the swatch markers tell you about their own state.

- A **diagonal slash** through a marker means the swatch is **muted**.
- A marker drawn as **selected** is the one currently open in the manual editor.
- Markers also reflect **locked** and **cycle-tagged** states.
- Hovering a marker shows a tooltip with the swatch number, its color, and any of those states spelled out in words.

So if a swatch isn't responding to an Alt-drag, glance at its marker first — a slash, or a "locked" tooltip, usually explains why.

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
| `src/palette/selection.js`  | Scores candidates and selects diverse swatches using secondary candidate-appeal nudges plus tonal, novelty, spacing, and hue-family pressure.      |
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

| Path                                           | Purpose                                                                                                     |
|------------------------------------------------|-------------------------------------------------------------------------------------------------------------|
| `src/shaders/index.js`                         | Fetches shader source files for the runtime.                                                                |
| `src/shaders/fullscreen.vert`                  | Fullscreen triangle/quad vertex shader shared by the render passes.                                         |
| `src/shaders/levels.frag`                      | Source-level adjustment pass for exposure, gamma, shoulder, curve center, and curve amount.                 |
| `src/shaders/clarity-lightness-blur.frag`      | First clarity prep pass: horizontally blurs OKLab lightness from the source image.                          |
| `src/shaders/clarity-sharp-pass.frag`          | Builds the clarity sharpness lightness signal from source lightness and the blurred local-lightness map.    |
| `src/shaders/clarity-sharp-blur.frag`          | Horizontally blurs the sharpness signal used by the final clarity blend.                                    |
| `src/shaders/clarity.frag`                     | Final clarity pass: blends clarity-adjusted OKLab lightness back into the source image.                     |
| `src/shaders/block-sample.frag`                | Block sampling pass for center, mean, and representative source sampling modes.                             |
| `src/shaders/palette.frag`                     | Main palette remapping shader: matching, output modes, dithering, cycle regions, and palette strip display. |
| `src/shaders/palette-post.frag`                | Post-palette despeckle pass using a 3×3 mode filter.                                                        |
| `src/shaders/view-composite.frag`              | Final viewport blit for post-processing and compare; applies view transform and compare split.              |

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
