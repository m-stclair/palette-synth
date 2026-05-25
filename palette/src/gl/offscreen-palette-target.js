import { configureTexture, createTexture } from "./textures.js";

// Manages a single GPU-side cache of <framebuffer + colour texture> sized to
// the source image. The palette shader writes into the texture using its
// existing render path with view = identity and no diagnostic overlay; the
// post-process and/or view-composite renderer then reads from that texture.

export function ensureOffscreenPaletteTarget(gl, cache, width, height) {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));

  if (!cache.framebuffer) cache.framebuffer = gl.createFramebuffer();
  if (!cache.texture) cache.texture = createTexture(gl);

  gl.bindTexture(gl.TEXTURE_2D, cache.texture);
  configureTexture(gl, cache.texture, {filter: gl.NEAREST});
  if (cache.dirty || cache.width !== safeWidth || cache.height !== safeHeight) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, safeWidth, safeHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    cache.width = safeWidth;
    cache.height = safeHeight;
    cache.dirty = false;
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, cache.framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, cache.texture, 0);

  return {
    framebuffer: cache.framebuffer,
    texture: cache.texture,
    width: safeWidth,
    height: safeHeight
  };
}

export function disposeOffscreenPaletteTarget(gl, cache = {}) {
  if (!gl || !cache) return;
  if (cache.framebuffer) gl.deleteFramebuffer(cache.framebuffer);
  if (cache.texture) gl.deleteTexture(cache.texture);
  cache.framebuffer = null;
  cache.texture = null;
  cache.width = 0;
  cache.height = 0;
  cache.dirty = true;
}
