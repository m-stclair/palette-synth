export function downloadBlob(blob, filename) {
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function canvasToBlob(canvas, type = "image/png", quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Canvas export returned no data.")), type, quality);
  });
}

export async function downloadCanvasAsPng(canvas, filename) {
  const blob = await canvasToBlob(canvas, "image/png");
  downloadBlob(blob, filename);
}

export function downloadJson(data, filename) {
  const json = JSON.stringify(data, null, 2);
  downloadBlob(new Blob([json], {type: "application/json"}), filename);
}

export function nextAnimationFrame() {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}
