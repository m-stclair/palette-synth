import { configureTexture } from "./textures.js";

export const BLOCK_SAMPLE_MODE = Object.freeze({
  center: 0,
  mean: 1,
  representative: 2
});

export function blockSampleModeCode(mode) {
  return BLOCK_SAMPLE_MODE[mode] ?? BLOCK_SAMPLE_MODE.center;
}

export function blockSamplePassNeeded(settings = {}) {
  const blockSize = Math.max(1, Math.round(Number(settings.pixelBlockSize) || 1));
  return blockSize > 1 && blockSampleModeCode(settings.pixelBlockSampleMode) !== BLOCK_SAMPLE_MODE.center;
}

export function blockSampleTextureSize(sourceWidth, sourceHeight, blockSize) {
  const safeBlockSize = Math.max(1, Math.round(Number(blockSize) || 1));
  return {
    width: Math.max(1, Math.ceil(Math.max(1, Math.round(Number(sourceWidth) || 1)) / safeBlockSize)),
    height: Math.max(1, Math.ceil(Math.max(1, Math.round(Number(sourceHeight) || 1)) / safeBlockSize))
  };
}

export function disposeBlockSampleCache(gl, cache = {}) {
  if (!gl || !cache) return;
  if (cache.texture) gl.deleteTexture(cache.texture);
  if (cache.framebuffer) gl.deleteFramebuffer(cache.framebuffer);
  if (cache.program) gl.deleteProgram(cache.program);
  cache.texture = null;
  cache.framebuffer = null;
  cache.program = null;
  cache.programKey = "";
  cache.width = 0;
  cache.height = 0;
  cache.blockSize = 0;
  cache.sampleMode = "";
  cache.dirty = true;
}

export function renderBlockSamplePass(gl, program, {
  sourceTexture,
  targetTexture,
  framebuffer,
  sourceSize,
  targetSize,
  blockSize,
  sampleMode = "center"
}) {
  const width = Math.max(1, Math.round(Number(targetSize?.width) || 1));
  const height = Math.max(1, Math.round(Number(targetSize?.height) || 1));
  const sourceWidth = Math.max(1, Math.round(Number(sourceSize?.[0] ?? sourceSize?.width) || 1));
  const sourceHeight = Math.max(1, Math.round(Number(sourceSize?.[1] ?? sourceSize?.height) || 1));
  const safeBlockSize = Math.max(1, Math.round(Number(blockSize) || 1));
  const previousFramebuffer = typeof gl.getParameter === "function"
    ? gl.getParameter(gl.FRAMEBUFFER_BINDING)
    : null;
  const previousActiveTexture = typeof gl.getParameter === "function" && gl.ACTIVE_TEXTURE !== undefined
    ? gl.getParameter(gl.ACTIVE_TEXTURE)
    : null;

  try {
    if (typeof gl.activeTexture === "function" && gl.TEXTURE0 !== undefined) {
      gl.activeTexture(gl.TEXTURE0);
    }
    gl.bindTexture(gl.TEXTURE_2D, targetTexture);
    configureTexture(gl, targetTexture, {filter: gl.NEAREST});
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, targetTexture, 0);

    gl.useProgram(program);
    gl.viewport(0, 0, width, height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.uniform1i(gl.getUniformLocation(program, "u_image"), 0);
    gl.uniform2i(gl.getUniformLocation(program, "u_sourceSize"), sourceWidth, sourceHeight);
    gl.uniform1i(gl.getUniformLocation(program, "u_blockSize"), safeBlockSize);
    gl.uniform1i(gl.getUniformLocation(program, "u_sampleMode"), blockSampleModeCode(sampleMode));
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    return targetTexture;
  } finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
    if (typeof gl.activeTexture === "function" && gl.TEXTURE0 !== undefined) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    if (previousActiveTexture !== null && typeof gl.activeTexture === "function") {
      gl.activeTexture(previousActiveTexture);
    }
  }
}
