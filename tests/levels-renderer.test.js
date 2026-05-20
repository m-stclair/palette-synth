import test from "node:test";
import assert from "node:assert/strict";
import { applyLevelsToCanvas, createNormalizedClarityKernel } from "../src/gl/levels-renderer.js";

function makeGl() {
  let textureId = 0;
  let shaderId = 0;
  let programId = 0;
  const calls = [];
  return {
    calls,
    TEXTURE0: 0x84C0,
    TEXTURE_2D: 0x0DE1,
    LINEAR: 0x2601,
    NEAREST: 0x2600,
    CLAMP_TO_EDGE: 0x812F,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    UNPACK_FLIP_Y_WEBGL: 0x9240,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    TRIANGLES: 0x0004,
    VERTEX_SHADER: 0x8B31,
    FRAGMENT_SHADER: 0x8B30,
    COMPILE_STATUS: 0x8B81,
    LINK_STATUS: 0x8B82,
    FRAMEBUFFER: 0x8D40,
    COLOR_ATTACHMENT0: 0x8CE0,
    createTexture() {
      const texture = {id: ++textureId};
      calls.push(["createTexture", texture.id]);
      return texture;
    },
    createFramebuffer: () => ({id: "framebuffer"}),
    framebufferTexture2D: (...args) => calls.push(["framebufferTexture2D", ...args]),
    bindTexture: (...args) => calls.push(["bindTexture", ...args]),
    texParameteri: (...args) => calls.push(["texParameteri", ...args]),
    pixelStorei: (...args) => calls.push(["pixelStorei", ...args]),
    texImage2D: (...args) => calls.push(["texImage2D", ...args]),
    createShader: type => ({id: ++shaderId, type}),
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: () => true,
    getShaderInfoLog: () => "",
    deleteShader: () => {},
    createProgram: () => ({id: ++programId}),
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => true,
    getProgramInfoLog: () => "",
    deleteProgram: () => {},
    viewport: (...args) => calls.push(["viewport", ...args]),
    activeTexture: (...args) => calls.push(["activeTexture", ...args]),
    bindFramebuffer: (...args) => calls.push(["bindFramebuffer", ...args]),
    useProgram: (...args) => calls.push(["useProgram", ...args]),
    getUniformLocation: (_program, name) => name,
    uniform1i: (...args) => calls.push(["uniform1i", ...args]),
    uniform2f: (...args) => calls.push(["uniform2f", ...args]),
    uniform1f: (...args) => calls.push(["uniform1f", ...args]),
    uniform1fv: (...args) => calls.push(["uniform1fv", ...args]),
    drawArrays: (...args) => calls.push(["drawArrays", ...args]),
    finish: () => calls.push(["finish"]),
    getExtension: () => null
  };
}

function makeHarness() {
  const gl = makeGl();
  const levelsState = {
    canvas: {
      width: 0,
      height: 0,
      getContext: () => gl
    }
  };
  const targetCanvas = {width: 0, height: 0};
  const targetCtx = {
    clearRect: () => {},
    drawImage: () => {},
    getImageData: () => ({ok: true})
  };
  const shaders = {vertexSource: "vertex", fragmentSource: "fragment"};
  const settings = {levelsExposure: 0.25, levelsGamma: 1, levelsCurveAmount: 0};
  const defaults = {levelsShoulder: 6, levelsCenter: -1};
  return {gl, levelsState, targetCanvas, targetCtx, shaders, settings, defaults};
}

test("levels renderer reuses an uploaded source texture while the source version is unchanged", () => {
  const {levelsState, targetCanvas, targetCtx, shaders, settings, defaults} = makeHarness();
  const originalCanvas = {width: 4, height: 2, name: "source"};
  const uploads = [];
  const uploadCanvasTextureFn = (_gl, texture, canvas, options) => uploads.push({texture, canvas, options});

  applyLevelsToCanvas(levelsState, {
    shaders,
    originalCanvas,
    targetCanvas,
    targetCtx,
    sourceVersion: 3,
    settings,
    defaults,
    uploadCanvasTextureFn
  });
  applyLevelsToCanvas(levelsState, {
    shaders,
    originalCanvas,
    targetCanvas,
    targetCtx,
    sourceVersion: 3,
    settings,
    defaults,
    uploadCanvasTextureFn
  });

  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].canvas, originalCanvas);
  assert.deepEqual(uploads[0].options, {pixelPerfect: false});
});

test("levels renderer invalidates the cached source texture when the source version changes", () => {
  const {levelsState, targetCanvas, targetCtx, shaders, settings, defaults} = makeHarness();
  const originalCanvas = {width: 4, height: 2, name: "source"};
  const uploads = [];
  const uploadCanvasTextureFn = (_gl, texture, canvas) => uploads.push({texture, canvas});

  applyLevelsToCanvas(levelsState, {
    shaders,
    originalCanvas,
    targetCanvas,
    targetCtx,
    sourceVersion: 3,
    settings,
    defaults,
    uploadCanvasTextureFn
  });
  applyLevelsToCanvas(levelsState, {
    shaders,
    originalCanvas,
    targetCanvas,
    targetCtx,
    sourceVersion: 4,
    settings,
    defaults,
    uploadCanvasTextureFn
  });

  assert.equal(uploads.length, 2);
  assert.equal(uploads[0].texture, uploads[1].texture);
});

test("levels renderer keeps separate cached source textures for primary and reference canvases", () => {
  const {levelsState, targetCanvas, targetCtx, shaders, settings, defaults} = makeHarness();
  const sourceCanvas = {width: 4, height: 2, name: "source"};
  const referenceCanvas = {width: 3, height: 2, name: "reference"};
  const uploads = [];
  const uploadCanvasTextureFn = (_gl, texture, canvas) => uploads.push({texture, canvas});

  applyLevelsToCanvas(levelsState, {
    shaders,
    originalCanvas: sourceCanvas,
    targetCanvas,
    targetCtx,
    sourceVersion: 1,
    settings,
    defaults,
    uploadCanvasTextureFn
  });
  applyLevelsToCanvas(levelsState, {
    shaders,
    originalCanvas: referenceCanvas,
    targetCanvas,
    targetCtx,
    sourceVersion: 1,
    settings,
    defaults,
    uploadCanvasTextureFn
  });
  applyLevelsToCanvas(levelsState, {
    shaders,
    originalCanvas: sourceCanvas,
    targetCanvas,
    targetCtx,
    sourceVersion: 1,
    settings,
    defaults,
    uploadCanvasTextureFn
  });

  assert.equal(uploads.length, 2);
  assert.equal(uploads[0].canvas, sourceCanvas);
  assert.equal(uploads[1].canvas, referenceCanvas);
  assert.notEqual(uploads[0].texture, uploads[1].texture);
});


test("createNormalizedClarityKernel returns symmetric normalized CPU weights", () => {
  const weights = createNormalizedClarityKernel(3, 3.0);
  const sum = Array.from(weights).reduce((total, weight) => total + weight, 0);

  assert.equal(weights.length, 7);
  assert.ok(Math.abs(sum - 1) < 1e-6);
  assert.equal(weights[0], weights[6]);
  assert.equal(weights[1], weights[5]);
  assert.equal(weights[2], weights[4]);
  assert.ok(weights[3] > weights[2]);
});


test("clarity path runs split separable blur passes with CPU kernel uniforms", () => {
  const {gl, levelsState, targetCanvas, targetCtx, defaults} = makeHarness();
  const originalCanvas = {width: 4, height: 2, name: "source"};
  const shaders = {
    vertexSource: "vertex",
    fragmentSource: "levels fragment",
    clarityLightnessBlurFragmentSource: "clarity lightness blur fragment",
    claritySharpFragmentSource: "clarity sharp fragment",
    claritySharpBlurFragmentSource: "clarity sharp blur fragment",
    clarityFragmentSource: "clarity fragment"
  };

  applyLevelsToCanvas(levelsState, {
    shaders,
    originalCanvas,
    targetCanvas,
    targetCtx,
    sourceVersion: 1,
    settings: {levelsExposure: 0, levelsGamma: 1, levelsCurveAmount: 0, clarityAmount: 0.5},
    defaults,
    uploadCanvasTextureFn: () => {}
  });

  assert.equal(gl.calls.filter(call => call[0] === "drawArrays").length, 5);
  assert.deepEqual(
    gl.calls
      .filter(call => call[0] === "uniform1fv")
      .map(call => call[2].length),
    [13, 13, 7, 7]
  );
});
