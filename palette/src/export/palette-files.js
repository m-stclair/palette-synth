import { formatPaletteExport } from "../palette-export.js";
import { downloadBlob, downloadCanvasAsPng } from "./downloads.js";

export async function downloadPalettePng(hexes, {
  filename = "palette-synth-lut.png",
  scale = 32
} = {}) {
  const colors = Array.isArray(hexes) ? hexes : [];
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, colors.length) * scale;
  canvas.height = scale;
  const ctx = canvas.getContext("2d");
  colors.forEach((hex, i) => {
    ctx.fillStyle = hex;
    ctx.fillRect(i * scale, 0, scale, scale);
  });
  await downloadCanvasAsPng(canvas, filename);
}

export async function downloadPaletteExport(format, hexes, {
  filenameBase = "palette-synth-palette",
  pngFilename = "palette-synth-lut.png"
} = {}) {
  if (format === "png") {
    await downloadPalettePng(hexes, {filename: pngFilename});
    return;
  }

  const exportData = formatPaletteExport(format, hexes);
  if (!exportData) {
    await downloadPalettePng(hexes, {filename: pngFilename});
    return;
  }

  downloadBlob(
    new Blob([exportData.body], {type: exportData.mime}),
    `${filenameBase}.${exportData.extension}`
  );
}
