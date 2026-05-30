/**
 * Shared TypeScript declaration types for the big state objects that move through Palette Synth.
 *
 * These are documentation-first contracts. They intentionally do not add runtime
 * code; they exist so editors and humans can stop guessing what the crucial bags contain.
 */

export type HexColor = `#${string}`;
export type Lab = [number, number, number]; // OKLab scaled as [L*100, a*100, b*100].
export type ScaledHue = [number, number]; // Unit-ish hue vector used by weighted distance calculations.
export type Lch = [number, number, number]; // OKLCH scaled as [L, C, h radians].
export type Vec2 = [number, number];

type LooseString<T extends string> = T | (string & {});

/**
 * Integer image-space rectangle. Used by palette-region snapshots and sample regions.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Integer image-space point.
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Viewport rectangle in canvas backing-pixel coordinates.
 */
export interface ViewportRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Canvas/ImageData-like source that may lazily materialize pixel bytes and cache expensive samples.
 */
export interface LazyImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  canvas?: HTMLCanvasElement | null;
  ctx?: CanvasRenderingContext2D | null;
  version?: number | string;
  materialized?: boolean;
  sampleCacheSize?: number;
  getFullImageData?: () => ImageData;
  getCachedSample?: <T = unknown>(key: string, producer: () => T) => T;
  clearSampleCache?: () => void;
}

export type ImageDataSource = ImageData | LazyImageData;

/**
 * A persisted/manual editable swatch. `lab` is optional and only valid when it
 * round-trips to `hex`; otherwise `hex` is the source of truth.
 */
export interface ManualSwatch {
  id: string;
  hex: HexColor;
  aliasHex: HexColor | null; // Extra matching color; does not change visible swatch color.
  locked: boolean;
  muted: boolean;
  lab?: Lab;
  colorSpace?: "oklab-scaled";
}

/**
 * Locked seed for generated image palettes.
 */
export interface GeneratedLock {
  id: string;
  hex: HexColor;
  lab: Lab;
  colorSpace: "oklab-scaled";
}

export type PaletteMode = "generated" | "generatedReference" | "manual" | "preset" | "harmony" | "cosine";
export type AssignMode = "nearest" | "blend" | "dither";
export type OutputMode = "fullReplace" | "preserveLuma" | "preserveChroma" | "hueWash" | "shadowHighlight";
export type SortMode = LooseString<"lightness" | "hue" | "variantBands" | "hueFamilies">;
export type PaletteVariant = LooseString<"base" | "tint" | "shade" | "single" | "variant">;
export type PaletteSource = LooseString<"generated" | "reference" | "manual" | "preset" | "harmony" | "cosine" | "fallback">;

/**
 * Persisted app configuration. It is snapshot-safe JSON: no functions, no DOM,
 * no GL handles. Controllers mutate this directly, then push dirty flags to RuntimeState.
 */
export interface AppConfig {
  paletteMode: PaletteMode;
  presetName: string;
  manualPalette: ManualSwatch[];
  manualMatchAliases: HexColor[]; // Legacy aliases; normalized into manualPalette[].aliasHex.
  paletteRegionRect: Rect | null;
  showPaletteRegion: boolean;
  paletteSwatchScale: 1 | 2 | 3 | number;
  paletteSize: number;
  seedSwatch: HexColor;
  harmonyRelationship: string;
  harmonyRegionContrast: string;
  harmonyRampSteepness: number;
  cosinePreset: string;
  cosineCustomVectors: {
    a: number[];
    b: number[];
    c: number[];
    d: number[];
  };
  deltaL: number;
  paletteGamma: number;
  gammaC: number;
  paletteHue: number;
  aliasAllSources: boolean;
  cycleOffset: number;
  softness: number;
  blendK: number;
  lumaWeight: number;
  chromaWeight: number;
  hueWeight: number;
  neutralIsCategory: boolean;
  monotoneBlendDither: boolean;
  maxDistanceEnabled: boolean;
  maxDistance: number;
  selectionMidtoneWeight: number;
  selectionOutlierWeight: number;
  selectionChromaWeight: number;
  tonalZoneWeight: number;
  widthBonus: number;
  hueSpread: number;
  minDistance: number;
  assignMode: AssignMode;
  outputMode: OutputMode;
  shadowCutoff: number;
  highlightCutoff: number;
  blendAmount: number;
  showPalette: LooseString<"none" | "input" | "output">;
  sortMode: SortMode;
  blockSize: number;
  seed: number;
  samplingMode: LooseString<"stratified" | "random">;
  CYCLE_MODE: number;
  cycleManualKeys: string[];
  cyclePreviewSpeed: number;
  ditherPattern: string;
  ditherAngle: number;
  ditherLumaAmount: number;
  ditherScale: number;
  generatedAssist: number;
  generatedTintShadeFamilies: boolean;
  cosineCustomTintShadeFamilies: boolean;
  levelsExposure: number;
  levelsGamma: number;
  levelsShoulder: number;
  levelsCenter: number;
  levelsCurveAmount: number;
  clarityAmount: number;
  generatedLocks: GeneratedLock[];
  pixelPerfect: boolean;
  dynamicSkin: boolean;
  pixelArtEnabled: boolean;
  pixelBlockSize: number;
  pixelBlockSampleMode: LooseString<"center" | "average" | "dominant">;
  despeckleEnabled: boolean;
  despeckleStrength: number;
  ditherProtectionEnabled: boolean;
  edgeTightenEnabled: boolean;
  edgeTightenStrength: number;
  compareEnabled: boolean;
  compareSplit: number;
}

/**
 * The app's main swatch object. Similar-looking color fields are not aliases.
 *
 * `lab` is the feature/matcher coordinate. `hex` is the visible sRGB chip.
 * Provenance and adjustment fields explain where the color came from; they are
 * not generic display colors.
 */
export interface PaletteRecord {
  id: string; // Stable-ish record key for lists, diagnostics, cycle tags.
  lab: Lab; // Feature/matcher Lab used by distance, sorting, and palette assignment.
  hex: HexColor; // Visible swatch color painted in UI.
  lightness: number; // Cached feature L.
  chroma: number; // Cached feature chroma.
  scaledHue: ScaledHue; // Cached feature hue vector.
  source: PaletteSource;
  familyId: string | null;
  familyIndex: number | null;
  variant: PaletteVariant;
  variantIndex: number;
  sourceIndex: number | null;
  swatchId: string | null; // Manual swatch id when source === "manual".
  seedLab: Lab | null; // Original seed used to build a family.
  sourceLab: Lab | null; // Source/provenance coordinate, often before manual edits.
  locked: boolean;
  lockId: string | null;
  muted: boolean;
  role: string; // Human-facing/debug role label.
  cycleKey: string; // Key used by palette cycling/tagging.
  displayIndex: number | null; // Index in visible palette order.
  adjustedLab?: Lab; // Palette-adjusted coordinate.
  unadjustedLab?: Lab | null; // Coordinate before palette adjustment.
}

/**
 * Render/diagnostic palette entry. This is the loudest footgun in the app:
 * matching, rendering, and visible-swatch credit are deliberately split.
 */
export interface PaletteUniformEntry {
  featureLab: Lab; // Coordinate source pixels compare against.
  renderLab: Lab; // Coordinate the shader/CPU output estimator blends toward.
  featureHex?: HexColor;
  renderHex?: HexColor;
  featureLightness?: number;
  featureChroma?: number;
  featureHue?: ScaledHue;
  sourceRecord: PaletteRecord; // Visible swatch that receives diagnostics credit.
  alias: boolean; // True when this is an extra matching coordinate for sourceRecord.
}

/**
 * Packed palette data consumed by WebGL uniforms and source-index diagnostics.
 */
export interface PalettePreprocessResult {
  paletteBlock: Float32Array; // Render Lab packed as vec4 slots.
  paletteFeatures: Float32Array; // Feature lightness/chroma/hue packed as vec4 slots.
  paletteBaseBlock?: Float32Array; // Base/original Lab packed as vec4 slots for diagnostics overlays.
  paletteSourceIndices?: Int32Array; // Maps uniform-entry index back to visible palette displayIndex.
}

/**
 * Settings extracted from AppConfig for palette shader assignment.
 */
export interface RenderSettings {
  blendK: number;
  softness: number;
  lumaWeight: number;
  chromaWeight: number;
  hueWeight: number;
  maxDistanceEnabled: boolean;
  maxDistance: number;
  blendAmount: number;
  shadowCutoff: number;
  highlightCutoff: number;
  ditherScale: number;
  ditherAngle: number;
  ditherLumaAmount: number;
  pixelArtEnabled: boolean;
  pixelBlockSize: number;
  pixelBlockSampleMode: string;
}

/**
 * Settings extracted from AppConfig for source-resolution post-processing.
 */
export interface PostProcessSettings {
  despeckleEnabled: boolean;
  despeckleStrength: number;
  edgeTightenEnabled: boolean;
  edgeTightenStrength: number;
  ditherProtectionEnabled: boolean;
  ditherKnown: boolean;
  ditherPattern: number;
  ditherScale: number;
  ditherAngle: number;
}

/**
 * Options passed into the palette shader pass.
 */
export interface PaletteRenderPassOptions {
  texture: WebGLTexture;
  viewport: ViewportRect;
  resolution: Vec2;
  viewportOrigin: Vec2;
  viewCenter: Vec2;
  viewSpan: Vec2;
  sourceImageSize?: Vec2;
  maskTexture?: WebGLTexture | null;
  maskEnabled?: boolean;
  maskBehavior?: number;
  maskForbiddenSourceFlags?: number;
  paletteBlock?: Float32Array;
  paletteFeatures?: Float32Array;
  paletteBaseBlock?: Float32Array;
  paletteSourceIndices?: Int32Array;
  paletteSize?: number;
  visiblePaletteSize?: number;
  cycleOffset?: number;
  manualCycleEnabled?: boolean;
  diagnosticOverlayMode?: string;
  diagnosticOverlaySwatch?: number;
  diagnosticOverlayHistogramScope?: string;
  diagnosticOverlayHistogramChannel?: string;
  diagnosticOverlayHistogramMin?: number;
  diagnosticOverlayHistogramMax?: number;
  compareEnabled?: boolean;
  compareSplit?: number;
  settings?: RenderSettings;
}

/**
 * Weighted distance breakdown shared by palette diagnostics and pixel inspector.
 */
export interface DistanceBreakdown {
  luma: number;
  chroma: number;
  hue: number;
  hueSuppressed: boolean;
  total: number;
  raw: {
    dL: number;
    dC: number;
    hueBias: number;
    hueSuppressed: boolean;
  };
}

/**
 * A report row for a source pixel's relationship to a PaletteUniformEntry.
 * It is not itself a swatch.
 */
export interface PaletteMatch {
  entryIndex: number;
  displayIndex: number;
  record: PaletteRecord | null;
  alias: boolean;
  featureLab: Lab; // Why the pixel matched.
  renderLab: Lab; // What the output estimator blends toward.
  hex: HexColor; // Render hex.
  featureHex: HexColor; // Feature hex.
  distance: number;
  parts: DistanceBreakdown;
}

/**
 * Pixel-inspector analysis result for one image-space point.
 */
export interface PixelInspection {
  x: number; // Sampled image x.
  y: number; // Sampled image y.
  sourceHex: HexColor;
  sourceLab: Lab;
  matches: PaletteMatch[];
  weights: number[]; // Assignment weights parallel to matches.
  mappedLab: Lab; // Palette-assignment result before output mode/blend amount.
  outputLab: Lab; // Output-mode result before blend amount.
  fxHex: HexColor;
  finalHex: HexColor;
  finalLab: Lab;
  fxDelta: DistanceBreakdown;
  blendDelta: DistanceBreakdown;
  finalDelta: DistanceBreakdown; // Backward-compatible alias of blendDelta.
  outputDelta: DistanceBreakdown; // Backward-compatible alias of blendDelta.
  assigned: PaletteMatch | null;
}

/**
 * Per-swatch usage row in image diagnostics.
 */
export interface DiagnosticUsageRow {
  index: number;
  record: PaletteRecord;
  hex: HexColor;
  contribution: number;
  aliasContribution: number;
  percent: number;
  aliasPercent: number;
  territoryCount: number;
  aliasTerritoryCount: number;
  territoryPercent: number;
  aliasTerritoryPercent: number;
  load: "underused" | "balanced" | "overused";
}

export interface PaletteDiagnosticsSample {
  sampleCount: number;
  step: number;
  meanDistance: number;
  meanLuma: number;
  meanChroma: number;
  meanHue: number;
  p95Distance: number;
  coverageEntropy: number;
  ambiguousCount: number;
  ambiguousPercent: number;
  baseline: number;
  underusedThreshold: number;
  overusedThreshold: number;
  worst: Record<string, unknown> | null;
  usage: DiagnosticUsageRow[];
}

export interface PaletteCollisionSummary {
  threshold: number;
  closest: {
    i: number;
    j: number;
    distance: number;
    a: PaletteRecord;
    b: PaletteRecord;
  } | null;
  closeCount: number;
}

/**
 * Top-level palette diagnostics sample, excluding histogram tabs.
 */
export interface PaletteDiagnostics {
  signature: string;
  records: PaletteRecord[];
  entries: PaletteUniformEntry[];
  sample: PaletteDiagnosticsSample;
  collisions: PaletteCollisionSummary;
  generatedAt: number;
}

export interface HistogramDiagnosticsPayload {
  kind: string;
  scope: "source" | "output";
  channel: "luma" | "chroma" | "hue";
  label: string;
  axisLabel: string;
  bins: number[];
  segments: Record<string, number[]>;
  segmentNames: string[];
  binCount: number;
  max: number;
  total: number;
  step: number;
  domain: {
    min: number;
    max: number;
  };
  overflowCount: number;
  omittedLowChromaCount: number;
  omittedNeutralCount?: number;
  hueOmittedReason?: string;
  lowChromaThreshold: number | undefined;
  stats: Record<string, unknown>;
}

/**
 * Histogram diagnostics consumed by the histogram UI.
 */
export interface HistogramDiagnostics {
  signature: string;
  generatedAt: number;
  records: PaletteRecord[];
  histogram: HistogramDiagnosticsPayload;
}

/**
 * Score components recorded during generated palette selection.
 */
export interface SelectionScoreParts {
  total: number;
  chromaRaw: number;
  chromaContribution: number;
  outlierRaw: number;
  outlierContribution: number;
  outlierDistance: number;
  midtoneRaw: number;
  midtoneContribution: number;
  chroma: number;
  L: number;
  band?: string;
  bandNeed?: number;
  crowding?: number;
  rangeExpansion?: number;
  novelty?: number;
  hueSpread?: number;
  hueNearestDistanceDegrees?: number;
  hueCandidateChroma?: number;
  hueReliability?: number;
  hueAnchorReliability?: number;
  hueAnchorCount?: number;
  hueReliableAnchorCount?: number;
  tonalNeedContribution?: number;
  crowdingPenalty?: number;
  rangeExpansionContribution?: number;
  noveltyContribution?: number;
  hueSpreadContribution?: number;
  noiseContribution?: number;
}

/**
 * Condensed candidate row shown in selection diagnostics.
 */
export interface SelectionCandidateSummary {
  index: number;
  rank: number | null;
  hex: HexColor;
  familyHexes: HexColor[];
  band: LooseString<"shadow" | "midtone" | "highlight">;
  candidateAppealScore: number;
  marginalScore: number;
  nearestFamilyDistance?: number;
  hueNearestDistanceDegrees?: number;
  hueSpread?: number;
  blockedBySpacing: boolean;
  belowSpacingTarget: boolean;
  spacingRelaxed: boolean;
  reason: string;
  lab?: Lab;
  parts?: SelectionScoreParts;
  badges?: string[];
}

/**
 * One round of generated-palette seed selection.
 */
export interface PaletteSelectionRound {
  slot: number;
  fallbackFill?: boolean;
  bandCountsBefore?: number[];
  desiredBandCounts?: number[];
  selectedFamilyHexes?: HexColor[][];
  lightnessRangeBefore?: {
    min: number;
    max: number;
  } | null;
  spacing?: Record<string, unknown>;
  crowding?: Record<string, unknown>;
  hue?: Record<string, unknown>;
  lottery?: Record<string, unknown>;
  picked: SelectionCandidateSummary;
  nearMisses: SelectionCandidateSummary[];
  blockedNearMisses: SelectionCandidateSummary[];
}

/**
 * Explanation tree for generated palette selection.
 */
export interface PaletteSelectionTrace {
  type: "settings";
  mode?: PaletteMode;
  sourceLabel?: string;
  baseCount: number;
  spacingMode: "family" | "color";
  familySpacing: number | null;
  colorSpacing: number | null;
  candidateCount: number;
  centerLab: Lab;
  centerHex: HexColor;
  candidateAppealWeights: {
    midtone?: number;
    outlier?: number;
    chroma?: number;
  };
  expansion: {
    deltaL: number;
    chromaExp: number;
  } | null;
  tonalTargets: Array<{
    band: string;
    count: number;
  }>;
  tonalTargetMode: "direct-colors" | "family-seeds";
  tonalTargetBoost: number;
  constants: Record<string, unknown>;
  rounds: PaletteSelectionRound[];
  requestedSize?: number;
  selectionCount?: number;
  tintShadeFamilies?: boolean;
  finalPaletteSize?: number;
  sample?: {
    count: number;
    blockSize: number;
    samplingMode: string;
    region: Rect | null;
  };
}

/**
 * Mask painting/assignment state. The canvas is a binary-ish mask texture source.
 */
export interface MaskState {
  enabled: boolean;
  behavior: LooseString<"cycleWithin" | "forbid">;
  forbiddenSourceIndices: number[];
  paintMode: LooseString<"off" | "paint" | "erase">;
  showOverlay: boolean;
  dragging: boolean;
  pointerId: number | null;
  lastPoint: Point | null;
  captureTarget: EventTarget | null;
  brushSize: number;
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  texture: WebGLTexture | null;
  gl?: WebGL2RenderingContext | null;
  textureDirty: boolean;
  hasPaint: boolean;
}

/**
 * Drag state for selecting a generated-palette source region.
 */
export interface PaletteRegionState {
  enabled: boolean;
  dragging: boolean;
  pointerId: number | null;
  start: Point | null;
  draftRect: Rect | null;
}

/**
 * Current manual-swatch editor focus.
 */
export interface ManualEditorState {
  sourceIndex: number | null;
  swatchId: string | null;
  colorInputActive: boolean;
}

/**
 * Live cycle-preview animation state.
 */
export interface CycleAnimationState {
  playing: boolean;
  lastTick: number;
  frameHandle: number | null;
}

/**
 * Diagnostics pane state and cached analysis.
 */
export interface DiagnosticsState {
  signature: string;
  stats: PaletteDiagnostics | null;
  histogramSignature: string;
  histogramSignatures: Record<string, string>;
  histogramStats: Record<string, HistogramDiagnostics>;
  histogramBinCount: number;
  panelTab: LooseString<"contribution" | "histogram">;
  histogramTab: LooseString<"luma" | "chroma" | "hue">;
  pixel: PixelInspection | null;
  pixelLoupe?: PixelInspection | null;
  pixelLoupeProbe?: Point | null;
  pixelLoupeOpen?: boolean;
  pixelLoupeFrozen?: boolean;
  pixelLoupePinMode?: boolean;
  pixelLoupePinned?: boolean;
  pixelLoupeView?: LooseString<"source" | "final">;
  pixelLoupeDiff?: boolean; // True when the loupe patch renders source-to-final difference heatmap mode.
  pixelLoupeExpanded?: boolean; // True when the loupe patch uses the expanded 31×31 pixel neighborhood.
  overlay: {
    mode: string;
    swatchIndex: number | null;
    histogramScope?: "source" | "output";
    histogramChannel?: "luma" | "chroma" | "hue" | "neutral";
    histogramBinIndex?: number;
    histogramBinCount?: number;
    histogramDomainMax?: number;
    histogramStart?: number;
    histogramEnd?: number;
    histogramMin?: number;
    histogramMax?: number;
  };
  inspectorOpen?: boolean;
  inspectorTab?: LooseString<"pixel" | "selection" | "diagnostics" | "xray" | "histogram">;
  pixelProbe?: Point | null;
}

/**
 * Undo/redo state for AppConfig snapshots.
 */
export interface HistoryState {
  undo: AppConfig[];
  redo: AppConfig[];
  pending: AppConfig | null;
  applying: boolean;
  limit: number;
}

/**
 * Saved recipe/preset structures are intentionally loose JSON at this layer.
 */
export interface Recipe {
  id: string;
  name: string;
  config?: AppConfig;
  updatedAt?: number | string;
}

/**
 * Manual palette preset saved to local storage.
 */
export interface ManualPreset {
  id: string;
  name: string;
  colors: HexColor[];
  updatedAt?: number | string;
}

/**
 * Animation-export UI state.
 */
export interface AnimationExportState {
  frameCount: number | null;
  fps: number;
  step: number;
  prefix: string;
  exporting: boolean;
}

/**
 * Pan/zoom state for the preview canvas.
 */
export interface ViewState {
  zoom: number;
  centerX: number;
  centerY: number;
  dragging: boolean;
  pointerId: number | null;
  lastClientX: number;
  lastClientY: number;
  clickStartX: number;
  clickStartY: number;
  movedForClick: boolean;
}


export interface ProceduralHarmonyTraceRow {
  id: string;
  familyId: string;
  familyIndex: number;
  groupIndex?: number;
  variant: PaletteVariant;
  variantIndex: number;
  role: string;
  bandCount: number;
  baseOffsetDegrees: number;
  ring: number;
  lightnessDirection: number;
  nominalVariantL: number;
  centeredVariantL: number;
  lightnessOffset: number;
  offsetScale: number;
  seedL: number;
  seedC: number;
  seedHueDegrees: number;
  unjitteredSeedC: number;
  seedHex: HexColor;
  seedLab: Lab;
  outputHex: HexColor;
  outputLab: Lab;
  displayIndex: number | null;
  jitter: {
    hueDegrees: number;
    chromaScale: number;
    chromaDelta: number;
  };
  region: {
    key: string;
    label: string;
    hueOffsetDegrees: number;
    chromaScale: number;
    chromaBias: number;
  };
}

export interface ProceduralHarmonyTrace {
  type: "procedural-harmony";
  mode: "harmony";
  sourceLabel: string;
  requestedSize: number;
  finalPaletteSize: number;
  seedHex: HexColor;
  seedLab: Lab;
  seedLch: {L: number; C: number; hDegrees: number};
  usableChroma: number;
  deltaL: number;
  sortMode: string;
  relationship: {key: string; label: string; offsets: number[]; spread: number};
  regionContrast: {
    key: string;
    label: string;
    offsets: Record<string, number>;
    chromaScale: Record<string, number>;
    chromaBias: Record<string, number>;
  };
  rampSteepness: number;
  bandCounts: Record<string, number>;
  activeFamilyCount?: number;
  relationshipFamilyCount?: number;
  slotOrder?: string;
  jitterLimits: {hueDegrees: number; chromaRatio: number; chromaDelta: number};
  rows: ProceduralHarmonyTraceRow[];
}

export interface ProceduralCosineTraceFamily {
  familyIndex: number;
  familyId: string;
  t: number;
  seedPhase: number;
  raw: {L: number; C: number; hue: number};
  L: number;
  C: number;
  hueDegrees: number;
  seedHex: HexColor;
  seedLab: Lab;
  familyHexes: HexColor[];
  displayIndexes: number[];
  records: Array<{
    id: string;
    variant: PaletteVariant;
    variantIndex: number;
    hex: HexColor;
    lab: Lab;
    displayIndex: number | null;
  }>;
}

export interface ProceduralCosineTrace {
  type: "procedural-cosine";
  mode: "cosine";
  sourceLabel: string;
  requestedSize: number;
  finalPaletteSize: number;
  familyCount: number;
  tintShadeFamilies: boolean;
  deltaL: number;
  sortMode: string;
  preset: {key: string; label: string; a: number[]; b: number[]; c: number[]; d: number[]};
  seed: number;
  seedPhase: number;
  seedPeriod: number;
  chromaMax: number;
  families: ProceduralCosineTraceFamily[];
  curveSamples: Array<{t: number; L: number; C: number; hueDegrees: number}>;
}

export type PaletteBuildTrace = PaletteSelectionTrace | ProceduralHarmonyTrace | ProceduralCosineTrace;

export interface RuntimeLevelsState {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext | null;
  program: WebGLProgram | null;
  texture: WebGLTexture | null;
}

export interface RuntimeBlockSampleState {
  texture: WebGLTexture | null;
  framebuffer: WebGLFramebuffer | null;
  program: WebGLProgram | null;
  programKey: string;
  width: number;
  height: number;
  blockSize: number;
  sampleMode: string;
  dirty: boolean;
  sourceTexture?: WebGLTexture | null;
}

/**
 * The mutable runtime bag. Unlike AppConfig, this contains DOM, canvas, GL,
 * cache, and dirty-flag state. It must not be persisted as a recipe/config snapshot.
 */
export interface RuntimeState {
  gl: WebGL2RenderingContext | null;
  program: WebGLProgram | null;
  programKey: string;
  texture: WebGLTexture | null;
  textureVersion: number;
  paletteVersion: number;
  originalCanvas: HTMLCanvasElement;
  originalCtx: CanvasRenderingContext2D | null;
  originalSourceVersion: number;
  previewSourceCanvas: HTMLCanvasElement | null;
  previewSourceVersion: number;
  previewLevelsDirty: boolean;
  sourceCanvas: HTMLCanvasElement;
  sourceCtx: CanvasRenderingContext2D | null;
  imageData: ImageDataSource | null;
  sourceLevelsDirty: boolean;
  referenceOriginalCanvas: HTMLCanvasElement;
  referenceOriginalCtx: CanvasRenderingContext2D | null;
  referenceOriginalSourceVersion: number;
  referenceCanvas: HTMLCanvasElement;
  referenceCtx: CanvasRenderingContext2D | null;
  referenceImageData: ImageDataSource | null;
  referenceImageName: string;
  referenceLevelsDirty: boolean;
  levels: RuntimeLevelsState;
  blockSample: RuntimeBlockSampleState;
  paletteRegion: PaletteRegionState;
  mask: MaskState;
  paletteRecords: PaletteRecord[];
  palette: Lab[];
  paletteBlock: Float32Array | null;
  paletteBaseBlock: Float32Array | null;
  paletteFeatures: Float32Array | null;
  paletteSourceIndices: Int32Array | null;
  paletteEntryCount: number;
  textureDirty: boolean;
  paletteDirty: boolean;
  swatchesDirty: boolean;
  manualEditor: ManualEditorState;
  cycleAnimation: CycleAnimationState;
  diagnostics: DiagnosticsState;
  paletteSelectionTrace: PaletteBuildTrace | null;
  renderQueued: boolean;
  history: HistoryState;
  recipes: Recipe[];
  manualPresets: ManualPreset[];
  animationExport: AnimationExportState;
  maxImageSide: number;
  view: ViewState;
  postProcess?: Record<string, unknown>;
  postProcessFailureMessage?: string;
}

/**
 * App environment normalized by createAppCore().
 */
export interface AppEnvironment {
  document: Document;
  window: Window;
  Image: typeof Image;
  URL: typeof URL;
  requestAnimationFrame: typeof requestAnimationFrame;
  cancelAnimationFrame: typeof cancelAnimationFrame;
  requestFrame?: typeof requestAnimationFrame;
  cancelFrame?: typeof cancelAnimationFrame;
}

/**
 * Shader source bundle loaded before app composition.
 */
export interface ShaderSources {
  FRAGMENT_SHADER_BODY: string;
  VERTEX_SHADER: string;
  LEVELS_FRAGMENT_SHADER: string;
  CLARITY_LIGHTNESS_BLUR_FRAGMENT_SHADER: string;
  CLARITY_SHARP_FRAGMENT_SHADER: string;
  CLARITY_SHARP_BLUR_FRAGMENT_SHADER: string;
  CLARITY_FRAGMENT_SHADER: string;
  BLOCK_SAMPLE_FRAGMENT_SHADER: string;
  PALETTE_POST_FRAGMENT_SHADER: string;
  PALETTE_EDGE_TIGHTEN_FRAGMENT_SHADER: string;
  VIEW_COMPOSITE_FRAGMENT_SHADER: string;
}

/**
 * Sparse DOM cache keyed by UI element id. Values are null when the fixture/page lacks that id.
 */
export type UiElements = Record<string, HTMLElement | null>;

/**
 * Core app graph object returned by createAppCore().
 */
export interface AppCore {
  env: AppEnvironment;
  shaders: ShaderSources;
  state: RuntimeState;
  els: UiElements;
  config: AppConfig;
}

/**
 * Late-bound port used to break domain construction cycles.
 */
export interface DeferredPort<T extends Record<string, unknown> = Record<string, unknown>> {
  attach(next: T): T;
  get(): T | null;
  call(methodName: string, ...args: unknown[]): unknown;
  optionalCall(methodName: string, ...args: unknown[]): unknown;
}

/**
 * The most frequently passed subset of app ports: render invalidation/draw actions.
 */
export interface RenderActions {
  markTextureDirty(): void;
  markPaletteDirty(options?: { swatches?: boolean }): void;
  markMaskDirty(): void;
  markLevelsDirty(): void;
  markEverythingDirty(): void;
  ensureTexture(): void;
  ensurePalette(options?: { captureTrace?: boolean }): void;
  ensureLevelAdjustedPreviewSource(): HTMLCanvasElement | null;
  ensureLevelAdjustedSources(): ImageDataSource | null;
  currentRenderSettings(): RenderSettings;
  renderPaletteProgram(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    options: PaletteRenderPassOptions,
  ): void;
  draw(): void;
  queueRender(): void;
}

/**
 * Public surface of createAppPorts(). It contains raw deferred ports plus
 * action bags that domains consume instead of reaching into each other directly.
 */
export interface AppPorts {
  animationExport: DeferredPort;
  conditionalPanels: DeferredPort;
  config: DeferredPort;
  cyclePreview: DeferredPort;
  diagnostics: DeferredPort;
  mask: DeferredPort;
  paletteRegion: DeferredPort;
  renderedCanvas: DeferredPort;
  renderSession: DeferredPort;
  reset: DeferredPort;
  animationExportActions: Record<string, unknown>;
  conditionalPanelsActions: Record<string, unknown>;
  configActions: Record<string, unknown>;
  cyclePreviewActions: Record<string, unknown>;
  diagnosticsActions: Record<string, unknown>;
  maskActions: Record<string, unknown>;
  paletteRegionActions: Record<string, unknown>;
  renderedCanvasActions: Record<string, unknown>;
  render: RenderActions;
  resetActions: Record<string, unknown>;
}