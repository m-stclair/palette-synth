import { buildStaticProgram } from "./programs.js";

// Final viewport pass used for post-processing and before/after compare.
// The composite program samples a source-resolution paletted texture, applies
// the view transform, and draws the compare split overlay when enabled.

export function ensureViewCompositeProgram(gl, cache, {vertexSource, fragmentSource}) {
  return buildStaticProgram(gl, cache, {
    vertexSource,
    fragmentSource,
    linkErrorMessage: "view composite shader failed"
  });
}

export function renderViewComposite(gl, program, {
  processedTexture,
  sourceTexture,
  viewport,
  resolution,
  viewportOrigin,
  viewCenter,
  viewSpan,
  compareSplit,
  compareEnabled
}) {
  gl.useProgram(program);
  gl.viewport(viewport.x, viewport.y, viewport.w, viewport.h);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, processedTexture);
  gl.uniform1i(gl.getUniformLocation(program, "u_image"), 0);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, sourceTexture || processedTexture);
  gl.uniform1i(gl.getUniformLocation(program, "u_source"), 1);

  gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), resolution[0], resolution[1]);
  gl.uniform2f(gl.getUniformLocation(program, "u_viewportOrigin"), viewportOrigin[0], viewportOrigin[1]);
  gl.uniform2f(gl.getUniformLocation(program, "u_viewCenter"), viewCenter[0], viewCenter[1]);
  gl.uniform2f(gl.getUniformLocation(program, "u_viewSpan"), viewSpan[0], viewSpan[1]);
  gl.uniform1f(gl.getUniformLocation(program, "u_compareSplit"), Number.isFinite(compareSplit) ? compareSplit : -1);
  gl.uniform1i(gl.getUniformLocation(program, "u_compareEnabled"), compareEnabled ? 1 : 0);

  gl.drawArrays(gl.TRIANGLES, 0, 3);

  // Restore texture-unit 0 as the active unit and unbind the source texture
  // we attached to unit 1 so subsequent renderers find a clean state.
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.activeTexture(gl.TEXTURE0);
}

export function disposeViewCompositeCache(gl, cache = {}) {
  if (!gl || !cache) return;
  if (cache.program) gl.deleteProgram(cache.program);
  cache.program = null;
  cache.programKey = "";
}
