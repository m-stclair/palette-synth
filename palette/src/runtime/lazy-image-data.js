const SAMPLE_CACHE_LIMIT = 32;

function rememberSample(cache, key, value) {
  if (cache.size >= SAMPLE_CACHE_LIMIT && !cache.has(key)) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(key, value);
  return value;
}

export function createLazyCanvasImageData(ctx, width, height, options = {}) {
  if (!ctx || typeof ctx.getImageData !== "function") {
    throw new TypeError("createLazyCanvasImageData requires a 2D canvas context with getImageData().");
  }
  const safeWidth = Math.max(0, Math.round(Number(width) || 0));
  const safeHeight = Math.max(0, Math.round(Number(height) || 0));
  const sampleCache = new Map();
  let imageData = null;

  const source = {
    width: safeWidth,
    height: safeHeight,
    canvas: options.canvas || ctx.canvas || null,
    ctx,
    version: options.version ?? 0,
    get materialized() {
      return !!imageData;
    },
    get sampleCacheSize() {
      return sampleCache.size;
    },
    getFullImageData() {
      if (!imageData) imageData = ctx.getImageData(0, 0, safeWidth, safeHeight);
      return imageData;
    },
    getCachedSample(key, producer) {
      const cacheKey = String(key || "");
      if (!cacheKey) return producer?.();
      if (sampleCache.has(cacheKey)) return sampleCache.get(cacheKey);
      return rememberSample(sampleCache, cacheKey, producer?.());
    },
    clearSampleCache() {
      sampleCache.clear();
    },
    get data() {
      return source.getFullImageData().data;
    }
  };

  return source;
}
