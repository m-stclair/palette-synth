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
    claritySharpFragmentSource: "sharp fragment",
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
      claritySharpFragmentSource: "sharp fragment",
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

test("level source controller refreshes only dirty available sources", () => {
  const state = {
    levels: {},
    originalCanvas: {width: 10, name: "sourceOriginal"},
    sourceCanvas: {name: "source"},
    sourceCtx: {name: "sourceCtx"},
    originalSourceVersion: 7,
    referenceOriginalCanvas: {width: 5, name: "referenceOriginal"},
    referenceCanvas: {name: "reference"},
    referenceCtx: {name: "referenceCtx"},
    referenceOriginalSourceVersion: 11,
    sourceLevelsDirty: true,
    referenceLevelsDirty: true,
    textureDirty: false
  };
  const calls = [];
  const controller = createLevelSourceController({
    state,
    config: {},
    applyLevelsToCanvasFn: (_levels, {originalCanvas, sourceVersion}) => {
      calls.push([originalCanvas.name, sourceVersion]);
      return {name: `${originalCanvas.name}ImageData`};
    }
  });

  controller.ensureLevelAdjustedSources();

  assert.deepEqual(calls, [["sourceOriginal", 7], ["referenceOriginal", 11]]);
  assert.deepEqual(state.imageData, {name: "sourceOriginalImageData"});
  assert.deepEqual(state.referenceImageData, {name: "referenceOriginalImageData"});
  assert.equal(state.sourceLevelsDirty, false);
  assert.equal(state.referenceLevelsDirty, false);
  assert.equal(state.textureDirty, true);

  controller.ensureLevelAdjustedSources();
  assert.deepEqual(calls, [["sourceOriginal", 7], ["referenceOriginal", 11]]);
});
