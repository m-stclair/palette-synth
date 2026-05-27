# Palette Synth

Palette Synth is a local-first WebGL tool for extracting, editing, remapping, cycling, and exporting limited-color palettes from images.

You can use it for utilitarian colorist work,  but it is primarily intended as a synthetic limited-color media instrument, emulator for imaginary media, and color toy. 

It is a standalone extraction and expansion of the **Palette Synth** effect from [`vandal`](https://github.com/m-stclair/vandal), packaged as plain HTML, CSS, JavaScript modules, and GLSL shaders.

[Live demo](https://m-stclair.github.io/palette-synth/) · [User guide](docs/user-guide.md) · [X-Ray editing](docs/x-ray-editing.md) · [Architecture](docs/architecture.md) · [Contributing](docs/contributing.md)

![Screenshot](/assets/screenshot.png)

## What it does

Palette Synth takes an input image and renders a recolored version through a configurable palette pipeline:

1. Load an image, or use the built-in demo image.
2. Choose a palette source.
3. Adjust sampling, matching, levels, output mode, dithering, and cycling.
4. Inspect palette coverage and per-pixel assignments.
5. Export the current view, full-resolution processed image, palettes, recipes, or animation frame ZIPs.

Unlike `vandal` as a whole, Palette Synth does **not** try to model ink, paper, screens, phosphors, plate separations, registration, dot gain, lens artifacts, scan artifacts, or the rest of the physical-media circus. It asks deeper questions about palette-space transformation in particular. Pixelization, dithering, and local contrast enhancement are as far as it goes into the spatial domain.

## Quick start

Palette Synth is a static browser app. It needs to be served over HTTP because ES modules and shader files are loaded with `fetch()`. Opening `index.html` directly from `file://` will usually fail.

From the project root:

```sh
npm run start
```

Then open:

```text
http://localhost:8000/
```

No npm install is required for the app itself. `npm install` is only needed for development tooling and tests.

You can also use any static file server:

```sh
python3 -m http.server 8000
```

Or use the live version: <https://m-stclair.github.io/palette-synth/>

## Privacy

Palette Synth runs entirely in the browser. Images are not uploaded and there is no server-side processing.

Saved recipes, captured manual presets, and workbench preferences are stored in `localStorage`. Source images are not persisted. Clear site data and the saved recipes/presets go with it. That is not a cloud sync failure. There is no cloud.

## Core features

- **Palette sources:** generated from the main image, generated from a reference image, seed harmony, procedural cosine, manual, and preset.
- **Sampling controls:** selected palette region, sample width, sample placement, tint/shade families, tonal pressure, width bonus, hue spread, and selection spacing.
- **Matching controls:** OKLab perceptual weights for luma, chroma, and hue.
- **Output modes:** full replace, preserve luma, preserve chroma, hue wash, and shadow/highlight.
- **Source levels:** exposure, gamma, clarity, shoulder, curve center, and curve amount.
- **Dithering:** ordered matrices, hash noise, etched lines, screenprint dots, crosshatch ink, stipple grain, woven threads, and contour wash.
- **Manual editing:** direct swatch editing, captured generated palettes, match anchors, mute/lock state, aliases, and cycle tags.
- **Diagnostics:** palette contribution, collision warnings, OKLCh X-Ray plots, family traces, histogram views, and click-to-inspect pixel readouts.
- **Export:** PNGs, animation frame ZIPs, LUTs, palette text formats, recipes, and saved recipe bundles.

## Common workflows

### Extract a palette from an image

1. Load an image.
2. Set **Mode** to **Generated from main image**.
3. Adjust **Size** to make it as chunky or un-chunky as you want. 
4. Hit the [Left] and [Right] arrows to cycle between different versions of the palette.
5. Open the Generation panel [3] to adjust parameters for finer control.
6. Check the diagnostics [I] if colors are clumping or fighting too much.
7. Export the palette as `.hex`, GPL, CSS variables, JSON, PNG LUT, or another supported format.

### Borrow the mood of another image

1. Load your main image.
2. Set **Mode** to **Generated from reference image**.
3. Load a reference image.
4. Tune matching weights and output mode until the source image starts speaking in the reference image's accent.

### Make a hand-edited limited-color look

1. Generate a palette.
2. Capture it into the manual palette with **Shift+M**.
3. Edit swatches directly, or use the X-Ray to move colors through OKLCh space.
4. Use match anchors when you want source pixels to keep routing to a swatch after the visible color moves.
5. Export the full-resolution PNG or animation frames.

### Build a palette from color relationships

1. Set **Mode** to **Seed harmony**.
2. Pick a seed swatch.
3. Choose a relationship: complementary, split complement, triad, tetrad, square, analogous, accented analogous, or monochrome.
4. Shape the shadow/midtone/highlight behavior with tonal region controls.

## Key gestures

| Action | Gesture |
|---|---|
| Toggle floating inspector | `I` |
| Cycle inspector tabs | `Shift+I` |
| Capture current generated palette to manual palette | `Shift+M` |
| Move editable manual swatch in X-Ray | `Alt` + drag |
| Move visible output while preserving original source match | `Alt` + `Shift` + drag |
| Promote a match anchor back into the swatch source | `Alt` + `Shift` + double-click |
| Toggle swatch diagnostic overlay | `Shift` + click |
| Mute editable swatch | `Ctrl/Cmd` + click |
| Undo | `Ctrl/Cmd+Z` |

See [X-Ray editing](docs/x-ray-editing.md) for the full version of this dance, including what can and cannot be dragged.

## Export formats

| Category | Formats |
|---|---|
| Images | visible preview PNG, full working-resolution PNG |
| Animation | PNG frame ZIP with manifest |
| Palettes | PNG LUT, `.hex`, plain text, JSON, JavaScript array, CSS variables, SCSS variables, CSV RGB, GIMP/Inkscape GPL |
| Recipes | current recipe JSON, selected saved recipe JSON, all saved recipes JSON, recipe import from JSON |

## Development

```sh
npm install
npm run check
npm test
npm run test:all
```

`npm run test:all` runs the JavaScript syntax check, the Node unit test suite, and an E2E smoke test when a browser is available.

There are no runtime dependencies. The app is plain browser JavaScript plus GLSL. The tests use Node's built-in test runner; E2E smoke tests use Playwright.

## Browser requirements

- WebGL2
- ES modules
- `fetch()` for local shader files
- Canvas / Blob / File APIs for image import and export
- `localStorage` for saved recipes, captured manual presets, and workbench preferences

## Documentation

- [User guide](docs/user-guide.md): palette sources, generation controls, rendering controls, diagnostics, export, and persistence.
- [X-Ray editing](docs/x-ray-editing.md): swatch movement, match anchors, marker states, and modifier gestures.
- [Architecture](docs/architecture.md): runtime graph, project layout, and source map.
- [Contributing](docs/contributing.md): common maintenance tasks and troubleshooting.
- [`src/README.md`](src/README.md): source-tree module map and object-shape notes for maintainers.

## Troubleshooting

- **Blank page from `file://`:** serve the folder over HTTP. Shader loading uses `fetch()`.
- **Startup error about WebGL:** use a browser/device with WebGL2 enabled.
- **Exports do nothing:** check whether the browser blocked downloads or whether no image/palette is active yet.
- **Saved recipes disappeared:** recipes live in this browser's `localStorage`; clearing site data removes them.

## License

BSD-3-Clause. See [LICENSE](LICENSE).
