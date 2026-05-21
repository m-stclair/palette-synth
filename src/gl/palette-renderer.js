import { MAX_PALETTE_SIZE } from "../constants.js";

export function renderPalettePass(gl, program, {
  texture,
  maskTexture = null,
  maskEnabled = false,
  maskBehavior = 1,
  maskForbiddenSourceFlags = null,
  viewport,
  resolution,
  viewportOrigin,
  viewCenter,
  viewSpan,
  sourceImageSize,
  blockSampledInput = false,
  paletteBlock,
  paletteFeatures,
  paletteBaseBlock = paletteBlock,
  paletteSourceIndices,
  paletteSize,
  visiblePaletteSize,
  cycleOffset,
  manualCycleEnabled = false,
  diagnosticOverlayMode = "none",
  diagnosticOverlaySwatch = -1,
  compareEnabled = false,
  compareSplit = -1,
  settings = {}
}) {
  const forbiddenFlags = maskForbiddenSourceFlags instanceof Int32Array
    ? maskForbiddenSourceFlags
    : new Int32Array(MAX_PALETTE_SIZE);

  gl.useProgram(program);
  gl.viewport(viewport.x, viewport.y, viewport.w, viewport.h);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(gl.getUniformLocation(program, "u_image"), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, maskTexture);
  gl.uniform1i(gl.getUniformLocation(program, "u_mask"), 1);
  gl.uniform1i(gl.getUniformLocation(program, "u_maskEnabled"), maskEnabled && maskTexture ? 1 : 0);
  gl.uniform1i(gl.getUniformLocation(program, "u_maskBehavior"), Math.max(0, Math.round(Number(maskBehavior) || 0)));
  gl.uniform1iv(gl.getUniformLocation(program, "u_maskForbiddenSourceFlags[0]"), forbiddenFlags);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), resolution[0], resolution[1]);
  gl.uniform2f(gl.getUniformLocation(program, "u_viewportOrigin"), viewportOrigin[0], viewportOrigin[1]);
  gl.uniform2f(gl.getUniformLocation(program, "u_viewCenter"), viewCenter[0], viewCenter[1]);
  gl.uniform2f(gl.getUniformLocation(program, "u_viewSpan"), viewSpan[0], viewSpan[1]);
  const sourceWidth = Math.max(1, Number(sourceImageSize?.[0]) || 1);
  const sourceHeight = Math.max(1, Number(sourceImageSize?.[1]) || 1);
  gl.uniform2f(gl.getUniformLocation(program, "u_sourceImageSize"), sourceWidth, sourceHeight);
  gl.uniform1i(gl.getUniformLocation(program, "u_blockSampledInput"), blockSampledInput ? 1 : 0);
  gl.uniform4fv(gl.getUniformLocation(program, "paletteColors[0]"), paletteBlock);
  gl.uniform4fv(gl.getUniformLocation(program, "paletteBaseColors[0]"), paletteBaseBlock || paletteBlock);
  gl.uniform4fv(gl.getUniformLocation(program, "paletteFeatures[0]"), paletteFeatures);
  if (paletteSourceIndices) gl.uniform1iv(gl.getUniformLocation(program, "paletteSourceIndices[0]"), paletteSourceIndices);
  gl.uniform1i(gl.getUniformLocation(program, "u_paletteSize"), paletteSize);
  gl.uniform1i(gl.getUniformLocation(program, "u_visiblePaletteSize"), visiblePaletteSize);
  gl.uniform1i(gl.getUniformLocation(program, "u_cycleOffset"), Math.max(0, Math.round(Number(cycleOffset) || 0)));
  gl.uniform1i(gl.getUniformLocation(program, "u_manualCycleEnabled"), manualCycleEnabled ? 1 : 0);
  gl.uniform1i(gl.getUniformLocation(program, "u_blendK"), Math.round(settings.blendK));
  gl.uniform1f(gl.getUniformLocation(program, "u_softness"), Number(settings.softness));
  gl.uniform1f(gl.getUniformLocation(program, "u_lumaWeight"), Math.max(0, Number(settings.lumaWeight)));
  gl.uniform1f(gl.getUniformLocation(program, "u_chromaWeight"), Math.max(0, Number(settings.chromaWeight)));
  gl.uniform1f(gl.getUniformLocation(program, "u_hueWeight"), Math.max(0, Number(settings.hueWeight)));
  gl.uniform1i(gl.getUniformLocation(program, "u_maxDistanceEnabled"), settings.maxDistanceEnabled ? 1 : 0);
  gl.uniform1f(gl.getUniformLocation(program, "u_maxDistance"), Math.max(0, Number(settings.maxDistance) || 0));
  gl.uniform1f(gl.getUniformLocation(program, "u_blendAmount"), Number(settings.blendAmount));
  gl.uniform1f(gl.getUniformLocation(program, "u_shadowCutoff"), Number(settings.shadowCutoff));
  gl.uniform1f(gl.getUniformLocation(program, "u_highlightCutoff"), Number(settings.highlightCutoff));
  gl.uniform1f(gl.getUniformLocation(program, "u_ditherScale"), Number(settings.ditherScale));
  gl.uniform1f(gl.getUniformLocation(program, "u_ditherAngle"), Number(settings.ditherAngle));
  gl.uniform1f(gl.getUniformLocation(program, "u_ditherLumaAmount"), Number(settings.ditherLumaAmount));
  gl.uniform1f(gl.getUniformLocation(program, "u_pixelBlockSize"), Math.max(1, Number(settings.pixelBlockSize) || 1));
  const overlayCode = diagnosticOverlayMode === "swatch" ? 1 : (diagnosticOverlayMode === "difference" ? 2 : 0);
  const overlaySwatch = Number(diagnosticOverlaySwatch);
  gl.uniform1i(gl.getUniformLocation(program, "u_diagnosticOverlayMode"), overlayCode);
  gl.uniform1i(gl.getUniformLocation(program, "u_diagnosticOverlaySwatch"), Number.isFinite(overlaySwatch) ? Math.round(overlaySwatch) : -1);
  gl.uniform1f(gl.getUniformLocation(program, "u_compareSplit"), Number.isFinite(compareSplit) ? compareSplit : -1);
  gl.uniform1i(gl.getUniformLocation(program, "u_compareEnabled"), compareEnabled ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
