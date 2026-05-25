import { clamp, rgb8ToLab, seededRandom } from "../color-utils.js";

export function normalizeSampleRegion(region, width, height) {
  const imageW = Math.max(1, Math.round(width));
  const imageH = Math.max(1, Math.round(height));
  if (!region) return {x: 0, y: 0, width: imageW, height: imageH};
  const x = clamp(Math.floor(Number(region.x) || 0), 0, imageW - 1);
  const y = clamp(Math.floor(Number(region.y) || 0), 0, imageH - 1);
  const regionW = clamp(Math.round(Number(region.width) || 1), 1, imageW - x);
  const regionH = clamp(Math.round(Number(region.height) || 1), 1, imageH - y);
  return {x, y, width: regionW, height: regionH};
}

export function buildPatchOrigins(sampleCount, width, height, seed, samplingMode = "random", region = null) {
  const rng = seededRandom(seed);
  const area = normalizeSampleRegion(region, width, height);
  if (samplingMode !== "stratified") {
    return Array.from({length: sampleCount}, () => [
      Math.min(area.x + rng() * area.width, width - 1),
      Math.min(area.y + rng() * area.height, height - 1)
    ]);
  }
  const aspect = Math.max(area.width, 1) / Math.max(area.height, 1);
  let cols = Math.max(1, Math.round(Math.sqrt(sampleCount * aspect)));
  let rows = Math.max(1, Math.ceil(sampleCount / cols));
  while (cols * rows < sampleCount) {
    if ((cols / rows) < aspect) cols += 1;
    else rows += 1;
  }
  const cellW = area.width / cols;
  const cellH = area.height / rows;
  const origins = [];
  for (let i = 0; i < sampleCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    origins.push([
      Math.min(area.x + (col + rng()) * cellW, width - 1),
      Math.min(area.y + (row + rng()) * cellH, height - 1)
    ]);
  }
  return origins;
}

function sampleRegionKey(region) {
  return region
    ? `${region.x},${region.y},${region.width},${region.height}`
    : "all";
}

export function paletteSampleCacheKey({sampleCount, width, height, seed, samplingMode = "random", region = null, blockSize = 1} = {}) {
  return [
    "palette-samples-v1",
    Math.max(0, Math.round(Number(width) || 0)),
    Math.max(0, Math.round(Number(height) || 0)),
    Math.max(0, Math.round(Number(sampleCount) || 0)),
    Number(seed) || 0,
    samplingMode || "random",
    sampleRegionKey(region),
    Math.max(1, Math.round(Number(blockSize) || 1))
  ].join(":");
}

export function blockSampleLab(imageData, width, height, origins, blockSize) {
  const data = imageData.data;
  const out = [];
  const k = Math.max(1, Math.round(blockSize));
  for (const [ox, oy] of origins) {
    const baseX = Math.floor(ox);
    const baseY = Math.floor(oy);
    let L = 0, a = 0, b = 0, n = 0;
    for (let dy = 0; dy < k; dy++) {
      for (let dx = 0; dx < k; dx++) {
        const x = clamp(baseX + dx, 0, width - 1);
        const y = clamp(baseY + dy, 0, height - 1);
        const idx = (y * width + x) * 4;
        const lab = rgb8ToLab(data[idx], data[idx + 1], data[idx + 2]);
        L += lab[0];
        a += lab[1];
        b += lab[2];
        n++;
      }
    }
    out.push([L / n, a / n, b / n]);
  }
  return out;
}

export function samplePaletteLabs(imageData, width, height, origins, blockSize, cacheKey = "") {
  const producer = () => blockSampleLab(imageData, width, height, origins, blockSize);
  if (cacheKey && typeof imageData?.getCachedSample === "function") {
    return imageData.getCachedSample(cacheKey, producer);
  }
  return producer();
}
