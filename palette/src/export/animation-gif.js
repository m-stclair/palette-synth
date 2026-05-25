import { GIFEncoder, applyPalette, quantize } from "../vendor/gifenc.js";
import { downloadBlob, nextAnimationFrame } from "./downloads.js";

const GIF_MIME = "image/gif";
const MAX_GIF_COLORS = 256;

function paletteColorDepth(palette) {
  return Math.max(2, Math.min(8, Math.ceil(Math.log2(Math.max(2, palette.length || 2)))));
}

function canvasToRgba(canvas, documentRef = globalThis.document) {
  if (!canvas?.width || !canvas?.height) {
    throw new Error("Animation frame canvas is empty.");
  }

  if (!documentRef?.createElement) {
    throw new Error("Document is required for GIF export.");
  }

  const scratch = documentRef.createElement("canvas");
  scratch.width = canvas.width;
  scratch.height = canvas.height;
  const ctx = scratch.getContext("2d", {willReadFrequently: true});
  if (!ctx) throw new Error("2D canvas is required for GIF export.");
  ctx.drawImage(canvas, 0, 0);
  const imageData = ctx.getImageData(0, 0, scratch.width, scratch.height);
  return new Uint8Array(imageData.data);
}

function encodeGifFrame(encoder, canvas, {delay, documentRef}) {
  if (!canvas) throw new Error("Animation frame render returned no canvas.");
  const rgba = canvasToRgba(canvas, documentRef);
  const palette = quantize(rgba, MAX_GIF_COLORS, {format: "rgb565"});
  const index = applyPalette(rgba, palette, "rgb565");
  encoder.writeFrame(index, canvas.width, canvas.height, {
    palette,
    delay,
    repeat: 0,
    colorDepth: paletteColorDepth(palette)
  });
}

export async function downloadAnimationGif({
  plan,
  renderFrameCanvas,
  onProgress = () => {},
  documentRef = globalThis.document,
  downloadBlobFn = downloadBlob
}) {
  const encoder = GIFEncoder();
  const delay = 1000 / Math.max(1, Number(plan.fps) || 1);

  for (const frame of plan.frames) {
    onProgress(frame, plan.frames.length);
    // Let the status text paint before render/quantize starts. GIF quantization
    // is CPU-heavy enough that otherwise the button can look inert on real images.
    await nextAnimationFrame();
    const canvas = renderFrameCanvas(frame);
    await nextAnimationFrame();
    encodeGifFrame(encoder, canvas, {delay, documentRef});
    await nextAnimationFrame();
  }

  encoder.finish();
  const blob = new Blob([encoder.bytes()], {type: GIF_MIME});
  const downloaded = downloadBlobFn(blob, `${plan.prefix}.gif`);
  if (downloaded === false) throw new Error("Browser did not start the GIF download.");
  return blob.size;
}
