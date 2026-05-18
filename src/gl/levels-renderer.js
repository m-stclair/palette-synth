import { createWebgl2Context, resizeDrawingBuffer } from "./context.js";
import { buildStaticProgram } from "./programs.js";
import { configureTexture, createTexture, uploadCanvasTexture } from "./textures.js";

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

const CLARITY_EFFECTIVE_MAX = 1.0 ;
const CLARITY_SHARP_THRESHOLD = 0.02;
const CLARITY_SHARP_STRENGTH = 1.0;
const CLARITY_SHARP_KNEE = 0.01;
const CLARITY_PRESERVE_TONES = 0.7;

export function levelsAreIdentity(settings = {}) {
  return Math.abs(Number(settings.levelsExposure) || 0) < 1e-9
    && Math.abs((Number(settings.levelsGamma) || 1) - 1) < 1e-9
    && Math.abs(Number(settings.levelsCurveAmount) || 0) < 1e-9
    && Math.abs(Number(settings.clarityAmount) || 0) < 1e-9;
}

function ensureLevelsContext(levelsState) {
  if (levelsState.gl) return levelsState.gl;
  levelsState.gl = createWebgl2Context(levelsState.canvas, "WebGL2 is required for level adjustment.");
  return levelsState.gl;
}

function ensureLevelsProgram(levelsState, gl, shaders) {
  levelsState.levelsProgram ||= {program: null};
  return buildStaticProgram(gl, levelsState.levelsProgram, {
    vertexSource: shaders.vertexSource,
    fragmentSource: shaders.fragmentSource,
    linkErrorMessage: "unknown levels shader link error"
  });
}

function ensureClarityProgram(levelsState, gl, shaders, key, fragmentSource, linkErrorMessage) {
  levelsState[key] ||= {program: null};
  return buildStaticProgram(gl, levelsState[key], {
    vertexSource: shaders.vertexSource,
    fragmentSource,
    linkErrorMessage
  });
}

function ensureUploadedSourceTexture(levelsState, gl, sourceCanvas, sourceVersion, uploadCanvasTextureFn) {
  levelsState.sourceTextureCache ||= new WeakMap();
  let ref = levelsState.sourceTextureCache.get(sourceCanvas);
  if (!ref) {
    ref = {texture: createTexture(gl), width: 0, height: 0, version: null};
    levelsState.sourceTextureCache.set(sourceCanvas, ref);
  }

  const width = Math.max(1, Math.round(sourceCanvas.width || 1));
  const height = Math.max(1, Math.round(sourceCanvas.height || 1));
  const version = Number(sourceVersion) || 0;

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, ref.texture);

  if (ref.width !== width || ref.height !== height || ref.version !== version) {
    uploadCanvasTextureFn(gl, ref.texture, sourceCanvas, {pixelPerfect: false});
    ref.width = width;
    ref.height = height;
    ref.version = version;
  }

  return ref.texture;
}

function ensureFramebuffer(levelsState, gl) {
  if (levelsState.framebuffer) return levelsState.framebuffer;
  levelsState.framebuffer = gl.createFramebuffer();
  return levelsState.framebuffer;
}

function ensureSizedTexture(levelsState, gl, key, width, height) {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  levelsState[key] ||= {texture: null, width: 0, height: 0};
  const ref = levelsState[key];
  if (!ref.texture) ref.texture = createTexture(gl);
  configureTexture(gl, ref.texture, {filter: gl.LINEAR});
  if (ref.width !== safeWidth || ref.height !== safeHeight) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, safeWidth, safeHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    ref.width = safeWidth;
    ref.height = safeHeight;
  }
  return ref.texture;
}

function bindTargetFramebuffer(gl, framebuffer, texture, label) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
}

function setLevelsUniforms(gl, program, width, height, settings, defaults) {
  gl.uniform1i(gl.getUniformLocation(program, "u_image"), 0);
  gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), width, height);
  gl.uniform1f(gl.getUniformLocation(program, "u_levelsExposure"), Number(settings.levelsExposure) || 0);
  gl.uniform1f(gl.getUniformLocation(program, "u_levelsGamma"), Math.max(0.0001, Number(settings.levelsGamma) || 1));
  gl.uniform1f(gl.getUniformLocation(program, "u_levelsShoulder"), Math.max(0.0001, Number(settings.levelsShoulder) || defaults.levelsShoulder || 6));

  const center = Number(settings.levelsCenter);
  const fallbackCenter = Number.isFinite(Number(defaults.levelsCenter)) ? Number(defaults.levelsCenter) : -1;
  gl.uniform1f(gl.getUniformLocation(program, "u_levelsCenter"), Number.isFinite(center) ? center : fallbackCenter);
  gl.uniform1f(gl.getUniformLocation(program, "u_levelsCurveAmount"), clamp01(Number(settings.levelsCurveAmount) || 0));
}

export function applyLevelsToCanvas(levelsState, {
  shaders,
  originalCanvas,
  targetCanvas,
  targetCtx,
  sourceVersion = 0,
  settings = {},
  defaults = {},
  uploadCanvasTextureFn = uploadCanvasTexture
}) {
  if (!originalCanvas || !originalCanvas.width || !originalCanvas.height || !targetCtx) return null;
  const width = originalCanvas.width;
  const height = originalCanvas.height;
  resizeDrawingBuffer(targetCanvas, width, height);

  if (levelsAreIdentity(settings)) {
    targetCtx.clearRect(0, 0, width, height);
    targetCtx.drawImage(originalCanvas, 0, 0);
    return targetCtx.getImageData(0, 0, width, height);
  }

  const gl = ensureLevelsContext(levelsState);
  const canvas = levelsState.canvas;
  resizeDrawingBuffer(canvas, width, height);

  const levelsProgram = ensureLevelsProgram(levelsState, gl, shaders);
  const texture = ensureUploadedSourceTexture(levelsState, gl, originalCanvas, sourceVersion, uploadCanvasTextureFn);
  const clarityAmount = clamp01(Number(settings.clarityAmount) || 0);
  gl.viewport(0, 0, width, height);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);

  if (clarityAmount <= 1e-9) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(levelsProgram);
    setLevelsUniforms(gl, levelsProgram, width, height, settings, defaults);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.finish();

    targetCtx.clearRect(0, 0, width, height);
    targetCtx.drawImage(canvas, 0, 0, width, height);
    return targetCtx.getImageData(0, 0, width, height);
  }

  if (!shaders.claritySharpFragmentSource || !shaders.clarityFragmentSource) {
    throw new Error("Clarity shader source is missing.");
  }

  const framebuffer = ensureFramebuffer(levelsState, gl);
  const baseTexture = ensureSizedTexture(levelsState, gl, "clarityBase", width, height);
  const sharpTexture = ensureSizedTexture(levelsState, gl, "claritySharp", width, height);

  // Pass 1: levels into an offscreen sRGB texture. The existing levels shader
  // samples the DOM canvas with the app's top-left image convention; FBO-to-FBO
  // clarity passes can then sample this texture with ordinary WebGL UVs.
  bindTargetFramebuffer(gl, framebuffer, baseTexture, "Levels");
  gl.viewport(0, 0, width, height);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.useProgram(levelsProgram);
  setLevelsUniforms(gl, levelsProgram, width, height, settings, defaults);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // Pass 2: restrained high-pass lightness sharpening, stored only as a lightness texture.
  bindTargetFramebuffer(gl, framebuffer, sharpTexture, "Clarity sharp");
  const sharpProgram = ensureClarityProgram(
    levelsState,
    gl,
    shaders,
    "claritySharpProgram",
    shaders.claritySharpFragmentSource,
    "clarity sharp shader failed"
  );
  gl.viewport(0, 0, width, height);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, baseTexture);
  gl.useProgram(sharpProgram);
  gl.uniform1i(gl.getUniformLocation(sharpProgram, "u_image"), 0);
  gl.uniform2f(gl.getUniformLocation(sharpProgram, "u_resolution"), width, height);
  gl.uniform1f(gl.getUniformLocation(sharpProgram, "u_threshold"), CLARITY_SHARP_THRESHOLD);
  gl.uniform1f(gl.getUniformLocation(sharpProgram, "u_strength"), CLARITY_SHARP_STRENGTH);
  gl.uniform1f(gl.getUniformLocation(sharpProgram, "u_knee"), CLARITY_SHARP_KNEE);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // Pass 3: broader soft-light local contrast back to the levels canvas.
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const clarityProgram = ensureClarityProgram(
    levelsState,
    gl,
    shaders,
    "clarityProgram",
    shaders.clarityFragmentSource,
    "clarity shader failed"
  );
  gl.viewport(0, 0, width, height);
  gl.useProgram(clarityProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, baseTexture);
  gl.uniform1i(gl.getUniformLocation(clarityProgram, "u_image"), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, sharpTexture);
  gl.uniform1i(gl.getUniformLocation(clarityProgram, "u_sharpPass"), 1);
  gl.uniform2f(gl.getUniformLocation(clarityProgram, "u_resolution"), width, height);
  gl.uniform1f(gl.getUniformLocation(clarityProgram, "u_intensity"), clarityAmount * CLARITY_EFFECTIVE_MAX);
  gl.uniform1f(gl.getUniformLocation(clarityProgram, "u_preserveTones"), CLARITY_PRESERVE_TONES);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.finish();

  targetCtx.clearRect(0, 0, width, height);
  targetCtx.drawImage(canvas, 0, 0, width, height);
  return targetCtx.getImageData(0, 0, width, height);
}
