import test from "node:test";
import assert from "node:assert/strict";
import { applyLevelsToCanvas } from "../src/gl/levels-renderer.js";

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
    createTexture() {
      const texture = {id: ++textureId};
      calls.push(["createTexture", texture.id]);
      return texture;
    },
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
    drawArrays: (...args) => calls.push(["drawArrays", ...args]),
    finish: () => calls.push(["finish"])
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
