import { createWebgl2Context, resizeDrawingBuffer } from "./context.js";
import { buildStaticProgram } from "./programs.js";
import { createLazyCanvasImageData } from "../runtime/lazy-image-data.js";
import { configureTexture, createTexture, uploadCanvasTexture } from "./textures.js";
import { uniformArrayLocation, uniformLocation } from "./uniforms.js";

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

const CLARITY_EFFECTIVE_MAX = 1.0 ;
const CLARITY_SHARP_THRESHOLD = 0.02;
const CLARITY_SHARP_STRENGTH = 1.0;
const CLARITY_SHARP_KNEE = 0.01;
const CLARITY_PRESERVE_TONES = 0.7;

function kernelWeight1D(offset, radius, softness) {
  const x = Math.abs(Number(offset) || 0);
  const r0 = Math.max(Number(radius) || 0, 0);
  const s0 = Math.max(Number(softness) || 0, 0);

  if (r0 < 0.5 || s0 < 0.0001) return x < 0.5 ? 1 : 0;
  if (x >= r0 + 0.5) return 0;

  const r = Math.max(r0, 1);
  const s = Math.max(s0, 0.0001);
  const rs = r * s * s;
  return Math.exp(-(x * x) / rs) / Math.sqrt(Math.PI * rs);
}

export function createNormalizedClarityKernel(radius, softness) {
  const safeRadius = Math.max(0, Math.round(Number(radius) || 0));
  const weights = new Float32Array(safeRadius * 2 + 1);
  let sum = 0;

  for (let i = 0; i < weights.length; i++) {
    const offset = i - safeRadius;
    const weight = kernelWeight1D(offset, safeRadius, softness);
    weights[i] = weight;
    sum += weight;
  }

  if (sum <= 0) {
    weights.fill(0);
    weights[safeRadius] = 1;
    return weights;
  }

  for (let i = 0; i < weights.length; i++) weights[i] /= sum;
  return weights;
}

const CLARITY_LIGHTNESS_KERNEL = createNormalizedClarityKernel(6, 6.0);
const CLARITY_SHARP_KERNEL = createNormalizedClarityKernel(3, 3.0);

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

function scalarTextureFormat(levelsState, gl) {
  if (levelsState.scalarTextureFormat) return levelsState.scalarTextureFormat;

  const supportsFloatRenderTargets = typeof gl.getExtension === "function"
    && !!gl.getExtension("EXT_color_buffer_float")
    && Number.isFinite(Number(gl.R16F))
    && Number.isFinite(Number(gl.RED))
    && Number.isFinite(Number(gl.HALF_FLOAT));

  levelsState.scalarTextureFormat = supportsFloatRenderTargets
    ? {key: "r16f", internalFormat: gl.R16F, format: gl.RED, type: gl.HALF_FLOAT}
    : {key: "rgba8", internalFormat: gl.RGBA, format: gl.RGBA, type: gl.UNSIGNED_BYTE};

  return levelsState.scalarTextureFormat;
}

function ensureSizedScalarTexture(levelsState, gl, key, width, height) {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const format = scalarTextureFormat(levelsState, gl);
  levelsState[key] ||= {texture: null, width: 0, height: 0, formatKey: ""};
  const ref = levelsState[key];

  if (!ref.texture) ref.texture = createTexture(gl);
  configureTexture(gl, ref.texture, {filter: gl.NEAREST});

  if (ref.width !== safeWidth || ref.height !== safeHeight || ref.formatKey !== format.key) {
    gl.texImage2D(gl.TEXTURE_2D, 0, format.internalFormat, safeWidth, safeHeight, 0, format.format, format.type, null);
    ref.width = safeWidth;
    ref.height = safeHeight;
    ref.formatKey = format.key;
  }

  return ref.texture;
}

function bindTargetFramebuffer(gl, framebuffer, texture, label) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
}


function setKernelUniform(gl, program, name, weights) {
  const location = uniformArrayLocation(gl, program, name);
  if (location) gl.uniform1fv(location, weights);
}

function setLevelsUniforms(gl, program, width, height, settings, defaults) {
  gl.uniform1i(uniformLocation(gl, program, "u_image"), 0);
  gl.uniform2f(uniformLocation(gl, program, "u_resolution"), width, height);
  gl.uniform1f(uniformLocation(gl, program, "u_levelsExposure"), Number(settings.levelsExposure) || 0);
  gl.uniform1f(uniformLocation(gl, program, "u_levelsGamma"), Math.max(0.0001, Number(settings.levelsGamma) || 1));
  gl.uniform1f(uniformLocation(gl, program, "u_levelsShoulder"), Math.max(0.0001, Number(settings.levelsShoulder) || defaults.levelsShoulder || 6));

  const center = Number(settings.levelsCenter);
  const fallbackCenter = Number.isFinite(Number(defaults.levelsCenter)) ? Number(defaults.levelsCenter) : -1;
  gl.uniform1f(uniformLocation(gl, program, "u_levelsCenter"), Number.isFinite(center) ? center : fallbackCenter);
  gl.uniform1f(uniformLocation(gl, program, "u_levelsCurveAmount"), clamp01(Number(settings.levelsCurveAmount) || 0));
}

export function renderLevelsPreviewCanvas(levelsState, {
  shaders,
  originalCanvas,
  sourceVersion = 0,
  settings = {},
  defaults = {},
  uploadCanvasTextureFn = uploadCanvasTexture
}) {
  if (!originalCanvas || !originalCanvas.width || !originalCanvas.height) return null;
  const width = originalCanvas.width;
  const height = originalCanvas.height;

  if (levelsAreIdentity(settings)) return originalCanvas;

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
    return canvas;
  }

  if (!shaders.clarityLightnessBlurFragmentSource
    || !shaders.claritySharpFragmentSource
    || !shaders.claritySharpBlurFragmentSource
    || !shaders.clarityFragmentSource) {
    throw new Error("Clarity shader source is missing.");
  }

  const framebuffer = ensureFramebuffer(levelsState, gl);
  const baseTexture = ensureSizedTexture(levelsState, gl, "clarityBase", width, height);
  const lightnessBlurTexture = ensureSizedScalarTexture(levelsState, gl, "clarityLightnessBlur", width, height);
  const sharpTexture = ensureSizedScalarTexture(levelsState, gl, "claritySharp", width, height);
  const sharpBlurTexture = ensureSizedScalarTexture(levelsState, gl, "claritySharpBlur", width, height);

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

  // Pass 2: horizontal half of the 13-tap Oklab lightness blur.
  bindTargetFramebuffer(gl, framebuffer, lightnessBlurTexture, "Clarity lightness horizontal blur");
  const lightnessBlurProgram = ensureClarityProgram(
    levelsState,
    gl,
    shaders,
    "clarityLightnessBlurProgram",
    shaders.clarityLightnessBlurFragmentSource,
    "clarity lightness blur shader failed"
  );
  gl.viewport(0, 0, width, height);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, baseTexture);
  gl.useProgram(lightnessBlurProgram);
  gl.uniform1i(uniformLocation(gl, lightnessBlurProgram, "u_image"), 0);
  gl.uniform2f(uniformLocation(gl, lightnessBlurProgram, "u_resolution"), width, height);
  setKernelUniform(gl, lightnessBlurProgram, "u_kernelWeights", CLARITY_LIGHTNESS_KERNEL);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // Pass 3: vertical half of the same blur, then the nonlinear high-pass/soft-light shaping.
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
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, lightnessBlurTexture);
  gl.useProgram(sharpProgram);
  gl.uniform1i(uniformLocation(gl, sharpProgram, "u_image"), 0);
  gl.uniform1i(uniformLocation(gl, sharpProgram, "u_lightnessBlur"), 1);
  gl.uniform2f(uniformLocation(gl, sharpProgram, "u_resolution"), width, height);
  gl.uniform1f(uniformLocation(gl, sharpProgram, "u_threshold"), CLARITY_SHARP_THRESHOLD);
  gl.uniform1f(uniformLocation(gl, sharpProgram, "u_strength"), CLARITY_SHARP_STRENGTH);
  gl.uniform1f(uniformLocation(gl, sharpProgram, "u_knee"), CLARITY_SHARP_KNEE);
  setKernelUniform(gl, sharpProgram, "u_kernelWeights", CLARITY_LIGHTNESS_KERNEL);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // Pass 4: horizontal half of the 7-tap sharp-lightness blur.
  bindTargetFramebuffer(gl, framebuffer, sharpBlurTexture, "Clarity sharp horizontal blur");
  const sharpBlurProgram = ensureClarityProgram(
    levelsState,
    gl,
    shaders,
    "claritySharpBlurProgram",
    shaders.claritySharpBlurFragmentSource,
    "clarity sharp blur shader failed"
  );
  gl.viewport(0, 0, width, height);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sharpTexture);
  gl.useProgram(sharpBlurProgram);
  gl.uniform1i(uniformLocation(gl, sharpBlurProgram, "u_sharpPass"), 0);
  gl.uniform2f(uniformLocation(gl, sharpBlurProgram, "u_resolution"), width, height);
  setKernelUniform(gl, sharpBlurProgram, "u_kernelWeights", CLARITY_SHARP_KERNEL);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // Pass 5: vertical half of the sharp-lightness blur, then final Oklab composite.
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
  gl.uniform1i(uniformLocation(gl, clarityProgram, "u_image"), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, sharpTexture);
  gl.uniform1i(uniformLocation(gl, clarityProgram, "u_sharpPass"), 1);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, sharpBlurTexture);
  gl.uniform1i(uniformLocation(gl, clarityProgram, "u_sharpBlur"), 2);
  gl.uniform2f(uniformLocation(gl, clarityProgram, "u_resolution"), width, height);
  gl.uniform1f(uniformLocation(gl, clarityProgram, "u_intensity"), clarityAmount * CLARITY_EFFECTIVE_MAX);
  gl.uniform1f(uniformLocation(gl, clarityProgram, "u_preserveTones"), CLARITY_PRESERVE_TONES);
  setKernelUniform(gl, clarityProgram, "u_kernelWeights", CLARITY_SHARP_KERNEL);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.finish();

  return canvas;
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
  const sourceCanvas = renderLevelsPreviewCanvas(levelsState, {
    shaders,
    originalCanvas,
    sourceVersion,
    settings,
    defaults,
    uploadCanvasTextureFn
  });
  if (!sourceCanvas) return null;

  resizeDrawingBuffer(targetCanvas, width, height);
  targetCtx.clearRect(0, 0, width, height);
  targetCtx.drawImage(sourceCanvas, 0, 0, width, height);
  return createLazyCanvasImageData(targetCtx, width, height, {canvas: targetCanvas, version: sourceVersion});
}
