/**
 * Shared JSDoc types for the big state objects that move through Palette Synth.
 *
 * These are documentation-first contracts. They intentionally do not add a
 * TypeScript build step or runtime code; they exist so editors and humans can
 * stop guessing what the crucial bags contain.
 */

/** @typedef {`#${string}`} HexColor */
/** @typedef {[number, number, number]} Lab OKLab scaled as [L*100, a*100, b*100]. */
/** @typedef {[number, number]} ScaledHue Unit-ish hue vector used by weighted distance calculations. */
/** @typedef {[number, number, number]} Lch OKLCH scaled as [L, C, h radians]. */
/** @typedef {[number, number]} Vec2 */

/**
 * Integer image-space rectangle. Used by palette-region snapshots and sample regions.
 * @typedef {Object} Rect
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * Integer image-space point.
 * @typedef {Object} Point
 * @property {number} x
 * @property {number} y
 */

/**
 * Viewport rectangle in canvas backing-pixel coordinates.
 * @typedef {Object} ViewportRect
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 */

/**
 * Canvas/ImageData-like source that may lazily materialize pixel bytes and cache expensive samples.
 * @typedef {Object} LazyImageData
 * @property {number} width
 * @property {number} height
 * @property {Uint8ClampedArray} data
 * @property {HTMLCanvasElement|null} [canvas]
 * @property {CanvasRenderingContext2D|null} [ctx]
 * @property {number|string} [version]
 * @property {boolean} [materialized]
 * @property {number} [sampleCacheSize]
 * @property {() => ImageData} [getFullImageData]
 * @property {(key: string, producer: () => any) => any} [getCachedSample]
 * @property {() => void} [clearSampleCache]
 */

/** @typedef {ImageData|LazyImageData} ImageDataSource */

/**
 * A persisted/manual editable swatch. `lab` is optional and only valid when it
 * round-trips to `hex`; otherwise `hex` is the source of truth.
 * @typedef {Object} ManualSwatch
 * @property {string} id
 * @property {HexColor} hex
 * @property {HexColor|null} aliasHex Extra matching color; does not change visible swatch color.
 * @property {boolean} locked
 * @property {boolean} muted
 * @property {Lab} [lab]
 * @property {"oklab-scaled"} [colorSpace]
 */

/**
 * Locked seed for generated image palettes.
 * @typedef {Object} GeneratedLock
 * @property {string} id
 * @property {HexColor} hex
 * @property {Lab} lab
 * @property {"oklab-scaled"} colorSpace
 */

/** @typedef {"generated"|"generatedReference"|"manual"|"preset"|"harmony"|"cosine"} PaletteMode */
/** @typedef {"nearest"|"blend"|"dither"} AssignMode */
/** @typedef {"fullReplace"|"preserveLuma"|"preserveChroma"|"hueWash"|"shadowHighlight"} OutputMode */
/** @typedef {"lightness"|"hue"|"variantBands"|"hueFamilies"|string} SortMode */
/** @typedef {"base"|"tint"|"shade"|"single"|"variant"|string} PaletteVariant */
/** @typedef {"generated"|"reference"|"manual"|"preset"|"harmony"|"cosine"|"fallback"|string} PaletteSource */

/**
 * Persisted app configuration. It is snapshot-safe JSON: no functions, no DOM,
 * no GL handles. Controllers mutate this directly, then push dirty flags to RuntimeState.
 * @typedef {Object} AppConfig
 * @property {PaletteMode} paletteMode
 * @property {string} presetName
 * @property {ManualSwatch[]} manualPalette
 * @property {HexColor[]} manualMatchAliases Legacy aliases; normalized into manualPalette[].aliasHex.
 * @property {Rect|null} paletteRegionRect
 * @property {boolean} showPaletteRegion
 * @property {1|2|3|number} paletteSwatchScale
 * @property {number} paletteSize
 * @property {HexColor} seedSwatch
 * @property {string} harmonyRelationship
 * @property {string} harmonyRegionContrast
 * @property {number} harmonyRampSteepness
 * @property {string} cosinePreset
 * @property {{a: number[], b: number[], c: number[], d: number[]}} cosineCustomVectors
 * @property {number} deltaL
 * @property {number} paletteGamma
 * @property {number} gammaC
 * @property {number} paletteHue
 * @property {boolean} aliasAllSources
 * @property {number} cycleOffset
 * @property {number} softness
 * @property {number} blendK
 * @property {number} lumaWeight
 * @property {number} chromaWeight
 * @property {number} hueWeight
 * @property {boolean} monotoneBlendDither
 * @property {boolean} maxDistanceEnabled
 * @property {number} maxDistance
 * @property {[number, number, number]} selectWeights
 * @property {number} hueSpread
 * @property {number} minDistance
 * @property {AssignMode} assignMode
 * @property {OutputMode} outputMode
 * @property {number} shadowCutoff
 * @property {number} highlightCutoff
 * @property {number} blendAmount
 * @property {"none"|"input"|"output"|string} showPalette
 * @property {SortMode} sortMode
 * @property {number} blockSize
 * @property {number} seed
 * @property {"stratified"|"random"|string} samplingMode
 * @property {number} CYCLE_MODE
 * @property {string[]} cycleManualKeys
 * @property {number} cyclePreviewSpeed
 * @property {string} ditherPattern
 * @property {number} ditherAngle
 * @property {number} ditherLumaAmount
 * @property {number} ditherScale
 * @property {number} generatedAssist
 * @property {boolean} generatedTintShadeFamilies
 * @property {number} levelsExposure
 * @property {number} levelsGamma
 * @property {number} levelsShoulder
 * @property {number} levelsCenter
 * @property {number} levelsCurveAmount
 * @property {number} clarityAmount
 * @property {GeneratedLock[]} generatedLocks
 * @property {boolean} pixelPerfect
 * @property {boolean} dynamicSkin
 * @property {number} pixelBlockSize
 * @property {"center"|"average"|"dominant"|string} pixelBlockSampleMode
 * @property {boolean} despeckleEnabled
 * @property {number} despeckleStrength
 * @property {boolean} compareEnabled
 * @property {number} compareSplit
 */

/**
 * The app's main swatch object. Similar-looking color fields are not aliases.
 *
 * `lab` is the feature/matcher coordinate. `hex` is the visible sRGB chip.
 * Provenance and adjustment fields explain where the color came from; they are
 * not generic display colors.
 * @typedef {Object} PaletteRecord
 * @property {string} id Stable-ish record key for lists, diagnostics, cycle tags.
 * @property {Lab} lab Feature/matcher Lab used by distance, sorting, and palette assignment.
 * @property {HexColor} hex Visible swatch color painted in UI.
 * @property {number} lightness Cached feature L.
 * @property {number} chroma Cached feature chroma.
 * @property {ScaledHue} scaledHue Cached feature hue vector.
 * @property {PaletteSource} source
 * @property {string|null} familyId
 * @property {number|null} familyIndex
 * @property {PaletteVariant} variant
 * @property {number} variantIndex
 * @property {number|null} sourceIndex
 * @property {string|null} swatchId Manual swatch id when source === "manual".
 * @property {Lab|null} seedLab Original seed used to build a family.
 * @property {Lab|null} sourceLab Source/provenance coordinate, often before manual edits.
 * @property {boolean} locked
 * @property {string|null} lockId
 * @property {boolean} muted
 * @property {string} role Human-facing/debug role label.
 * @property {string} cycleKey Key used by palette cycling/tagging.
 * @property {number|null} displayIndex Index in visible palette order.
 * @property {Lab} [adjustedLab] Palette-adjusted coordinate.
 * @property {Lab|null} [unadjustedLab] Coordinate before palette adjustment.
 */

/**
 * Render/diagnostic palette entry. This is the loudest footgun in the app:
 * matching, rendering, and visible-swatch credit are deliberately split.
 * @typedef {Object} PaletteUniformEntry
 * @property {Lab} featureLab Coordinate source pixels compare against.
 * @property {Lab} renderLab Coordinate the shader/CPU output estimator blends toward.
 * @property {HexColor} [featureHex]
 * @property {HexColor} [renderHex]
 * @property {number} [featureLightness]
 * @property {number} [featureChroma]
 * @property {ScaledHue} [featureHue]
 * @property {PaletteRecord} sourceRecord Visible swatch that receives diagnostics credit.
 * @property {boolean} alias True when this is an extra matching coordinate for sourceRecord.
 */

/**
 * Packed palette data consumed by WebGL uniforms and source-index diagnostics.
 * @typedef {Object} PalettePreprocessResult
 * @property {Float32Array} paletteBlock Render Lab packed as vec4 slots.
 * @property {Float32Array} paletteFeatures Feature lightness/chroma/hue packed as vec4 slots.
 * @property {Float32Array} [paletteBaseBlock] Base/original Lab packed as vec4 slots for diagnostics overlays.
 * @property {Int32Array} [paletteSourceIndices] Maps uniform-entry index back to visible palette displayIndex.
 */

/**
 * Settings extracted from AppConfig for palette shader assignment.
 * @typedef {Object} RenderSettings
 * @property {number} blendK
 * @property {number} softness
 * @property {number} lumaWeight
 * @property {number} chromaWeight
 * @property {number} hueWeight
 * @property {boolean} maxDistanceEnabled
 * @property {number} maxDistance
 * @property {number} blendAmount
 * @property {number} shadowCutoff
 * @property {number} highlightCutoff
 * @property {number} ditherScale
 * @property {number} ditherAngle
 * @property {number} ditherLumaAmount
 * @property {number} pixelBlockSize
 * @property {string} pixelBlockSampleMode
 */

/**
 * Settings extracted from AppConfig for source-resolution post-processing.
 * @typedef {Object} PostProcessSettings
 * @property {boolean} despeckleEnabled
 * @property {number} despeckleStrength
 */

/**
 * Options passed into the palette shader pass.
 * @typedef {Object} PaletteRenderPassOptions
 * @property {WebGLTexture} texture
 * @property {{x: number, y: number, w: number, h: number}} viewport
 * @property {Vec2} resolution
 * @property {Vec2} viewportOrigin
 * @property {Vec2} viewCenter
 * @property {Vec2} viewSpan
 * @property {Vec2} [sourceImageSize]
 * @property {WebGLTexture|null} [maskTexture]
 * @property {boolean} [maskEnabled]
 * @property {number} [maskBehavior]
 * @property {number} [maskForbiddenSourceFlags]
 * @property {Float32Array} [paletteBlock]
 * @property {Float32Array} [paletteFeatures]
 * @property {Float32Array} [paletteBaseBlock]
 * @property {Int32Array} [paletteSourceIndices]
 * @property {number} [paletteSize]
 * @property {number} [visiblePaletteSize]
 * @property {number} [cycleOffset]
 * @property {boolean} [manualCycleEnabled]
 * @property {string} [diagnosticOverlayMode]
 * @property {number} [diagnosticOverlaySwatch]
 * @property {boolean} [compareEnabled]
 * @property {number} [compareSplit]
 * @property {RenderSettings} [settings]
 */

/**
 * Weighted distance breakdown shared by palette diagnostics and pixel inspector.
 * @typedef {Object} DistanceBreakdown
 * @property {number} luma
 * @property {number} chroma
 * @property {number} hue
 * @property {boolean} hueSuppressed
 * @property {number} total
 * @property {{dL: number, dC: number, hueBias: number, hueSuppressed: boolean}} raw
 */

/**
 * A report row for a source pixel's relationship to a PaletteUniformEntry.
 * It is not itself a swatch.
 * @typedef {Object} PaletteMatch
 * @property {number} entryIndex
 * @property {number} displayIndex
 * @property {PaletteRecord|null} record
 * @property {boolean} alias
 * @property {Lab} featureLab Why the pixel matched.
 * @property {Lab} renderLab What the output estimator blends toward.
 * @property {HexColor} hex Render hex.
 * @property {HexColor} featureHex Feature hex.
 * @property {number} distance
 * @property {DistanceBreakdown} parts
 */

/**
 * Pixel-inspector analysis result for one image-space point.
 * @typedef {Object} PixelInspection
 * @property {number} x Sampled image x.
 * @property {number} y Sampled image y.
 * @property {HexColor} sourceHex
 * @property {Lab} sourceLab
 * @property {PaletteMatch[]} matches
 * @property {number[]} weights Assignment weights parallel to matches.
 * @property {Lab} mappedLab Palette-assignment result before output mode/blend amount.
 * @property {Lab} outputLab Output-mode result before blend amount.
 * @property {HexColor} fxHex
 * @property {HexColor} finalHex
 * @property {Lab} finalLab
 * @property {DistanceBreakdown} fxDelta
 * @property {DistanceBreakdown} blendDelta
 * @property {DistanceBreakdown} finalDelta Backward-compatible alias of blendDelta.
 * @property {DistanceBreakdown} outputDelta Backward-compatible alias of blendDelta.
 * @property {PaletteMatch|null} assigned
 */

/**
 * Per-swatch usage row in image diagnostics.
 * @typedef {Object} DiagnosticUsageRow
 * @property {number} index
 * @property {PaletteRecord} record
 * @property {HexColor} hex
 * @property {number} contribution
 * @property {number} aliasContribution
 * @property {number} percent
 * @property {number} aliasPercent
 * @property {number} territoryCount
 * @property {number} aliasTerritoryCount
 * @property {number} territoryPercent
 * @property {number} aliasTerritoryPercent
 * @property {"underused"|"balanced"|"overused"} load
 */

/**
 * Top-level palette diagnostics sample, excluding histogram tabs.
 * @typedef {Object} PaletteDiagnostics
 * @property {string} signature
 * @property {PaletteRecord[]} records
 * @property {PaletteUniformEntry[]} entries
 * @property {Object} sample
 * @property {number} sample.sampleCount
 * @property {number} sample.step
 * @property {number} sample.meanDistance
 * @property {number} sample.meanLuma
 * @property {number} sample.meanChroma
 * @property {number} sample.meanHue
 * @property {number} sample.p95Distance
 * @property {number} sample.coverageEntropy
 * @property {number} sample.ambiguousCount
 * @property {number} sample.ambiguousPercent
 * @property {number} sample.baseline
 * @property {number} sample.underusedThreshold
 * @property {number} sample.overusedThreshold
 * @property {Object|null} sample.worst
 * @property {DiagnosticUsageRow[]} sample.usage
 * @property {{threshold: number, closest: ({i: number, j: number, distance: number, a: PaletteRecord, b: PaletteRecord}|null), closeCount: number}} collisions
 * @property {number} generatedAt
 */

/**
 * Histogram diagnostics consumed by the histogram UI.
 * @typedef {Object} HistogramDiagnostics
 * @property {string} signature
 * @property {number} generatedAt
 * @property {PaletteRecord[]} records
 * @property {Object} histogram
 * @property {string} histogram.kind
 * @property {"source"|"output"} histogram.scope
 * @property {"luma"|"chroma"|"hue"} histogram.channel
 * @property {string} histogram.label
 * @property {string} histogram.axisLabel
 * @property {number[]} histogram.bins
 * @property {Object.<string, number[]>} histogram.segments
 * @property {string[]} histogram.segmentNames
 * @property {number} histogram.binCount
 * @property {number} histogram.max
 * @property {number} histogram.total
 * @property {number} histogram.step
 * @property {{min: number, max: number}} histogram.domain
 * @property {number} histogram.overflowCount
 * @property {number} histogram.omittedLowChromaCount
 * @property {number|undefined} histogram.lowChromaThreshold
 * @property {Object} histogram.stats
 */

/**
 * Score components recorded during generated palette selection.
 * @typedef {Object} SelectionScoreParts
 * @property {number} total
 * @property {number} chromaRaw
 * @property {number} chromaContribution
 * @property {number} outlierRaw
 * @property {number} outlierContribution
 * @property {number} outlierDistance
 * @property {number} midtoneRaw
 * @property {number} midtoneContribution
 * @property {number} chroma
 * @property {number} L
 * @property {string} [band]
 * @property {number} [bandNeed]
 * @property {number} [crowding]
 * @property {number} [rangeExpansion]
 * @property {number} [novelty]
 * @property {number} [hueSpread]
 * @property {number} [hueNearestDistanceDegrees]
 * @property {number} [hueCandidateChroma]
 * @property {number} [hueReliability]
 * @property {number} [hueAnchorReliability]
 * @property {number} [hueAnchorCount]
 * @property {number} [hueReliableAnchorCount]
 * @property {number} [tonalNeedContribution]
 * @property {number} [crowdingPenalty]
 * @property {number} [rangeExpansionContribution]
 * @property {number} [noveltyContribution]
 * @property {number} [hueSpreadContribution]
 * @property {number} [noiseContribution]
 */

/**
 * Condensed candidate row shown in selection diagnostics.
 * @typedef {Object} SelectionCandidateSummary
 * @property {number} index
 * @property {number|null} rank
 * @property {HexColor} hex
 * @property {HexColor[]} familyHexes
 * @property {"shadow"|"midtone"|"highlight"|string} band
 * @property {number} baseScore
 * @property {number} marginalScore
 * @property {number} [nearestFamilyDistance]
 * @property {number} [hueNearestDistanceDegrees]
 * @property {number} [hueSpread]
 * @property {boolean} blockedBySpacing
 * @property {boolean} belowSpacingTarget
 * @property {boolean} spacingRelaxed
 * @property {string} reason
 * @property {Lab} [lab]
 * @property {SelectionScoreParts} [parts]
 * @property {string[]} [badges]
 */

/**
 * One round of generated-palette seed selection.
 * @typedef {Object} PaletteSelectionRound
 * @property {number} slot
 * @property {boolean} [fallbackFill]
 * @property {number[]} [bandCountsBefore]
 * @property {number[]} [desiredBandCounts]
 * @property {HexColor[][]} [selectedFamilyHexes]
 * @property {{min: number, max: number}|null} [lightnessRangeBefore]
 * @property {Object} [spacing]
 * @property {Object} [crowding]
 * @property {Object} [hue]
 * @property {Object} [lottery]
 * @property {SelectionCandidateSummary} picked
 * @property {SelectionCandidateSummary[]} nearMisses
 * @property {SelectionCandidateSummary[]} blockedNearMisses
 */

/**
 * Explanation tree for generated palette selection.
 * @typedef {Object} PaletteSelectionTrace
 * @property {"settings"} type
 * @property {PaletteMode} [mode]
 * @property {string} [sourceLabel]
 * @property {number} baseCount
 * @property {"family"|"color"} spacingMode
 * @property {number|null} familySpacing
 * @property {number|null} colorSpacing
 * @property {number} candidateCount
 * @property {Lab} centerLab
 * @property {HexColor} centerHex
 * @property {{midtone?: number, outlier?: number, chroma?: number}} weights
 * @property {{deltaL: number, chromaExp: number}|null} expansion
 * @property {{band: string, count: number}[]} tonalTargets
 * @property {"direct-colors"|"family-seeds"} tonalTargetMode
 * @property {number} tonalTargetBoost
 * @property {Object} constants
 * @property {PaletteSelectionRound[]} rounds
 * @property {number} [requestedSize]
 * @property {number} [selectionCount]
 * @property {boolean} [tintShadeFamilies]
 * @property {number} [finalPaletteSize]
 * @property {{count: number, blockSize: number, samplingMode: string, region: Rect|null}} [sample]
 */

/**
 * Mask painting/assignment state. The canvas is a binary-ish mask texture source.
 * @typedef {Object} MaskState
 * @property {boolean} enabled
 * @property {"cycleWithin"|"forbid"|string} behavior
 * @property {number[]} forbiddenSourceIndices
 * @property {"off"|"paint"|"erase"|string} paintMode
 * @property {boolean} showOverlay
 * @property {boolean} dragging
 * @property {number|null} pointerId
 * @property {Point|null} lastPoint
 * @property {EventTarget|null} captureTarget
 * @property {number} brushSize
 * @property {HTMLCanvasElement|null} canvas
 * @property {CanvasRenderingContext2D|null} ctx
 * @property {WebGLTexture|null} texture
 * @property {WebGL2RenderingContext|null} [gl]
 * @property {boolean} textureDirty
 * @property {boolean} hasPaint
 */

/**
 * Drag state for selecting a generated-palette source region.
 * @typedef {Object} PaletteRegionState
 * @property {boolean} enabled
 * @property {boolean} dragging
 * @property {number|null} pointerId
 * @property {Point|null} start
 * @property {Rect|null} draftRect
 */

/**
 * Current manual-swatch editor focus.
 * @typedef {Object} ManualEditorState
 * @property {number|null} sourceIndex
 * @property {string|null} swatchId
 * @property {boolean} colorInputActive
 */

/**
 * Live cycle-preview animation state.
 * @typedef {Object} CycleAnimationState
 * @property {boolean} playing
 * @property {number} lastTick
 * @property {number|null} frameHandle
 */

/**
 * Diagnostics pane state and cached analysis.
 * @typedef {Object} DiagnosticsState
 * @property {string} signature
 * @property {PaletteDiagnostics|null} stats
 * @property {string} histogramSignature
 * @property {Object.<string, string>} histogramSignatures
 * @property {Object.<string, HistogramDiagnostics>} histogramStats
 * @property {"contribution"|"histogram"|string} panelTab
 * @property {"luma"|"chroma"|"hue"|string} histogramTab
 * @property {PixelInspection|null} pixel
 * @property {{mode: string, swatchIndex: number|null}} overlay
 * @property {boolean} [inspectorOpen]
 * @property {"pixel"|"selection"|"diagnostics"|"xray"|"histogram"|string} [inspectorTab]
 * @property {Point|null} [pixelProbe]
 */

/**
 * Undo/redo state for AppConfig snapshots.
 * @typedef {Object} HistoryState
 * @property {AppConfig[]} undo
 * @property {AppConfig[]} redo
 * @property {AppConfig|null} pending
 * @property {boolean} applying
 * @property {number} limit
 */

/**
 * Saved recipe/preset structures are intentionally loose JSON at this layer.
 * @typedef {Object} Recipe
 * @property {string} id
 * @property {string} name
 * @property {AppConfig} [config]
 * @property {number|string} [updatedAt]
 */

/**
 * Manual palette preset saved to local storage.
 * @typedef {Object} ManualPreset
 * @property {string} id
 * @property {string} name
 * @property {HexColor[]} colors
 * @property {number|string} [updatedAt]
 */

/**
 * Animation-export UI state.
 * @typedef {Object} AnimationExportState
 * @property {number|null} frameCount
 * @property {number} fps
 * @property {number} step
 * @property {string} prefix
 * @property {boolean} exporting
 */

/**
 * Pan/zoom state for the preview canvas.
 * @typedef {Object} ViewState
 * @property {number} zoom
 * @property {number} centerX
 * @property {number} centerY
 * @property {boolean} dragging
 * @property {number|null} pointerId
 * @property {number} lastClientX
 * @property {number} lastClientY
 * @property {number} clickStartX
 * @property {number} clickStartY
 * @property {boolean} movedForClick
 */

/**
 * The mutable runtime bag. Unlike AppConfig, this contains DOM, canvas, GL,
 * cache, and dirty-flag state. It must not be persisted as a recipe/config snapshot.
 * @typedef {Object} RuntimeState
 * @property {WebGL2RenderingContext|null} gl
 * @property {WebGLProgram|null} program
 * @property {string} programKey
 * @property {WebGLTexture|null} texture
 * @property {number} textureVersion
 * @property {number} paletteVersion
 * @property {HTMLCanvasElement} originalCanvas
 * @property {CanvasRenderingContext2D|null} originalCtx
 * @property {number} originalSourceVersion
 * @property {HTMLCanvasElement} sourceCanvas
 * @property {CanvasRenderingContext2D|null} sourceCtx
 * @property {ImageDataSource|null} imageData
 * @property {boolean} sourceLevelsDirty
 * @property {HTMLCanvasElement} referenceOriginalCanvas
 * @property {CanvasRenderingContext2D|null} referenceOriginalCtx
 * @property {number} referenceOriginalSourceVersion
 * @property {HTMLCanvasElement} referenceCanvas
 * @property {CanvasRenderingContext2D|null} referenceCtx
 * @property {ImageDataSource|null} referenceImageData
 * @property {string} referenceImageName
 * @property {boolean} referenceLevelsDirty
 * @property {{canvas: HTMLCanvasElement, gl: WebGL2RenderingContext|null, program: WebGLProgram|null, texture: WebGLTexture|null}} levels
 * @property {{texture: WebGLTexture|null, framebuffer: WebGLFramebuffer|null, program: WebGLProgram|null, programKey: string, width: number, height: number, blockSize: number, sampleMode: string, dirty: boolean, sourceTexture?: WebGLTexture|null}} blockSample
 * @property {PaletteRegionState} paletteRegion
 * @property {MaskState} mask
 * @property {PaletteRecord[]} paletteRecords
 * @property {Lab[]} palette
 * @property {Float32Array|null} paletteBlock
 * @property {Float32Array|null} paletteBaseBlock
 * @property {Float32Array|null} paletteFeatures
 * @property {Int32Array|null} paletteSourceIndices
 * @property {number} paletteEntryCount
 * @property {boolean} textureDirty
 * @property {boolean} paletteDirty
 * @property {boolean} swatchesDirty
 * @property {ManualEditorState} manualEditor
 * @property {CycleAnimationState} cycleAnimation
 * @property {DiagnosticsState} diagnostics
 * @property {PaletteSelectionTrace|null} paletteSelectionTrace
 * @property {boolean} renderQueued
 * @property {HistoryState} history
 * @property {Recipe[]} recipes
 * @property {ManualPreset[]} manualPresets
 * @property {AnimationExportState} animationExport
 * @property {number} maxImageSide
 * @property {ViewState} view
 * @property {Object} [postProcess]
 * @property {string} [postProcessFailureMessage]
 */

/**
 * App environment normalized by createAppCore().
 * @typedef {Object} AppEnvironment
 * @property {Document} document
 * @property {Window} window
 * @property {typeof Image} Image
 * @property {typeof URL} URL
 * @property {typeof requestAnimationFrame} requestAnimationFrame
 * @property {typeof cancelAnimationFrame} cancelAnimationFrame
 * @property {typeof requestAnimationFrame|undefined} requestFrame
 * @property {typeof cancelAnimationFrame|undefined} cancelFrame
 */

/**
 * Shader source bundle loaded before app composition.
 * @typedef {Object} ShaderSources
 * @property {string} FRAGMENT_SHADER_BODY
 * @property {string} VERTEX_SHADER
 * @property {string} LEVELS_FRAGMENT_SHADER
 * @property {string} CLARITY_LIGHTNESS_BLUR_FRAGMENT_SHADER
 * @property {string} CLARITY_SHARP_FRAGMENT_SHADER
 * @property {string} CLARITY_SHARP_BLUR_FRAGMENT_SHADER
 * @property {string} CLARITY_FRAGMENT_SHADER
 * @property {string} BLOCK_SAMPLE_FRAGMENT_SHADER
 * @property {string} PALETTE_POST_FRAGMENT_SHADER
 * @property {string} VIEW_COMPOSITE_FRAGMENT_SHADER
 */

/**
 * Sparse DOM cache keyed by UI element id. Values are null when the fixture/page lacks that id.
 * @typedef {Object.<string, HTMLElement|null>} UiElements
 */

/**
 * Core app graph object returned by createAppCore().
 * @typedef {Object} AppCore
 * @property {AppEnvironment} env
 * @property {ShaderSources} shaders
 * @property {RuntimeState} state
 * @property {UiElements} els
 * @property {AppConfig} config
 */

/**
 * Late-bound port used to break domain construction cycles.
 * @typedef {Object} DeferredPort
 * @property {(next: Object) => Object} attach
 * @property {() => Object|null} get
 * @property {(methodName: string, ...args: any[]) => any} call
 * @property {(methodName: string, ...args: any[]) => any} optionalCall
 */

/**
 * The most frequently passed subset of app ports: render invalidation/draw actions.
 * @typedef {Object} RenderActions
 * @property {() => void} markTextureDirty
 * @property {(options?: {swatches?: boolean}) => void} markPaletteDirty
 * @property {() => void} markMaskDirty
 * @property {() => void} markLevelsDirty
 * @property {() => void} markEverythingDirty
 * @property {() => void} ensureTexture
 * @property {(options?: {captureTrace?: boolean}) => void} ensurePalette
 * @property {() => RenderSettings} currentRenderSettings
 * @property {(gl: WebGL2RenderingContext, program: WebGLProgram, options: PaletteRenderPassOptions) => void} renderPaletteProgram
 * @property {() => void} draw
 * @property {() => void} queueRender
 */

/**
 * Public surface of createAppPorts(). It contains raw deferred ports plus
 * action bags that domains consume instead of reaching into each other directly.
 * @typedef {Object} AppPorts
 * @property {DeferredPort} animationExport
 * @property {DeferredPort} conditionalPanels
 * @property {DeferredPort} config
 * @property {DeferredPort} cyclePreview
 * @property {DeferredPort} diagnostics
 * @property {DeferredPort} mask
 * @property {DeferredPort} paletteRegion
 * @property {DeferredPort} renderedCanvas
 * @property {DeferredPort} renderSession
 * @property {DeferredPort} reset
 * @property {Object} animationExportActions
 * @property {Object} conditionalPanelsActions
 * @property {Object} configActions
 * @property {Object} cyclePreviewActions
 * @property {Object} diagnosticsActions
 * @property {Object} maskActions
 * @property {Object} paletteRegionActions
 * @property {Object} renderedCanvasActions
 * @property {RenderActions} render
 * @property {Object} resetActions
 */

export {};
