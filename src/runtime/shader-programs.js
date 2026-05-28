import { ASSIGN_MODE, DITHER_PATTERN, OUTPUT_MODE } from "../state/config.js";
import { buildCachedProgram } from "../gl/programs.js";

export function shaderDefineLinesForConfig(config, {
  showPalette = config?.showPalette,
  manualCycleModeEnabled = () => false
} = {}) {
  return [
    `#define ASSIGNMODE ${ASSIGN_MODE[config?.assignMode] ?? 1}`,
    `#define OUTPUT_MODE ${OUTPUT_MODE[config?.outputMode] ?? 0}`,
    `#define CYCLE_MODE ${manualCycleModeEnabled() ? 0 : (Number(config?.CYCLE_MODE) || 0)}`,
    `#define DITHER_PATTERN ${DITHER_PATTERN[config?.ditherPattern] ?? 1}`,
    `#define NEUTRAL_IS_CATEGORY ${config?.neutralIsCategory ? 1 : 0}`,
    `#define FIDELITY_GUARD ${config?.monotoneBlendDither && config?.assignMode !== "nearest" ? 1 : 0}`
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
    return shaderDefineLinesForConfig(config, {showPalette, manualCycleModeEnabled});
  }

  function buildProgramForContext(gl, cache, overrides = {}) {
    return buildCachedProgramFn(gl, cache, {
      vertexSource,
      fragmentSource,
      defineLines: shaderDefineLines(overrides),
      linkErrorMessage: "unknown program link error"
    });
  }

  function buildProgram() {
    return buildProgramForContext(state.gl, state);
  }

  return {
    buildProgramForContext,
    buildProgram
  };
}
