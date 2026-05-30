import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createShaderProgramController,
  diagnosticShaderDefineLines,
  shaderDefineLinesForConfig
} from "../src/runtime/shader-programs.js";

test("shaderDefineLinesForConfig maps runtime config to shader defines", () => {
  const config = {
    assignMode: "nearest",
    outputMode: "hueWash",
    showPalette: "strip",
    CYCLE_MODE: 3,
    ditherPattern: "ordered8"
  };

  assert.deepEqual(shaderDefineLinesForConfig(config), [
    "#define ASSIGNMODE 0",
    "#define OUTPUT_MODE 3",
    "#define CYCLE_MODE 3",
    "#define DITHER_PATTERN 2",
    "#define NEUTRAL_IS_CATEGORY 0",
    "#define FIDELITY_GUARD 0",
    "#define DIAGNOSTIC_OVERLAY_MODE 0",
    "#define DIAGNOSTIC_HISTOGRAM_SCOPE 0",
    "#define DIAGNOSTIC_HISTOGRAM_CHANNEL 0"
  ]);

  assert.deepEqual(shaderDefineLinesForConfig(config, {
    showPalette: "none",
    manualCycleModeEnabled: () => true
  }), [
    "#define ASSIGNMODE 0",
    "#define OUTPUT_MODE 3",
    "#define CYCLE_MODE 0",
    "#define DITHER_PATTERN 2",
    "#define NEUTRAL_IS_CATEGORY 0",
    "#define FIDELITY_GUARD 0",
    "#define DIAGNOSTIC_OVERLAY_MODE 0",
    "#define DIAGNOSTIC_HISTOGRAM_SCOPE 0",
    "#define DIAGNOSTIC_HISTOGRAM_CHANNEL 0"
  ]);
});

test("diagnosticShaderDefineLines maps overlay state to compile-time defines", () => {
  assert.deepEqual(diagnosticShaderDefineLines({
    diagnosticOverlayMode: "histogram",
    diagnosticOverlayHistogramScope: "output",
    diagnosticOverlayHistogramChannel: "hue"
  }), [
    "#define DIAGNOSTIC_OVERLAY_MODE 3",
    "#define DIAGNOSTIC_HISTOGRAM_SCOPE 1",
    "#define DIAGNOSTIC_HISTOGRAM_CHANNEL 2"
  ]);

  assert.deepEqual(diagnosticShaderDefineLines({
    diagnosticOverlayMode: "histogram",
    diagnosticOverlayHistogramScope: "source",
    diagnosticOverlayHistogramChannel: "neutral"
  }), [
    "#define DIAGNOSTIC_OVERLAY_MODE 3",
    "#define DIAGNOSTIC_HISTOGRAM_SCOPE 0",
    "#define DIAGNOSTIC_HISTOGRAM_CHANNEL 3"
  ]);

  assert.deepEqual(diagnosticShaderDefineLines({
    diagnosticOverlayMode: "unknown",
    diagnosticOverlayHistogramScope: "unknown",
    diagnosticOverlayHistogramChannel: "unknown"
  }), [
    "#define DIAGNOSTIC_OVERLAY_MODE 0",
    "#define DIAGNOSTIC_HISTOGRAM_SCOPE 0",
    "#define DIAGNOSTIC_HISTOGRAM_CHANNEL 0"
  ]);
});

test("shaderDefineLinesForConfig maps monotone blend/dither to a compile-time guard", () => {
  assert.ok(shaderDefineLinesForConfig({
    assignMode: "blend",
    outputMode: "fullReplace",
    CYCLE_MODE: 0,
    ditherPattern: "ordered4",
    monotoneBlendDither: true
  }).includes("#define FIDELITY_GUARD 1"));

  assert.ok(shaderDefineLinesForConfig({
    assignMode: "nearest",
    outputMode: "fullReplace",
    CYCLE_MODE: 0,
    ditherPattern: "ordered4",
    monotoneBlendDither: true
  }).includes("#define FIDELITY_GUARD 0"));
});

test("shaderDefineLinesForConfig maps artsier dither patterns", () => {
  assert.deepEqual(shaderDefineLinesForConfig({
    assignMode: "dither",
    outputMode: "fullReplace",
    CYCLE_MODE: 0,
    ditherPattern: "crosshatch"
  }), [
    "#define ASSIGNMODE 2",
    "#define OUTPUT_MODE 0",
    "#define CYCLE_MODE 0",
    "#define DITHER_PATTERN 6",
    "#define NEUTRAL_IS_CATEGORY 0",
    "#define FIDELITY_GUARD 0",
    "#define DIAGNOSTIC_OVERLAY_MODE 0",
    "#define DIAGNOSTIC_HISTOGRAM_SCOPE 0",
    "#define DIAGNOSTIC_HISTOGRAM_CHANNEL 0"
  ]);

  assert.deepEqual(shaderDefineLinesForConfig({
    assignMode: "dither",
    outputMode: "fullReplace",
    CYCLE_MODE: 0,
    ditherPattern: "contour"
  }), [
    "#define ASSIGNMODE 2",
    "#define OUTPUT_MODE 0",
    "#define CYCLE_MODE 0",
    "#define DITHER_PATTERN 9",
    "#define NEUTRAL_IS_CATEGORY 0",
    "#define FIDELITY_GUARD 0",
    "#define DIAGNOSTIC_OVERLAY_MODE 0",
    "#define DIAGNOSTIC_HISTOGRAM_SCOPE 0",
    "#define DIAGNOSTIC_HISTOGRAM_CHANNEL 0"
  ]);
});

test("shader program controller builds cached programs with injected defines", () => {
  const calls = [];
  const state = {gl: {id: "main"}, program: null, programKey: ""};
  const controller = createShaderProgramController({
    config: {
      assignMode: "blend",
      outputMode: "fullReplace",
      showPalette: "strip",
      CYCLE_MODE: 2,
      ditherPattern: "ordered4"
    },
    state,
    vertexSource: "vertex shader",
    fragmentSource: "fragment shader",
    manualCycleModeEnabled: () => false,
    buildCachedProgramFn: (gl, cache, options) => {
      calls.push({gl, cache, options});
      return "program";
    }
  });

  assert.equal(controller.buildProgram(), "program");
  assert.equal(calls[0].gl, state.gl);
  assert.equal(calls[0].cache, state);
  assert.deepEqual(calls[0].options, {
    vertexSource: "vertex shader",
    fragmentSource: "fragment shader",
    defineLines: [
      "#define ASSIGNMODE 1",
      "#define OUTPUT_MODE 0",
      "#define CYCLE_MODE 2",
      "#define DITHER_PATTERN 1",
      "#define NEUTRAL_IS_CATEGORY 0",
      "#define FIDELITY_GUARD 0",
      "#define DIAGNOSTIC_OVERLAY_MODE 0",
      "#define DIAGNOSTIC_HISTOGRAM_SCOPE 0",
      "#define DIAGNOSTIC_HISTOGRAM_CHANNEL 0"
    ],
    linkErrorMessage: "unknown program link error"
  });

  const cache = {program: null, programKey: ""};
  controller.buildProgramForContext({id: "export"}, cache, {showPalette: "none"});
  assert.equal(calls[1].gl.id, "export");
  assert.equal(calls[1].cache, cache);
});

test("shader program controller includes diagnostic override defines in the cache key", () => {
  const calls = [];
  const state = {gl: {id: "main"}, program: null, programKey: ""};
  const controller = createShaderProgramController({
    config: {
      assignMode: "blend",
      outputMode: "fullReplace",
      CYCLE_MODE: 0,
      ditherPattern: "ordered4"
    },
    state,
    vertexSource: "vertex shader",
    fragmentSource: "fragment shader",
    buildCachedProgramFn: (_gl, _cache, options) => {
      calls.push(options.defineLines);
      return "program";
    }
  });

  controller.buildProgram({
    diagnosticOverlayMode: "histogram",
    diagnosticOverlayHistogramScope: "source",
    diagnosticOverlayHistogramChannel: "chroma"
  });

  assert.ok(calls[0].includes("#define DIAGNOSTIC_OVERLAY_MODE 3"));
  assert.ok(calls[0].includes("#define DIAGNOSTIC_HISTOGRAM_SCOPE 0"));
  assert.ok(calls[0].includes("#define DIAGNOSTIC_HISTOGRAM_CHANNEL 1"));
});

test("shaderDefineLinesForConfig maps categorical neutral mode", () => {
  assert.ok(shaderDefineLinesForConfig({
    assignMode: "nearest",
    outputMode: "hueWash",
    CYCLE_MODE: 0,
    ditherPattern: "ordered4",
    neutralIsCategory: true
  }).includes("#define NEUTRAL_IS_CATEGORY 1"));
});

test("palette shader gates hue pressure for near-neutral colors", () => {
  const source = readFileSync(new URL("../src/shaders/palette.frag", import.meta.url), "utf8");
  assert.match(source, /NEUTRAL_CHROMA_EPSILON = 2\.0/);
  assert.match(source, /ENDPOINT_NEUTRAL_CHROMA_EPSILON = 6\.0/);
  assert.match(source, /bool labHasReliableHue\(float L, float chroma\)/);
  assert.match(source, /bool labHasHue = labHasReliableHue\(labL, labC\)/);
  assert.match(source, /#if NEUTRAL_IS_CATEGORY/);
});

test("palette shader histogram overlay can early-out before assignment for source bins", () => {
  const source = readFileSync(new URL("../src/shaders/palette.frag", import.meta.url), "utf8");
  assert.doesNotMatch(source, /uniform int u_diagnosticOverlayMode/);
  assert.doesNotMatch(source, /uniform int u_diagnosticOverlayHistogramScope/);
  assert.doesNotMatch(source, /uniform int u_diagnosticOverlayHistogramChannel/);
  assert.match(source, /uniform float u_diagnosticOverlayHistogramMin/);
  assert.match(source, /uniform float u_diagnosticOverlayHistogramMax/);
  assert.doesNotMatch(source, /uniform int u_diagnosticOverlayHistogramBin/);
  assert.match(source, /value >= rangeMin && value < rangeMax/);
  assert.match(source, /#if DIAGNOSTIC_HISTOGRAM_CHANNEL == 3/);
  assert.match(source, /return !labHasReliableHue\(diagnosticLab\.x, chroma\)/);
  assert.match(source, /bool diagnosticHistogramBinMatches\(vec3 diagnosticLab\)/);
  assert.match(source, /#if DIAGNOSTIC_OVERLAY_MODE == 3 && DIAGNOSTIC_HISTOGRAM_SCOPE == 0/);
  assert.ok(
    source.indexOf("#if DIAGNOSTIC_OVERLAY_MODE == 3 && DIAGNOSTIC_HISTOGRAM_SCOPE == 0") < source.indexOf("softAssign(lab"),
    "source histogram overlay should return before palette assignment"
  );
});

test("palette shader difference overlay measures displayed OKLab output distance", () => {
  const source = readFileSync(new URL("../src/shaders/palette.frag", import.meta.url), "utf8");
  assert.match(source, /vec3 finalLab = rgb2lab\(srgb2linear\(finalColor\)\)/);
  assert.match(source, /length\(finalLab - lab\) \/ OKLAB_SCALE/);
  assert.doesNotMatch(source, /length\(diff\) \/ 1\.7320508/);
});
