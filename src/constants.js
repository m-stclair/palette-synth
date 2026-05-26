export const MAX_PALETTE_SIZE = 64;
export const CANDIDATE_SAMPLE_COUNT = 750;
export const SHADOW_L_CUTOFF = 35;
export const HIGHLIGHT_L_CUTOFF = 65;
export const TONAL_NEED_BONUS = 0.22;
export const TONAL_CROWDING_PENALTY = 0.12;
export const RANGE_EXPANSION_BONUS = 0.18;
export const NOVELTY_BONUS = 0.16;
export const DEFAULT_HUE_SPREAD_BONUS = 0.12;
export const SELECTION_NOISE_AMOUNT = 0.08;
export const SELECTION_TIE_BREAK_MARGIN = 0.025;
export const TAU = Math.PI * 2;
export const NEUTRAL_CHROMA_EPSILON = 2.0;
export const OKLAB_SCALE = 100;
export const OKLAB_CHROMA_REF = 40;
export const OKLCH_PROCEDURAL_CHROMA_MAX = 42;
export const PALETTE_PRESETS = globalThis.PALETTE_PRESETS || {};

export const HARMONY_RELATIONSHIPS = {
    monochrome: {label: "Monochrome", offsets: [0], spread: 0},
    complementary: {label: "Complementary", offsets: [0, 180], spread: 10},
    splitComplement: {label: "Split complement", offsets: [0, 150, 210], spread: 8},
    triad: {label: "Triad", offsets: [0, 120, 240], spread: 8},
    tetrad: {label: "Tetrad rectangle", offsets: [0, 60, 180, 240], spread: 7},
    square: {label: "Square", offsets: [0, 90, 180, 270], spread: 7},
    analogous: {label: "Analogous", offsets: [-30, 0, 30], spread: 6},
    accentedAnalogous: {label: "Accented analogous", offsets: [-30, 0, 30, 180], spread: 6}
  };

export const HARMONY_REGION_CONTRASTS = {
    tonalRamp: {
      label: "Shared hue tint/shade",
      offsets: {shade: 0, base: 0, tint: 0},
      chromaScale: {shade: 1, base: 1, tint: 1},
      chromaBias: {shade: 0, base: 0, tint: 0}
    },
    coolShadowWarmHighlight: {
      label: "Cool shadows / warm highlights",
      offsets: {shade: 210, base: 0, tint: 35},
      chromaScale: {shade: 1.08, base: 1, tint: 0.9},
      chromaBias: {shade: 2, base: 0, tint: -1}
    },
    splitRegions: {
      label: "Split contrast regions",
      offsets: {shade: -150, base: 0, tint: 150},
      chromaScale: {shade: 1, base: 0.95, tint: 1},
      chromaBias: {shade: 1, base: 0, tint: 1}
    },
    triadicRegions: {
      label: "Triadic regions",
      offsets: {shade: -120, base: 0, tint: 120},
      chromaScale: {shade: 1, base: 0.92, tint: 1},
      chromaBias: {shade: 1, base: 0, tint: 1}
    },
    complementaryExtremes: {
      label: "Complementary extremes",
      offsets: {shade: 180, base: 0, tint: 180},
      chromaScale: {shade: 1.05, base: 0.9, tint: 0.95},
      chromaBias: {shade: 1, base: 0, tint: 0}
    }
  };

export const COSINE_PALETTE_PRESETS = {
    sinebow: {
      label: "Sinebow",
      a: [0.58, 0.62, 0.50],
      b: [0.22, 0.24, 0.50],
      c: [1.00, 1.00, 1.00],
      d: [0.00, 0.33, 0.67]
    },
    aurora: {
      label: "Aurora",
      a: [0.56, 0.55, 0.47],
      b: [0.20, 0.24, 0.32],
      c: [1.00, 0.80, 1.20],
      d: [0.05, 0.18, 0.58]
    },
    ember: {
      label: "Ember",
      a: [0.48, 0.48, 0.07],
      b: [0.24, 0.22, 0.08],
      c: [0.90, 1.20, 0.70],
      d: [0.06, 0.24, 0.02]
    },
    candy: {
      label: "Candy",
      a: [0.68, 0.58, 0.78],
      b: [0.18, 0.30, 0.26],
      c: [1.15, 1.05, 0.85],
      d: [0.12, 0.38, 0.10]
    },
    mineral: {
      label: "Mineral",
      a: [0.54, 0.36, 0.54],
      b: [0.18, 0.16, 0.20],
      c: [0.75, 1.40, 0.65],
      d: [0.22, 0.08, 0.48]
    }
  };

