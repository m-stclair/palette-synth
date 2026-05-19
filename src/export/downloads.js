export function downloadBlob(blob, filename, documentRef = globalThis.document, urlRef = globalThis.URL) {
  if (!blob) return false;
  if (!documentRef?.createElement || !urlRef?.createObjectURL) {
    throw new Error("Browser download APIs are unavailable.");
  }

  const url = urlRef.createObjectURL(blob);
  const a = documentRef.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";

  // Some browsers are fussy about synthetic clicks on detached anchors,
  // especially after a long async export. Keep the link in the document for
  // the click, then clean it up immediately after.
  const parent = documentRef.body || documentRef.documentElement;
  parent?.appendChild(a);
  a.click();
  a.remove?.();

  setTimeout(() => urlRef.revokeObjectURL(url), 1000);
  return true;
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
  const raf = globalThis.requestAnimationFrame || globalThis.window?.requestAnimationFrame;
  if (raf) return new Promise(resolve => raf(() => resolve()));
  return new Promise(resolve => setTimeout(resolve, 0));
}
