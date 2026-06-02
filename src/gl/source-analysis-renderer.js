import { configureTexture, createTexture } from "./textures.js";
import { uniformLocation } from "./uniforms.js";

export function sourceAnalysisTextureSize(sourceWidth, sourceHeight) {
  return {
    width: Math.max(1, Math.round(Number(sourceWidth) || 1)),
    height: Math.max(1, Math.round(Number(sourceHeight) || 1))
  };
}

export function disposeSourceAnalysisCache(gl, cache = {}) {
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
  cache.sourceTexture = null;
  cache.gl = null;
  cache.dirty = true;
}

export function renderSourceAnalysisPass(gl, program, {
  sourceTexture,
  targetTexture,
  framebuffer,
  sourceSize
}) {
  const width = Math.max(1, Math.round(Number(sourceSize?.[0] ?? sourceSize?.width) || 1));
  const height = Math.max(1, Math.round(Number(sourceSize?.[1] ?? sourceSize?.height) || 1));
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
    gl.uniform1i(uniformLocation(gl, program, "u_image"), 0);
    gl.uniform2i(uniformLocation(gl, program, "u_sourceSize"), width, height);
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
