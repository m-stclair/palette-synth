import { linkProgram } from "./programs.js";
import { configureTexture, createTexture } from "./textures.js";
import { uniformLocation } from "./uniforms.js";
import { DITHER_PATTERN } from "../state/config.js";

// Default tolerance for "colors equal" comparisons in the post-process shaders.
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

function normalizeDespeckleStrength(config = {}) {
  if (config.pixelArtEnabled !== true || !config.despeckleEnabled) return 0;
  return Math.max(0, Math.min(4, Math.round(Number(config.despeckleStrength) || 0)));
}

function normalizeEdgeTightenStrength(config = {}) {
  if (config.pixelArtEnabled !== true || !config.edgeTightenEnabled) return 0;
  return Math.max(0, Math.min(2, Math.round(Number(config.edgeTightenStrength) || 0)));
}

function normalizeDitherProtectionSettings(config = {}) {
  const ditherProtectionEnabled = config.ditherProtectionEnabled !== false;
  const ditherKnown = ditherProtectionEnabled && config.assignMode === "dither";
  const ditherPattern = DITHER_PATTERN[config.ditherPattern] ?? DITHER_PATTERN.ordered4;
  const ditherScale = Math.max(1, Math.min(12, Math.round(Number(config.ditherScale) || 1)));
  const ditherAngle = Math.max(-180, Math.min(180, Number(config.ditherAngle) || 0));
  return {
    ditherProtectionEnabled,
    ditherKnown,
    ditherPattern,
    ditherScale,
    ditherAngle
  };
}

// Decide if the post-process pipeline should run for the current draw.
// Diagnostic overlays show palette internals and must bypass post-processing.
export function postProcessActive(config = {}, overlay = {}) {
  if (overlay && overlay.mode && overlay.mode !== "none") return false;
  return normalizeDespeckleStrength(config) > 0
    || normalizeEdgeTightenStrength(config) > 0;
}

export function postProcessSettingsFromConfig(config = {}) {
  const despeckleStrength = normalizeDespeckleStrength(config);
  const edgeTightenStrength = normalizeEdgeTightenStrength(config);
  return {
    despeckleEnabled: !!config.despeckleEnabled && despeckleStrength > 0,
    despeckleStrength,
    edgeTightenEnabled: !!config.edgeTightenEnabled && edgeTightenStrength > 0,
    edgeTightenStrength,
    ...normalizeDitherProtectionSettings(config)
  };
}

function ensurePostProgram(gl, vertexSource, fragmentSource, cacheSlot, linkErrorMessage) {
  if (cacheSlot.program) return cacheSlot.program;
  cacheSlot.program = linkProgram(gl, vertexSource, fragmentSource, linkErrorMessage);
  return cacheSlot.program;
}

function bindTargetFramebuffer(gl, framebuffer, texture) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
}

function bindCommonPostUniforms(gl, program, {
  sourceTexture,
  texelSize,
  step,
  tolerance,
  ditherProtection
}) {
  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
  gl.uniform1i(uniformLocation(gl, program, "u_image"), 0);
  gl.uniform2f(uniformLocation(gl, program, "u_texelSize"), texelSize[0], texelSize[1]);
  gl.uniform1f(uniformLocation(gl, program, "u_step"), step);
  gl.uniform1f(uniformLocation(gl, program, "u_tolerance"), tolerance);
  gl.uniform1i(uniformLocation(gl, program, "u_ditherProtectionEnabled"), ditherProtection?.ditherProtectionEnabled ? 1 : 0);
  gl.uniform1i(uniformLocation(gl, program, "u_ditherKnown"), ditherProtection?.ditherKnown ? 1 : 0);
  gl.uniform1i(uniformLocation(gl, program, "u_ditherPattern"), Math.round(Number(ditherProtection?.ditherPattern) || 0));
  gl.uniform1f(uniformLocation(gl, program, "u_ditherScale"), Math.max(1, Number(ditherProtection?.ditherScale) || 1));
  gl.uniform1f(uniformLocation(gl, program, "u_ditherAngle"), Number(ditherProtection?.ditherAngle) || 0);
}

function runDespecklePass(gl, program, {
  sourceTexture,
  width,
  height,
  texelSize,
  step,
  tolerance,
  ditherProtection
}) {
  gl.viewport(0, 0, width, height);
  bindCommonPostUniforms(gl, program, {sourceTexture, texelSize, step, tolerance, ditherProtection});
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function runEdgeTightenPass(gl, program, {
  sourceTexture,
  width,
  height,
  texelSize,
  step,
  tolerance,
  strength,
  ditherProtection
}) {
  gl.viewport(0, 0, width, height);
  bindCommonPostUniforms(gl, program, {sourceTexture, texelSize, step, tolerance, ditherProtection});
  gl.uniform1i(uniformLocation(gl, program, "u_strength"), Math.max(1, Math.min(2, Math.round(Number(strength) || 1))));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// Runs optional post-process passes against an input texture (the source-
// resolution palette output) using two ping-pong textures. Despeckle can run
// multiple iterations; edge tighten is deliberately one conservative pass after
// despeckle. Returns whichever texture holds the final result so the caller can
// sample it during the view-composite pass.
export function renderPostProcessPasses(gl, cache, {
  inputTexture,
  width,
  height,
  vertexSource,
  fragmentSource,
  edgeTightenFragmentSource,
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
  cache.edgeTightenProgram ||= {program: null};
  if (!cache.framebuffer) cache.framebuffer = gl.createFramebuffer();

  const forceRefresh = !!cache.dirty;
  const textureA = ensureTextureWithSize(gl, cache.textureA, safeWidth, safeHeight, {force: forceRefresh});
  const textureB = ensureTextureWithSize(gl, cache.textureB, safeWidth, safeHeight, {force: forceRefresh});
  cache.dirty = false;
  const despeckleIterations = settings?.despeckleEnabled ? Math.max(0, settings.despeckleStrength) : 0;
  const edgeTightenStrength = settings?.edgeTightenEnabled ? Math.max(0, settings.edgeTightenStrength) : 0;
  const ditherProtection = settings || {};

  let readTexture = inputTexture;
  let writeTexture = textureA;
  let other = textureB;

  if (despeckleIterations > 0) {
    const program = ensurePostProgram(gl, vertexSource, fragmentSource, cache.despeckleProgram, "despeckle shader failed");
    for (let i = 0; i < despeckleIterations; i++) {
      bindTargetFramebuffer(gl, cache.framebuffer, writeTexture);
      runDespecklePass(gl, program, {
        sourceTexture: readTexture,
        width: safeWidth,
        height: safeHeight,
        texelSize,
        step,
        tolerance: POST_DEFAULT_COLOR_TOLERANCE,
        ditherProtection
      });
      readTexture = writeTexture;
      const swap = writeTexture;
      writeTexture = other;
      other = swap;
    }
  }

  if (edgeTightenStrength > 0) {
    const program = ensurePostProgram(gl, vertexSource, edgeTightenFragmentSource, cache.edgeTightenProgram, "edge tighten shader failed");
    bindTargetFramebuffer(gl, cache.framebuffer, writeTexture);
    runEdgeTightenPass(gl, program, {
      sourceTexture: readTexture,
      width: safeWidth,
      height: safeHeight,
      texelSize,
      step,
      tolerance: POST_DEFAULT_COLOR_TOLERANCE,
      strength: edgeTightenStrength,
      ditherProtection
    });
    readTexture = writeTexture;
  }

  // When post-processing is disabled we simply return the input texture so the
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
  if (cache.edgeTightenProgram?.program) gl.deleteProgram(cache.edgeTightenProgram.program);
  cache.textureA = {texture: null, width: 0, height: 0};
  cache.textureB = {texture: null, width: 0, height: 0};
  cache.framebuffer = null;
  cache.despeckleProgram = {program: null};
  cache.edgeTightenProgram = {program: null};
  cache.dirty = true;
}
