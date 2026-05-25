import test from "node:test";
import assert from "node:assert/strict";
import { createLevelSourceController } from "../src/runtime/level-sources.js";

test("level source controller forwards shader/settings dependencies to the renderer", () => {
  const calls = [];
  const levels = {canvas: {}};
  const config = {levelsExposure: 1};
  const originalCanvas = {width: 4, height: 2};
  const targetCanvas = {width: 0, height: 0};
  const targetCtx = {};
  const controller = createLevelSourceController({
    state: {levels},
    config,
    vertexSource: "vertex",
    fragmentSource: "levels fragment",
    clarityLightnessBlurFragmentSource: "lightness blur fragment",
    claritySharpFragmentSource: "sharp fragment",
    claritySharpBlurFragmentSource: "sharp blur fragment",
    clarityFragmentSource: "clarity fragment",
    defaults: {levelsShoulder: 8},
    applyLevelsToCanvasFn: (...args) => {
      calls.push(args);
      return {width: 4, height: 2};
    }
  });

  assert.deepEqual(controller.applyLevelsToCanvas(originalCanvas, targetCanvas, targetCtx), {width: 4, height: 2});
  assert.equal(calls[0][0], levels);
  assert.deepEqual(calls[0][1], {
    shaders: {
      vertexSource: "vertex",
      fragmentSource: "levels fragment",
      clarityLightnessBlurFragmentSource: "lightness blur fragment",
      claritySharpFragmentSource: "sharp fragment",
      claritySharpBlurFragmentSource: "sharp blur fragment",
      clarityFragmentSource: "clarity fragment"
    },
    originalCanvas,
    targetCanvas,
    targetCtx,
    sourceVersion: 0,
    settings: config,
    defaults: {levelsShoulder: 8}
  });
});

test("level source controller refreshes only dirty primary sources", () => {
  const draws = [];
  const state = {
    levels: {},
    originalCanvas: {width: 10, height: 2, name: "sourceOriginal"},
    sourceCanvas: {width: 0, height: 0, name: "source"},
    sourceCtx: {
      name: "sourceCtx",
      clearRect: (...args) => draws.push(["clear", ...args]),
      drawImage: (...args) => draws.push(["draw", args[0].name, ...args.slice(1)]),
      getImageData: (x, y, width, height) => ({width, height, data: new Uint8ClampedArray(width * height * 4)})
    },
    originalSourceVersion: 7,
    referenceOriginalCanvas: {width: 5, height: 2, name: "referenceOriginal"},
    referenceCanvas: {name: "reference"},
    referenceCtx: {name: "referenceCtx"},
    referenceOriginalSourceVersion: 11,
    previewLevelsDirty: true,
    previewSourceCanvas: null,
    previewSourceVersion: 0,
    sourceLevelsDirty: true,
    referenceLevelsDirty: true,
    textureDirty: false
  };
  const calls = [];
  const controller = createLevelSourceController({
    state,
    config: {},
    renderLevelsPreviewCanvasFn: (_levels, {originalCanvas, sourceVersion}) => {
      calls.push([originalCanvas.name, sourceVersion]);
      return {width: originalCanvas.width, height: originalCanvas.height, name: `${originalCanvas.name}Preview`};
    }
  });

  controller.ensureLevelAdjustedSources();

  assert.deepEqual(calls, [["sourceOriginal", 7]]);
  assert.equal(state.imageData.width, 10);
  assert.equal(state.imageData.height, 2);
  assert.deepEqual(draws, [
    ["clear", 0, 0, 10, 2],
    ["draw", "sourceOriginalPreview", 0, 0, 10, 2]
  ]);
  assert.equal(state.referenceImageData, undefined);
  assert.equal(state.previewLevelsDirty, false);
  assert.equal(state.sourceLevelsDirty, false);
  assert.equal(state.referenceLevelsDirty, true);
  assert.equal(state.textureDirty, false);

  controller.ensureLevelAdjustedSources();
  assert.deepEqual(calls, [["sourceOriginal", 7]]);
});
