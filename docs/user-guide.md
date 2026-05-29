# Palette Synth user guide

This guide covers the user-facing controls: palette sources, generation options, rendering modes, diagnostics, export, and persistence.

For a literal inventory of every visible knob and button, see [Control reference](control-reference.md). For swatch editing inside the inspector X-Ray, see [X-Ray editing](x-ray-editing.md). For project internals, see [architecture](architecture.md).

## Palette pipeline

Palette Synth takes an input image and renders a recolored version through a configurable palette pipeline:

1. Load an image, or use the built-in demo image.
2. Choose a palette source.
3. Adjust sampling, matching, levels, output mode, dithering, and cycling.
4. Inspect palette coverage and per-pixel assignments.
5. Export the current view, the full-resolution processed image, palettes, recipes, or animation frame ZIPs.

## Palette sources

Use **Mode** to choose where the palette comes from.

**Generated from main image** samples the loaded image and builds a palette from its colors. This is the best starting point when you want the output to feel native to the image.

**Generated from reference image** samples a separate image for color, then applies that palette to the main image. Use this when you want one image to borrow the mood of another.

**Seed harmony** builds a palette from a single seed color. Choose a color relationship like complementary, triad, tetrad, analogous, or monochrome, then adjust how shadows, midtones, and highlights shift across the palette.

**Procedural cosine** creates a synthetic palette from smooth mathematical waves. Presets like Sinebow, Aurora, Ember, Candy, and Mineral give different color rhythms. Custom vectors expose the raw formula controls for deeper tweaking.

**Manual / preset** uses hand-picked swatches or built-in presets. Generated palettes can also be captured into the manual palette for further editing.

## Rendering controls

- **Assignment modes:** nearest, blend, and dither.
- **Output modes:** full replace, preserve luma, preserve chroma, hue wash, and shadow/highlight.
- **Matching weights:** OKLab perceptual weights for luma, chroma, and hue.
- **Source levels:** exposure, gamma, clarity, tone curve shoulder, tone curve center, and tone curve amount.
- **Dither patterns:** ordered 2×2, ordered 4×4, ordered 8×8, hash noise, etched lines, screenprint dots, crosshatch ink, stipple grain, woven threads, and contour wash.
- **Palette cycling:** global, banded, and manually tagged swatches.
- **Preview controls:** pixel-perfect preview, zoom, pan, and before/after compare split.
- **Pixel-art post-process:** despeckle, a 3×3 mode filter with 1–4 passes, plus edge tighten, a conservative one-pass cleanup for weak gaps and chipped corners. Dither protection is enabled by default so those cleanup passes do not chew through intentional two-color dither texture. All of this runs at art-pixel granularity so it respects `pixelBlockSize`. The diagnostic overlay short-circuits the post-process pipeline, so swatch and difference views always reflect raw palette output.

## Shared generation controls

**Size** sets how many colors the generated palette should contain.

**Seed** changes the random sampling pattern while keeping results repeatable. Same settings, same seed, same palette.

**Palette region** limits sampling to a selected area of the main image. Useful when the full image has junk colors you do not want driving the palette.

**Capture palette** saves the current generated palette into the manual palette. You can replace the manual palette, append to it, fill only unlocked manual slots, or save it as a preset.

**Palette locks** let you keep generated swatches while the rest of the palette changes around them. Click a generated swatch to lock it; use **Clear locks** to release them.

## Image-generated palette controls

**Tint/shade families** expands each selected color into related light, base, and dark variants. Turn it off when you want every palette slot picked directly from the image.

**Tint/shade** controls how far those light and dark variants move from the base color.

**Sample width** controls the size of pixel blocks for sampling candidate swatches. Low values can catch colors that only appear in single sharp details or edges; higher values can help avoid filling your palette with compression artifacts and detector noise. The default is 3, meaning samples are the mean of 3×3-pixel squares.

**Sample placement** chooses how samples are spatially distributed. **Random** is loose and organic. **Stratified + jittered** spreads samples more evenly across the image or selected region.

**Tonal zone weight** multiplies both tonal need pressure and tonal crowding pressure. `1` keeps the default behavior, `0` disables both forces, and `2` doubles both. These pressures encourage distribution across coarsely defined lightness regions while ignoring small-scale clumping.

**Width bonus** multiplies both the novelty bonus and the range expansion bonus. `1` keeps the default behavior, `0` disables those width-seeking bonuses, and `2` doubles them. These factors tend to encourage less-clumped palettes and, in particular, a wider shadow/highlight range. They are not a strict cap like selection spacing.

**Hue spread** pushes the palette toward a wider variety of hues without directly encouraging or discouraging clumping in other dimensions.

**Selection spacing** controls how different selected colors need to be. Higher spacing avoids similar colors when possible; lower spacing allows tighter, subtler color groupings. At its lowest value, 1, it is essentially just a de-dupe.

Selection spacing takes precedence over all other selection factors. On large palettes, particularly for homogeneous images, it can easily dominate. Later picks are forced to spread away from early high-scoring picks, and there are only so many meaningfully different ways to arrange swatches across the color surface while keeping them far from one another.

**Midtone appeal**, **outlier appeal**, and **chroma appeal** are secondary nudges to swatch selection. At high values, or when other factors are suppressed, they can dominate. Because they are flat per-swatch bonuses, not dependent on prior picks, they can produce repetitive palettes when pushed too hard.

- **Midtone appeal** favors candidates away from pure shadow or highlight when positive, and favors more extreme brightness/darkness when negative.
- **Outlier appeal** favors colors far away from image average when positive, and close to image average when negative. This can highlight or suppress accents and noise.
- **Chroma appeal** favors stronger, more saturated colors when positive, and more muted colors when negative.

## Harmony controls

**Seed swatch** is the starting color for harmony palettes.

**Color relationship** chooses the hue structure: complementary, split complement, triad, tetrad, square, analogous, accented analogous, or monochrome.

**Tonal region color** controls how shadows, midtones, and highlights shift in hue. For example, shadows can cool down while highlights warm up.

**Tonal ramp steepness** controls how aggressively the harmony spreads across light and dark regions. Low values stay close to the seed; high values create stronger separation.

## Cosine controls

**Cosine preset** chooses the procedural color curve.

**Custom cosine vectors** expose the formula behind the palette. Each row affects lightness, chroma, or hue over the palette: `a` sets the center, `b` sets the swing, `c` sets the frequency, and `d` sets the phase. Small changes can move the whole palette fast. This is the weird machine room. Powerful, but sharp.

## Manual palette controls

Manual palettes can be edited swatch by swatch. Generated, reference, harmony, and cosine palettes can also be captured into manual swatches with four strategies:

- replace the manual palette with `Shift+M`
- append to the current manual palette
- fill unlocked manual slots
- save as a manual preset

Manual swatches use additive match anchors: each swatch always catches its current color, and can also catch extra colors that route to the same rendered swatch. Use per-swatch **Also catch original source**, **Pick from source image**, or the global **Also catch all original sources** when palette adjustments move the visible colors but source pixels should still route to the edited swatches.

Manual palettes can also be edited in X-Ray in the inspector window.

## Common workflows

### Extract a palette from an image

1. Load an image.
2. Set **Mode** to **Generated from main image**.
3. Adjust **Size**, **Sample width**, **Selection spacing**, and **Hue spread**.
4. Use diagnostics to check palette contribution and collision warnings.
5. Export the palette as `.hex`, GPL, CSS variables, JSON, PNG LUT, or another supported format.

### Borrow the mood of another image

1. Load your main image.
2. Set **Mode** to **Generated from reference image**.
3. Load a reference image.
4. Tune matching weights, output mode, and dither until the source image carries the reference image's color weather.

### Capture then hand-edit

1. Generate a palette.
2. Capture it into the manual palette with `Shift+M`.
3. Edit swatches directly or open the inspector X-Ray.
4. Use `Alt` + drag to move editable manual swatches.
5. Use `Alt` + `Shift` + drag when you want the visible color to move while preserving the original source match.

## Diagnostics

The diagnostics panels explain why the current palette behaves the way it does:

- family selection traces for generated palettes
- assignment contribution bars
- palette collision warnings
- OKLCh hue/lightness X-Ray
- click-to-inspect pixel readouts for source, matched palette colors, weighted assignments, and output color
- a floating loupe with 15×15/31×31 patch sizing, source/final patch view, source-color add, numeric source-to-fx delta readout, and a source-to-final difference heatmap toggle

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
