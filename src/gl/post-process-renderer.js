import { linkProgram } from "./programs.js";
import { configureTexture, createTexture } from "./textures.js";

// Default tolerance for "colors equal" comparisons in the despeckle shader.
// The tolerance is expressed in linear 0..1 RGB units. 0.02 is roughly
// 5 / 255 per channel, which handles fp rounding from the palette pass
// without merging actual palette swatches.
export const POST_DEFAULT_COLOR_TOLERANCE = 0.02;

function ensureTextureWithSize(gl, textureRef, width, height, {force = false} = {}) {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  if (!textureRef.texture) textureRef.texture = createTexture(gl);
  gl.bindTexture(gl.TEXTURE_2D, textureRef.texture);
  configureTexture(gl, textureRef.texture, {filter: gl.NEAREST});
  if (force || textureRef.width !== safeWidth || textureRef.height !== safeHeight) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, safeWidth, safeHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    textureRef.width = safeWidth;
    textureRef.height = safeHeight;
  }
  return textureRef.texture;
}

// Decide if the post-process pipeline should run for the current draw.
// Diagnostic overlays show palette internals and must bypass post-processing.
export function postProcessActive(config = {}, overlay = {}) {
  if (overlay && overlay.mode && overlay.mode !== "none") return false;
  return !!config.despeckleEnabled
    && Math.max(0, Math.round(Number(config.despeckleStrength) || 0)) > 0;
}

export function postProcessSettingsFromConfig(config = {}) {
  return {
    despeckleEnabled: !!config.despeckleEnabled,
    despeckleStrength: Math.max(0, Math.min(4, Math.round(Number(config.despeckleStrength) || 0)))
  };
}

function ensureDespeckleProgram(gl, vertexSource, fragmentSource, cacheSlot) {
  if (cacheSlot.program) return cacheSlot.program;
  cacheSlot.program = linkProgram(gl, vertexSource, fragmentSource, "despeckle shader failed");
  return cacheSlot.program;
}

function bindTargetFramebuffer(gl, framebuffer, texture) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
}

function runDespecklePass(gl, program, {
  sourceTexture,
  width,
  height,
  texelSize,
  step,
  tolerance
}) {
  gl.useProgram(program);
  gl.viewport(0, 0, width, height);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
  gl.uniform1i(gl.getUniformLocation(program, "u_image"), 0);
  gl.uniform2f(gl.getUniformLocation(program, "u_texelSize"), texelSize[0], texelSize[1]);
  gl.uniform1f(gl.getUniformLocation(program, "u_step"), step);
  gl.uniform1f(gl.getUniformLocation(program, "u_tolerance"), tolerance);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// Runs the despeckle iterations against an input texture (the source-resolution
// palette output) using two ping-pong textures. Returns whichever texture holds
// the final result so the caller can sample it during the view-composite pass.
export function renderPostProcessPasses(gl, cache, {
  inputTexture,
  width,
  height,
  vertexSource,
  fragmentSource,
  settings,
  pixelBlockSize = 1
}) {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const texelSize = [1 / safeWidth, 1 / safeHeight];
  const step = Math.max(1, Math.round(Number(pixelBlockSize) || 1));

  cache.textureA ||= {texture: null, width: 0, height: 0};
  cache.textureB ||= {texture: null, width: 0, height: 0};
  cache.despeckleProgram ||= {program: null};
  if (!cache.framebuffer) cache.framebuffer = gl.createFramebuffer();

  const forceRefresh = !!cache.dirty;
  const textureA = ensureTextureWithSize(gl, cache.textureA, safeWidth, safeHeight, {force: forceRefresh});
  const textureB = ensureTextureWithSize(gl, cache.textureB, safeWidth, safeHeight, {force: forceRefresh});
  cache.dirty = false;
  const iterations = settings.despeckleEnabled ? Math.max(0, settings.despeckleStrength) : 0;

  let readTexture = inputTexture;
  let writeTexture = textureA;
  let other = textureB;

  if (iterations > 0) {
    const program = ensureDespeckleProgram(gl, vertexSource, fragmentSource, cache.despeckleProgram);
    for (let i = 0; i < iterations; i++) {
      bindTargetFramebuffer(gl, cache.framebuffer, writeTexture);
      runDespecklePass(gl, program, {
        sourceTexture: readTexture,
        width: safeWidth,
        height: safeHeight,
        texelSize,
        step,
        tolerance: POST_DEFAULT_COLOR_TOLERANCE
      });
      readTexture = writeTexture;
      const swap = writeTexture;
      writeTexture = other;
      other = swap;
    }
  }

  // When despeckle is disabled we simply return the input texture so the
  // caller can still use the same composite path.
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return readTexture;
}

export function disposePostProcessCache(gl, cache = {}) {
  if (!gl || !cache) return;
  if (cache.textureA?.texture) gl.deleteTexture(cache.textureA.texture);
  if (cache.textureB?.texture) gl.deleteTexture(cache.textureB.texture);
  if (cache.framebuffer) gl.deleteFramebuffer(cache.framebuffer);
  if (cache.despeckleProgram?.program) gl.deleteProgram(cache.despeckleProgram.program);
  cache.textureA = {texture: null, width: 0, height: 0};
  cache.textureB = {texture: null, width: 0, height: 0};
  cache.framebuffer = null;
  cache.despeckleProgram = {program: null};
  cache.dirty = true;
}
