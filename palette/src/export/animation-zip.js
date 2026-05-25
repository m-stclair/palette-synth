import { createStoredZipBlob } from "../zip-store.js";
import { canvasToBlob, downloadBlob, nextAnimationFrame } from "./downloads.js";

export function sanitizeExportPrefix(value, fallback = "palette-synth-frame") {
  return String(value || fallback)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}

export function animationLoopSpan(records, step, {cyclePeriod, gcdInt}) {
  const period = cyclePeriod(records);
  const stride = Math.max(1, Math.abs(Math.round(Number(step) || 1)));
  if (period <= 1) return 1;
  return Math.max(1, period / gcdInt(period, stride));
}

export function buildAnimationFramePlan(settings, {positiveMod}) {
  const merged = {...settings};
  const frames = [];
  for (let i = 0; i < merged.frameCount; i++) {
    const cycleOffset = merged.period > 1
      ? positiveMod(merged.startOffset + i * merged.step, merged.period)
      : 0;
    frames.push({index: i, cycleOffset, filename: `${merged.prefix}_${String(i + 1).padStart(4, "0")}.png`});
  }
  return {
    ...merged,
    frames
  };
}

export async function downloadAnimationPngZip({
  plan,
  renderFrameCanvas,
  manifest,
  onProgress = () => {}
}) {
  const entries = [];
  const now = new Date();

  for (const frame of plan.frames) {
    onProgress(frame, plan.frames.length);
    const canvas = renderFrameCanvas(frame);
    const blob = await canvasToBlob(canvas, "image/png");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    entries.push({name: frame.filename, data: bytes, lastModified: now});
    await nextAnimationFrame();
  }

  entries.push({
    name: `${plan.prefix}_manifest.json`,
    data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
    lastModified: now
  });

  const zipBlob = createStoredZipBlob(entries);
  downloadBlob(zipBlob, `${plan.prefix}.zip`);
  return entries.length;
}
