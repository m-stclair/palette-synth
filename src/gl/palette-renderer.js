import { MAX_PALETTE_SIZE } from "../constants.js";
import { uniformArrayLocation, uniformLocation } from "./uniforms.js";

export function renderPalettePass(gl, program, {
  texture,
  maskTexture = null,
  sourceAnalysisTexture = null,
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
  diagnosticOverlaySwatch = -1,
  diagnosticOverlayHistogramMin = 0,
  diagnosticOverlayHistogramMax = 0,
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
  gl.uniform1i(uniformLocation(gl, program, "u_image"), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, maskTexture);
  gl.uniform1i(uniformLocation(gl, program, "u_mask"), 1);
  if (sourceAnalysisTexture) {
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, sourceAnalysisTexture);
    gl.uniform1i(uniformLocation(gl, program, "u_sourceAnalysis"), 2);
    gl.activeTexture(gl.TEXTURE0);
  }
  gl.uniform1i(uniformLocation(gl, program, "u_maskEnabled"), maskEnabled && maskTexture ? 1 : 0);
  gl.uniform1i(uniformLocation(gl, program, "u_maskBehavior"), Math.max(0, Math.round(Number(maskBehavior) || 0)));
  gl.uniform1iv(uniformArrayLocation(gl, program, "u_maskForbiddenSourceFlags"), forbiddenFlags);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform2f(uniformLocation(gl, program, "u_resolution"), resolution[0], resolution[1]);
  gl.uniform2f(uniformLocation(gl, program, "u_viewportOrigin"), viewportOrigin[0], viewportOrigin[1]);
  gl.uniform2f(uniformLocation(gl, program, "u_viewCenter"), viewCenter[0], viewCenter[1]);
  gl.uniform2f(uniformLocation(gl, program, "u_viewSpan"), viewSpan[0], viewSpan[1]);
  const sourceWidth = Math.max(1, Number(sourceImageSize?.[0]) || 1);
  const sourceHeight = Math.max(1, Number(sourceImageSize?.[1]) || 1);
  gl.uniform2f(uniformLocation(gl, program, "u_sourceImageSize"), sourceWidth, sourceHeight);
  gl.uniform1i(uniformLocation(gl, program, "u_blockSampledInput"), blockSampledInput ? 1 : 0);
  gl.uniform4fv(uniformArrayLocation(gl, program, "paletteColors"), paletteBlock);
  gl.uniform4fv(uniformArrayLocation(gl, program, "paletteBaseColors"), paletteBaseBlock || paletteBlock);
  gl.uniform4fv(uniformArrayLocation(gl, program, "paletteFeatures"), paletteFeatures);
  if (paletteSourceIndices) gl.uniform1iv(uniformArrayLocation(gl, program, "paletteSourceIndices"), paletteSourceIndices);
  gl.uniform1i(uniformLocation(gl, program, "u_paletteSize"), paletteSize);
  gl.uniform1i(uniformLocation(gl, program, "u_visiblePaletteSize"), visiblePaletteSize);
  gl.uniform1i(uniformLocation(gl, program, "u_cycleOffset"), Math.max(0, Math.round(Number(cycleOffset) || 0)));
  gl.uniform1i(uniformLocation(gl, program, "u_manualCycleEnabled"), manualCycleEnabled ? 1 : 0);
  gl.uniform1i(uniformLocation(gl, program, "u_blendK"), Math.round(settings.blendK));
  gl.uniform1f(uniformLocation(gl, program, "u_softness"), Number(settings.softness));
  gl.uniform1f(uniformLocation(gl, program, "u_lumaWeight"), Math.max(0, Number(settings.lumaWeight)));
  gl.uniform1f(uniformLocation(gl, program, "u_chromaWeight"), Math.max(0, Number(settings.chromaWeight)));
  gl.uniform1f(uniformLocation(gl, program, "u_hueWeight"), Math.max(0, Number(settings.hueWeight)));
  gl.uniform1i(uniformLocation(gl, program, "u_maxDistanceEnabled"), settings.maxDistanceEnabled ? 1 : 0);
  gl.uniform1f(uniformLocation(gl, program, "u_maxDistance"), Math.max(0, Number(settings.maxDistance) || 0));
  gl.uniform1f(uniformLocation(gl, program, "u_maxDistanceSoftness"), Math.max(0, Number(settings.maxDistanceSoftness) || 0));
  gl.uniform1f(uniformLocation(gl, program, "u_blendAmount"), Number(settings.blendAmount));
  gl.uniform1f(uniformLocation(gl, program, "u_shadowCutoff"), Number(settings.shadowCutoff));
  gl.uniform1f(uniformLocation(gl, program, "u_highlightCutoff"), Number(settings.highlightCutoff));
  gl.uniform1f(uniformLocation(gl, program, "u_ditherScale"), Number(settings.ditherScale));
  gl.uniform1f(uniformLocation(gl, program, "u_ditherAngle"), Number(settings.ditherAngle));
  gl.uniform1f(uniformLocation(gl, program, "u_ditherLumaAmount"), Number(settings.ditherLumaAmount));
  gl.uniform1f(uniformLocation(gl, program, "u_ditherSourceGuardAmount"), Math.max(0, Math.min(1, Number(settings.ditherSourceGuardAmount) || 0)));
  gl.uniform1f(uniformLocation(gl, program, "u_ditherSourceGuardMinGain"), Math.max(0, Number(settings.ditherSourceGuardMinGain) || 0));
  gl.uniform1f(uniformLocation(gl, program, "u_ditherSourceGuardFlatThreshold"), Math.max(0.001, Number(settings.ditherSourceGuardFlatThreshold) || 0.001));
  gl.uniform1i(uniformLocation(gl, program, "u_pixelArtEnabled"), settings.pixelArtEnabled ? 1 : 0);
  gl.uniform1f(uniformLocation(gl, program, "u_pixelBlockSize"), Math.max(1, Number(settings.pixelBlockSize) || 1));
  const overlaySwatch = Number(diagnosticOverlaySwatch);
  const overlayHistogramMin = Number(diagnosticOverlayHistogramMin);
  const overlayHistogramMax = Number(diagnosticOverlayHistogramMax);
  gl.uniform1i(uniformLocation(gl, program, "u_diagnosticOverlaySwatch"), Number.isFinite(overlaySwatch) ? Math.round(overlaySwatch) : -1);
  gl.uniform1f(uniformLocation(gl, program, "u_diagnosticOverlayHistogramMin"), Number.isFinite(overlayHistogramMin) ? overlayHistogramMin : 0);
  gl.uniform1f(uniformLocation(gl, program, "u_diagnosticOverlayHistogramMax"), Number.isFinite(overlayHistogramMax) ? overlayHistogramMax : 0);
  gl.uniform1f(uniformLocation(gl, program, "u_compareSplit"), Number.isFinite(compareSplit) ? compareSplit : -1);
  gl.uniform1i(uniformLocation(gl, program, "u_compareEnabled"), compareEnabled ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
