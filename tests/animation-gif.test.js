import test from "node:test";
import assert from "node:assert/strict";
import { downloadAnimationGif } from "../src/export/animation-gif.js";

function makeDocumentRef() {
  return {
    createElement(name) {
      assert.equal(name, "canvas");
      let drawn = null;
      return {
        width: 0,
        height: 0,
        getContext(type) {
          assert.equal(type, "2d");
          return {
            drawImage(canvas) {
              drawn = canvas;
            },
            getImageData(_x, _y, width, height) {
              assert.equal(width, drawn.width);
              assert.equal(height, drawn.height);
              return {data: drawn.pixels};
            }
          };
        }
      };
    }
  };
}

function makeCanvas(pixels) {
  return {
    width: 2,
    height: 1,
    pixels: new Uint8ClampedArray(pixels)
  };
}

test("animated GIF export renders, encodes, and downloads a GIF", async () => {
  const originalRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = callback => {
    callback();
    return 1;
  };

  try {
    const frames = [
      {index: 0, cycleOffset: 0},
      {index: 1, cycleOffset: 1}
    ];
    const canvases = [
      makeCanvas([255, 0, 0, 255, 0, 255, 0, 255]),
      makeCanvas([0, 0, 255, 255, 255, 255, 0, 255])
    ];
    const progress = [];
    const downloads = [];

    const size = await downloadAnimationGif({
      plan: {prefix: "demo", fps: 10, frames},
      renderFrameCanvas: frame => canvases[frame.index],
      onProgress: (frame, total) => progress.push([frame.index, total]),
      documentRef: makeDocumentRef(),
      downloadBlobFn: (blob, filename) => downloads.push([blob, filename])
    });

    assert.deepEqual(progress, [[0, 2], [1, 2]]);
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0][1], "demo.gif");
    assert.equal(downloads[0][0].type, "image/gif");
    assert.equal(size, downloads[0][0].size);

    const bytes = new Uint8Array(await downloads[0][0].arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    assert.equal(text.slice(0, 6), "GIF89a");
    assert.equal(bytes.at(-1), 0x3b);
    assert.equal(text.includes("NETSCAPE2.0"), true);
    assert.equal(bytes.filter(byte => byte === 0x2c).length >= 2, true);
  } finally {
    globalThis.requestAnimationFrame = originalRaf;
  }
});
