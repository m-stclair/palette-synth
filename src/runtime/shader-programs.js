import { ASSIGN_MODE, DITHER_PATTERN, OUTPUT_MODE } from "../state/config.js";
import { buildCachedProgram } from "../gl/programs.js";

export const DIAGNOSTIC_OVERLAY_MODE = Object.freeze({
  none: 0,
  swatch: 1,
  difference: 2,
  histogram: 3
});

export const DIAGNOSTIC_HISTOGRAM_SCOPE = Object.freeze({
  source: 0,
  output: 1
});

export const DIAGNOSTIC_HISTOGRAM_CHANNEL = Object.freeze({
  luma: 0,
  chroma: 1,
  hue: 2,
  neutral: 3
});

function diagnosticCode(map, value, fallback) {
  return map[value] ?? fallback;
}

export function diagnosticShaderDefineLines({
  diagnosticOverlayMode = "none",
  diagnosticOverlayHistogramScope = "source",
  diagnosticOverlayHistogramChannel = "luma"
} = {}) {
  return [
    `#define DIAGNOSTIC_OVERLAY_MODE ${diagnosticCode(DIAGNOSTIC_OVERLAY_MODE, diagnosticOverlayMode, DIAGNOSTIC_OVERLAY_MODE.none)}`,
    `#define DIAGNOSTIC_HISTOGRAM_SCOPE ${diagnosticCode(DIAGNOSTIC_HISTOGRAM_SCOPE, diagnosticOverlayHistogramScope, DIAGNOSTIC_HISTOGRAM_SCOPE.source)}`,
    `#define DIAGNOSTIC_HISTOGRAM_CHANNEL ${diagnosticCode(DIAGNOSTIC_HISTOGRAM_CHANNEL, diagnosticOverlayHistogramChannel, DIAGNOSTIC_HISTOGRAM_CHANNEL.luma)}`
  ];
}

export function shaderDefineLinesForConfig(config, {
  showPalette = config?.showPalette,
  manualCycleModeEnabled = () => false,
  diagnosticOverlayMode = "none",
  diagnosticOverlayHistogramScope = "source",
  diagnosticOverlayHistogramChannel = "luma"
} = {}) {
  return [
    `#define ASSIGNMODE ${ASSIGN_MODE[config?.assignMode] ?? 1}`,
    `#define OUTPUT_MODE ${OUTPUT_MODE[config?.outputMode] ?? 0}`,
    `#define CYCLE_MODE ${manualCycleModeEnabled() ? 0 : (Number(config?.CYCLE_MODE) || 0)}`,
    `#define DITHER_PATTERN ${DITHER_PATTERN[config?.ditherPattern] ?? 1}`,
    `#define NEUTRAL_IS_CATEGORY ${config?.neutralIsCategory ? 1 : 0}`,
    `#define FIDELITY_GUARD ${config?.monotoneBlendDither && config?.assignMode !== "nearest" ? 1 : 0}`,
    ...diagnosticShaderDefineLines({
      diagnosticOverlayMode,
      diagnosticOverlayHistogramScope,
      diagnosticOverlayHistogramChannel
    })
  ];
}

export function createShaderProgramController({
  config,
  state,
  vertexSource = "",
  fragmentSource = "",
  manualCycleModeEnabled = () => false,
  buildCachedProgramFn = buildCachedProgram
} = {}) {
  if (!config || !state) {
    throw new TypeError("createShaderProgramController requires config and state dependencies");
  }

  function shaderDefineLines(overrides = {}) {
    const showPalette = Object.prototype.hasOwnProperty.call(overrides, "showPalette")
      ? overrides.showPalette
      : config.showPalette;
    return shaderDefineLinesForConfig(config, {
      showPalette,
      manualCycleModeEnabled,
      diagnosticOverlayMode: overrides.diagnosticOverlayMode,
      diagnosticOverlayHistogramScope: overrides.diagnosticOverlayHistogramScope,
      diagnosticOverlayHistogramChannel: overrides.diagnosticOverlayHistogramChannel
    });
  }

  function buildProgramForContext(gl, cache, overrides = {}) {
    return buildCachedProgramFn(gl, cache, {
      vertexSource,
      fragmentSource,
      defineLines: shaderDefineLines(overrides),
      linkErrorMessage: "unknown program link error"
    });
  }

  function buildProgram(overrides = {}) {
    return buildProgramForContext(state.gl, state, overrides);
  }

  return {
    buildProgramForContext,
    buildProgram
  };
}
