# Palette Synth control reference

This is the inventory of the visible controls in Palette Synth: what each one changes, when it appears, and what it is useful for. It is intentionally more literal than the user guide. The user guide explains workflows; this file explains knobs.

## Mental model

A rendered frame moves through this pipeline:

1. **Source image prep**: source levels and clarity change the image before matching.
2. **Palette creation**: a generated, reference, harmony, cosine, or manual palette is built.
3. **Palette adjustments**: the palette can be bent by gamma, chroma gamma, and hue rotation.
4. **Pixel assignment**: each source pixel is matched to palette colors using assignment mode, perceptual weights, optional distance limits, blend/dither settings, cycle settings, and optional mask rules.
5. **Output composition**: output mode decides which parts of the matched palette color are used, then Wet/Dry Mix blends the result back over the source.
6. **Pixel-art finishing**: optional block sampling and despeckle operate at art-pixel scale.

Some controls are conditional. A hidden control is not inactive magic; it is a control for a mode you are not currently using.

## Stage toolbar

| Control | What it does |
|---|---|
| **− / +** | Zooms the preview out or in around the center of the visible image. |
| **Pixels** | Toggles pixel-perfect preview rendering. This is a display/texture sampling choice for the preview, not a palette-generation setting. |
| **Skin** | Tints the app chrome from the current palette. Pure UI candy. It does not change the image or exported palette. |
| **Compare** | Enables a before/after split view. The comparison is source image versus current processed output. |
| **Split** | Moves the before/after divider when Compare is enabled. |
| **Inspect** | Opens or closes the floating inspector. `I` toggles the inspector; `Shift+I` cycles inspector tabs. |
| **Open** | Loads a local image as the main source image. Files stay in the browser; they are not uploaded. |
| **Built-in demo image** | Loads one of the bundled demo images. |
| **View PNG** | Exports the current visible preview as a PNG, including current zoom/view framing. |
| **Full PNG** | Exports the processed image at working/source resolution, not the current viewport crop. |
| **Palette export format** | Chooses the format for **Export palette**: PNG LUT, `.hex`, `.txt`, JSON, JS array, CSS variables, SCSS variables, CSV RGB, or GPL. |
| **Export palette** | Downloads the current palette in the selected palette format. |
| **Copy hex** | Copies the current palette as hex strings. |
| **Undo / Redo** | Moves backward or forward through control and editing history. Keyboard shortcuts: `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, or `Ctrl+Y`. |
| **Reset** | Restores effect settings to their defaults. It does not replace the loaded image file. |

## Tools pane controls

| Control | What it does |
|---|---|
| **Dock left / Dock right / Dock bottom** | Moves the tools pane to that edge of the workbench. |
| **All −** | Collapses all toolbar panels. |
| **Pane resizer** | Drags the boundary between the preview and the tools pane. |

## Palette bar

| Control | What it does |
|---|---|
| **Palette swatch size, 1× / 2× / 3×** | Cycles the visible swatch size in the palette bar. Shortcut: `Shift+P`. |
| **Clear cycle tags** | Clears manually tagged cycle swatches. Appears when Manual tags cycle mode has active tags. |
| **Clear locks** | Clears generated-palette locks. Appears when generated swatches have been locked. |
| **Palette swatches** | In generated image/reference modes, click lockable swatches to keep them while regenerating; Shift-click toggles a diagnostic overlay for that swatch. In manual mode, click opens the manual swatch editor; Ctrl/Cmd-click mutes or unmutes the swatch. In Manual tags cycle mode, click tags or untags swatches for cycling. In non-editable modes, click copies a swatch hex. |

## Palette panel

### Mode

| Option | What it does |
|---|---|
| **Generated from main image** | Samples the main image and builds a palette from that image. Palette region controls can limit which part of the main image is sampled. |
| **Generated from reference image** | Samples a separate reference image, then maps the main image through the reference-derived palette. The saved main-image palette region is ignored for reference sampling. |
| **Seed harmony** | Builds a palette from one seed color plus a harmony relationship. |
| **Procedural cosine** | Builds a mathematical palette from cosine waves. Presets provide safe curves; Custom exposes the raw vectors. |
| **Manual / preset** | Uses user-edited swatches or loaded preset colors. Generated palettes can be captured here for hand editing. |

| Control | Visible when | What it does                                                                                                                                                                                                                                                                         |
|---|---|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Randomize** | Always | Randomizes palette, mapping, and finishing settings. It is a broad dice throw, not just a palette shuffle.                                                                                                                                                                           |
| **Size** | Generated/reference/harmony/cosine modes | Sets requested palette size. In image-generated tint/shade family mode, size snaps to family groups because each selected seed expands into shade/base/tint records.                                                                                                                 |
| **Seed swatch** | Seed harmony mode | Sets the starting color for harmony generation. Accepts hex-like text and uses the color picker.                                                                                                                                                                                     |
| **Color relationship** | Seed harmony mode | Chooses the hue relationship around the seed: complementary, split complement, triad, tetrad rectangle, square, analogous, accented analogous, or monochrome.                                                                                                                        |
| **Tonal region color** | Seed harmony mode | Decides how shadows, bases, and tints shift in hue/chroma relative to the seed. Options are Shared hue tint/shade, Cool shadows / warm highlights, Split contrast regions, Triadic regions, and Complementary extremes. This is the palette's shadow/midtone/highlight color weather. |
| **Tonal ramp steepness** | Seed harmony mode | Controls how strongly harmony palettes separate light and dark variants. Higher values push the ramp harder; lower values stay closer to the seed.                                                                                                                                   |
| **Cosine preset** | Procedural cosine mode | Selects a predefined procedural curve: Sinebow, Aurora, Ember, Candy, Mineral, or Custom.                                                                                                                                                                                            |
| **Custom cosine vectors** | Procedural cosine mode with Custom preset | Edits the cosine formula per channel: `a + b * cos(2π(c * t + d))`. The columns are lightness, chroma, and hue. `a` is the center, `b` is swing/amplitude, `c` is frequency, and `d` is phase. Tiny changes can move a lot. This is the exposed engine block.                        |
| **Reference image / Choose reference** | Generated from reference image mode | Loads the image used only for palette generation. The main image is still the image being rendered.                                                                                                                                                                                  |
| **Palette region / Select region** | Generated from main image mode | Enters region-selection mode. Drag on the preview to define the area that image palette sampling should use.                                                                                                                                                                         |
| **Use full image** | Generated from main image mode with a saved region | Clears the saved palette region so sampling uses the full image again.                                                                                                                                                                                                               |
| **Show selection box** | Generated from main image mode | Shows or hides the saved region overlay. Hiding the box does not clear the region.                                                                                                                                                                                                   |
| **Capture palette** | Generated/reference/harmony/cosine modes | Captures the current generated palette into manual-palette storage. The main button replaces the manual palette.                                                                                                                                                                     |
| **Replace manual palette** | Capture menu | Replaces the manual palette with the current generated palette. Shortcut: `Shift+M`.                                                                                                                                                                                                 |
| **Append to manual palette** | Capture menu | Adds current palette colors after existing manual swatches, up to the swatch limit.                                                                                                                                                                                                  |
| **Fill unlocked manual slots** | Capture menu | Writes generated colors only into unlocked manual swatch slots. Locked manual swatches survive the capture.                                                                                                                                                                          |
| **Save as manual preset** | Capture menu | Stores the generated palette as a reusable manual preset.                                                                                                                                                                                                                            |
| **Preset source** | Manual / preset mode | Chooses a built-in or saved manual preset to load.                                                                                                                                                                                                                                   |
| **‹ / › preset buttons** | Manual / preset mode | Switches to previous or next preset. Shortcuts: `,` and `.`.                                                                                                                                                                                                                         |
| **Load preset** | Manual / preset mode | Copies the selected preset into the manual palette.                                                                                                                                                                                                                                  |
| **Manual swatch color fields** | Manual / preset mode | Edit individual manual swatch colors. Each swatch has a color field, hex text field, lock button, and remove button.                                                                                                                                                                 |
| **Manual swatch lock** | Manual / preset mode | Protects that slot during **Fill unlocked manual slots** capture. It does not freeze rendering by itself.                                                                                                                                                                            |
| **Add swatch** | Manual / preset mode | Adds a new manual swatch, up to the swatch limit.                                                                                                                                                                                                                                    |
| **Paste palette** | Manual / preset mode | Opens a text import dialog. Palette Synth extracts colors from pasted hex, `rgb()`, `rgba()`, `hsl()`, and `hsla()` text.                                                                                                                                                            |
| **Import LUT** | Manual / preset mode | Imports a palette from an image LUT file.                                                                                                                                                                                                                                            |

## Palette adjustments panel

These controls bend the palette after it has been created, before assignment.

| Control | Visible when | What it does |
|---|---|---|
| **Gamma** | Always | Remaps palette lightness. Values above or below `1` compress or expand the palette's dark/light distribution. It changes the palette, not the source image. |
| **Chroma gamma** | Always | Remaps palette chroma/saturation. Values above or below `1` reshape how muted versus colorful swatches spread. |
| **Hue** | Always | Rotates palette hue in degrees. |
| **Generated assist** | Manual / preset mode | Blends manual swatches toward a freshly generated image palette. `0` is pure manual; `100` is fully assisted by generated colors resampled to the manual swatch count. Requires a source image. |
| **Also catch all original sources** | Manual / preset mode | Adds each manual swatch's original source color as an extra match anchor while still catching its current color. Useful when you globally edit the palette but want pixels that matched the old colors to keep routing to the same swatches. |

## Generation panel

These controls affect palette creation, not final pixel assignment. Many are visible only for generated/reference modes because manual and preset palettes already have their colors.

| Control | Visible when | What it does |
|---|---|---|
| **Image tint/shade families** | Generated/reference modes | When on, each selected image color expands into a small family: shade, base, and tint. When off, every palette slot is selected directly from sampled image colors. |
| **Custom cosine tint/shade** | Procedural cosine Custom preset | When on, custom cosine samples expand into tint/shade families. When off, the custom cosine curve emits direct colors only. |
| **Tint/shade** | Generated/reference family modes, harmony, and custom cosine family mode | Sets how far generated shade/tint variants move in lightness from their base color. This also affects family-spacing calculations for image selection. |
| **Sample width** | Generated/reference modes | Sets the square sample size used when reading candidate palette colors from an image. `1` reads individual pixels; larger values average small blocks and suppress tiny artifacts. |
| **Seed** | Generated/reference/harmony/cosine modes | Changes deterministic randomness: sample placement, tie-break jitter, and procedural variation. Same image + same settings + same seed means repeatable output. |
| **Sample placement: Random** | Generated/reference modes | Places candidate samples freely across the sampling region. Good for loose variation. |
| **Sample placement: Stratified + jittered** | Generated/reference modes | Spreads candidate samples across a grid, with jitter inside each cell. Good for more even spatial coverage. |
| **Midtone appeal** | Generated/reference modes | Adds a secondary score nudge toward midtones when positive, or toward shadow/highlight extremes when negative. It is weaker than spacing and tonal/range pressures unless pushed hard. |
| **Outlier appeal** | Generated/reference modes | Adds a secondary score nudge toward colors far from the image average when positive, or toward average colors when negative. Great for accents; also great for accidentally loving noise. |
| **Chroma appeal** | Generated/reference modes | Adds a secondary score nudge toward more colorful candidates when positive, or muted candidates when negative. |
| **Tonal zone weight** | Generated/reference modes | Multiplies the lightness-zone pressure that tries to distribute choices across shadow, midtone, and highlight regions. `0` disables that pressure; `1` is default; `2` doubles it. |
| **Width bonus** | Generated/reference modes | Multiplies novelty and lightness-range expansion bonuses. Higher values push the palette to cover a wider footprint; lower values allow tighter clusters. |
| **Hue spread** | Generated/reference modes | Rewards hue variety among selected colors. It does not force equal hue distribution; it just pays the selector for spreading out. |
| **Selection spacing** | Generated/reference modes | Minimum-ish color/family spacing between selected colors. Higher values prevent similar picks when possible. This control can dominate on homogeneous images because the picker runs out of distinct places to go. |

## Source levels panel

These controls prepare the source image before palette matching. They alter what colors pixels appear to be for assignment.

| Control | What it does |
|---|---|
| **Exposure** | Multiplies source lightness by powers of two. Positive values lift; negative values darken. |
| **Gamma** | Applies source-lightness gamma. It changes tonal distribution before matching. |
| **Shoulder** | Sets the steepness of the optional S-shaped/logistic tone curve. Higher values make the curve transition harder. |
| **Curve center** | Moves the center point of the optional tone curve. The range is negative because the curve operates in log-lightness space. |
| **Curve amount** | Blends from straight exposure/gamma output to the shoulder/center curve. `0` means no curve; `1` means full curve. |
| **Clarity** | Adds local lightness contrast before palette mapping. It is a spatial detail enhancement, not a palette edit. |
| **Auto levels** | Estimates exposure and gamma from the source image lightness range and applies them. It currently adjusts Exposure and Gamma, then leaves the rest of the curve controls as they were. |

## Mapping panel

Mapping controls decide how source pixels choose palette colors and what final color properties are preserved.

| Control | What it does |
|---|---|
| **Assignment: Nearest** | Each pixel chooses the single closest palette color using the current perceptual weights. Hard, graphic, decisive. |
| **Assignment: Blend** | Each pixel blends up to **Width** nearest palette colors. **Softness** controls how quickly influence falls away with distance. |
| **Assignment: Dither** | Each pixel chooses between nearby palette colors using a pattern, creating spatial mixtures instead of actual color blending. |
| **Output: Full replace** | Uses the matched palette color as-is. |
| **Output: Preserve luma** | Uses the source pixel's lightness with the palette color's chroma/hue. |
| **Output: Preserve chroma** | Uses the palette color's lightness/hue with the source pixel's chroma. |
| **Output: Hue wash** | Keeps the source pixel's lightness and chroma, but pushes hue toward the matched palette color. |
| **Output: Shadow/highlight** | Replaces only pixels below **Shadow** or above **Highlight** cutoffs; middle tones stay source-colored. |
| **Wet/Dry Mix** | Blends the processed output back over the source image. `0` is dry/source; `1` is fully processed. |
| **Neutral is category** | Treats achromatic colors as their own match category instead of letting hue distance vanish near neutral. Useful when grays/blacks/whites should not freely match colored swatches. |
| **Monotone blend/dither** | For Blend and Dither, rejects blend/dither choices that would land farther from the source than the nearest palette choice. In plain terms: it stops fancy mixing from making a worse match than boring nearest. |
| **Max distance** | Enables a match-distance cutoff. Pixels whose nearest palette color is too far away are left as source color. |
| **Distance limit** | Sets the cutoff used by **Max distance**. Lower values reject more pixels; higher values allow rougher matches. |
| **Shadow** | In Shadow/highlight output mode, sets the low-light cutoff below which pixels are replaced by palette output. |
| **Highlight** | In Shadow/highlight output mode, sets the high-light cutoff above which pixels are replaced by palette output. |

## Perceptual weights panel

These weights shape the OKLab-like matching distance used by assignment.

| Control | What it does |
|---|---|
| **Luma** | Weight for lightness difference. Raise it when brightness matching matters more than hue or saturation. |
| **Chroma** | Weight for chroma/saturation difference. Raise it when vividness matching matters more. |
| **Hue** | Weight for hue difference. Raise it when red-to-blue mistakes should be punished harder. Lower it for looser tonal posterization. |

## Blending panel

Visible in **Assignment: Blend**.

| Control | What it does |
|---|---|
| **Width** | Number of nearest palette colors allowed to contribute, from 1 to 5. `1` behaves close to nearest assignment. |
| **Softness** | Controls falloff by distance. Higher values make the nearest color dominate faster; lower values let neighbors share more influence. |

## Dither panel

Visible in **Assignment: Dither**.

| Control | What it does |
|---|---|
| **Pattern: Ordered 2×2** | Uses a tiny Bayer-style threshold matrix for tight ordered dithering. |
| **Pattern: Ordered 4×4** | Uses a medium Bayer-style threshold matrix. This is the default ordered dither feel. |
| **Pattern: Ordered 8×8** | Uses a larger Bayer-style threshold matrix, making a coarser ordered texture. |
| **Pattern: Hash noise** | Uses randomized threshold noise per cell. Less regular, more grain. |
| **Pattern: Etched lines** | Uses line thresholds, controlled by Scale and Angle. |
| **Pattern: Screenprint dots** | Uses dot/halftone thresholds, controlled by Scale and Angle. |
| **Pattern: Crosshatch ink** | Uses crossed line thresholds. |
| **Pattern: Stipple grain** | Uses clustered grain-like thresholds. |
| **Pattern: Woven threads** | Uses interlaced thread-like thresholds. |
| **Pattern: Contour wash** | Uses contour-like tonal bands. |
| **Scale** | Enlarges or shrinks the dither pattern cells. Higher values make coarser texture. |
| **Angle** | Rotates angle-aware dither patterns such as lines, halftone dots, crosshatch, weave, and contour. |
| **Luma falloff** | Reduces second-color dithering in shadows/highlights when raised, keeping dithering more active in midtones. |

## Pixel art panel

| Control | What it does |
|---|---|
| **Pixel size** | Groups the source image into larger art-pixels before palette assignment. At `1`, pixels are processed normally. Above `1`, mapping and dither coordinates operate at block scale. |
| **Block sample: Center** | Samples the center pixel of each art-pixel block. Fast and crisp, but can miss small details. |
| **Block sample: Mean** | Averages the block before mapping. Smoother; better for reducing noisy source pixels. |
| **Block sample: Representative** | Chooses a representative color for the block rather than a straight center sample or mean. Useful when the mean muddies distinct colors. |
| **Despeckle** | Runs a 3×3 mode filter on the paletted output to remove isolated stray art-pixels. |
| **Despeckle passes** | Number of despeckle passes, from 1 to 4. More passes are stronger and can eat intentional detail. |
| **Dither protection** | Prevents despeckle and edge tighten from replacing pixels that look like intentional two-color dither. In Dither assignment mode it also uses the active dither pattern, scale, and angle as a phase hint; otherwise it falls back to small checker/stripe neighborhood evidence. |
| **Edge tighten** | Runs one conservative post-palette pass after despeckle. It repairs weak one-pixel gaps and chipped corners when neighboring art-pixels form a clearer edge. |
| **Tighten strength** | Edge-tighten strength, from 1 to 2. `1` only accepts strong opposite-pair evidence; `2` also accepts small corner-block repairs. |

## Cycle panel

Palette cycling remaps palette indexes after matching. It can animate water, lights, old-school palette tricks, or pure chaos. Sort order matters because cycle movement follows the displayed/sorted palette order.

| Control | What it does |
|---|---|
| **Offset** | Moves assigned palette indexes forward through the selected cycle region. In Manual tags mode, it cycles only the tagged swatches. |
| **Play preview** | Starts/stops animated preview playback by advancing Offset over time. |
| **Speed** | Controls cycle preview speed. It affects playback, not the static exported palette. |
| **Sort: Lightness** | Orders palette swatches from dark to light. |
| **Sort: Variant bands** | Groups tint/shade family variants into bands, useful for family-generated palettes. |
| **Sort: Hue families** | Orders by hue family, then lightness. |
| **Sort: OKLab walk** | Orders swatches by a path through OKLab space to keep adjacent colors perceptually neighboring. |
| **Region: Global** | Cycles the whole palette. |
| **Region: Thirds** | Cycles within low/mid/high palette thirds. |
| **Region: Middle band** | Cycles only the middle band. |
| **Region: High band** | Cycles only the high/light band. |
| **Region: Low band** | Cycles only the low/dark band. |
| **Region: Manual tags** | Cycles only swatches tagged in the palette bar. The **Clear cycle tags** button appears when tags exist. |

## Mask panel

The mask is session-only paint over the source image. It controls where a cycle rule applies or where selected colors are forbidden.

| Control | What it does |
|---|---|
| **Enable painted mask rule** | Turns the painted mask's rule on or off. Disabling keeps the painted mask state around but stops it affecting rendering. |
| **Behavior: Cycle only inside mask** | Palette cycling applies inside the painted mask. Outside the mask, cycle offset is muted back to zero. |
| **Behavior: Forbid selected colors inside mask** | Inside the painted mask, selected forbidden palette colors are removed from assignment candidates. Use the forbidden color chips that appear in this mode. |
| **Paint mask** | Enters paint mode. Drag on the preview to add to the mask. |
| **Erase** | Enters erase mode. Drag on the preview to remove from the mask. |
| **Clear** | Clears all painted mask pixels. |
| **Show mask overlay** | Shows or hides the visual overlay. Hiding it does not disable or clear the mask rule. |
| **Brush** | Sets mask brush size in source-image pixels. |
| **Forbidden colors** | In forbid mode, these palette chips toggle which colors are disallowed inside the painted mask. |

## Recipes panel

Recipes store settings, not source images.

| Control | What it does |
|---|---|
| **Saved recipe** | Selects a saved recipe from browser local storage. |
| **Name** | Names the recipe to save or update. |
| **Save / update** | Saves the current settings as a recipe, or updates the matching saved recipe. |
| **Load** | Applies the selected saved recipe to the current session. |
| **Delete** | Removes the selected saved recipe from local storage. |
| **Export current** | Downloads the current settings as a recipe JSON file. |
| **Export saved** | Downloads the selected saved recipe JSON. |
| **Export all** | Downloads all saved recipes as one JSON bundle. |
| **Import JSON** | Imports a recipe JSON file or recipe bundle. |

## Animation export panel

Animation export renders repeated frames while advancing cycle offset. It is mainly for palette-cycling looks.

| Control | What it does |
|---|---|
| **Frames** | Number of frames to export, 1 to 1000. |
| **FPS** | Playback rate stored in animation metadata / GIF export, 1 to 60 frames per second. |
| **Step / frame** | How much cycle offset advances between exported frames. Larger steps skip faster through the cycle. |
| **Prefix** | Filename prefix for exported frame files. |
| **Loop span** | Shows the calculated cycle length for the current palette/cycle settings. |
| **Use loop span** | Sets Frames to the calculated loop span so the cycle returns cleanly to its starting state. |
| **PNG ZIP** | Exports a ZIP of PNG frames plus a manifest. |
| **GIF** | Exports an animated GIF using the current frame settings. |

## Inspector

| Control | What it does |
|---|---|
| **Pixel tab** | Click the preview to inspect a pixel. Shows source, assignment, and processed colors for the clicked location. |
| **Build tab** | Explains generated image palette selection: sampled candidates, selection forces, spacing pressure, tonal targets, and why picks won. Appears for image-generated palettes. |
| **Diagnostics tab** | Shows palette coverage, collision warnings, contribution bars, and diagnostic overlays. |
| **X-Ray tab** | Shows the palette in OKLCh hue/lightness space. Manual swatches can be edited here; see `docs/x-ray-editing.md`. |
| **Histogram tab** | Shows sampled source/output histograms for tonal comparison. |
| **Clear** | Clears the currently inspected pixel. Shortcut: `Esc`. |
| **Expand** | Toggles the inspector size. |
| **×** | Closes the inspector. |
| **Copy source** | Copies the inspected source pixel color. Enabled after a pixel is selected. |
| **Copy fx** | Copies the inspected final/effect pixel color. Enabled after a pixel is selected. |
| **Add source** | Adds the inspected source pixel to the manual palette. Enabled after a pixel is selected. |
| **Loupe: Expand/Restore** | Expands the floating loupe patch from 15×15 to 31×31 pixels, then restores it back to 15×15. |
| **Loupe: Src/Final** | Switches the floating loupe patch between source pixels and final blended output pixels. |
| **Loupe: +** | Adds the current loupe sample's source color to the manual palette. This always uses the source color, regardless of the Src/Final patch view. |
| **Loupe: Δ** | Toggles the loupe patch into a source-to-final difference heatmap. The numeric source-to-fx delta readout stays visible. |
| **Diagnostics overlay: Off** | Clears the diagnostic overlay. |
| **Diagnostics overlay: Difference heatmap** | Shows a heatmap of how far processed output moved from the source. Contribution swatches can also enable per-swatch overlays. |

## Manual swatch editor

Click a manual palette swatch in the palette bar to open the inline editor.

| Control | What it does |
|---|---|
| **Source color picker / source hex** | Edits the swatch's source color. The effective color may differ after generated assist or palette adjustments. |
| **Copy hex / Copy effective** | Copies the source color, or the effective adjusted color when the palette has active adjustments/assist. |
| **Duplicate** | Duplicates the current swatch, including match-anchor state where applicable. |
| **Remove** | Removes the swatch. At least one manual swatch remains. |
| **Close** | Closes the editor. |
| **Also catch pixels like** | Enables an extra match anchor. Pixels near that anchor color route to this swatch, while the swatch still also catches its current color. |
| **Catch color picker / catch hex** | Edits the extra match-anchor color. |
| **Also catch original source** | Adds the swatch's original source color as an extra match anchor. Useful before recoloring a swatch. |
| **Recolor source pixels** | Adds the source color as an anchor, then opens color editing so source-matched pixels keep routing to the edited swatch. |
| **Make anchor source** | Promotes the current extra anchor into the swatch source color and clears the anchor. |
| **Pick from source image** | Lets you click the preview to add that source-image pixel color as an extra match anchor. |

## Paste palette dialog

| Control | What it does |
|---|---|
| **Palette text input** | Accepts pasted text and extracts colors in order. Supported forms include hex, `rgb()`, `rgba()`, `hsl()`, and `hsla()`. |
| **Cancel** | Closes without importing. |
| **Use colors** | Replaces/imports manual swatches from the extracted colors. |
