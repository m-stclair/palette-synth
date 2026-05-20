import test from "node:test";
import assert from "node:assert/strict";
import { createLazyCanvasImageData } from "../src/runtime/lazy-image-data.js";

test("lazy canvas image data exposes dimensions without reading pixels", () => {
  let reads = 0;
  const full = {width: 4, height: 2, data: new Uint8ClampedArray(4 * 2 * 4)};
  const ctx = {
    canvas: {name: "source"},
    getImageData(x, y, width, height) {
      reads += 1;
      assert.deepEqual([x, y, width, height], [0, 0, 4, 2]);
      return full;
    }
  };

  const lazy = createLazyCanvasImageData(ctx, 4, 2, {version: 7});

  assert.equal(lazy.width, 4);
  assert.equal(lazy.height, 2);
  assert.equal(lazy.version, 7);
  assert.equal(lazy.canvas, ctx.canvas);
  assert.equal(lazy.materialized, false);
  assert.equal(reads, 0);
});

test("lazy canvas image data materializes once when pixel data is requested", () => {
  let reads = 0;
  const data = new Uint8ClampedArray([1, 2, 3, 255]);
  const full = {width: 1, height: 1, data};
  const ctx = {
    getImageData() {
      reads += 1;
      return full;
    }
  };

  const lazy = createLazyCanvasImageData(ctx, 1, 1);

  assert.equal(lazy.data, data);
  assert.equal(lazy.getFullImageData(), full);
  assert.equal(lazy.data, data);
  assert.equal(lazy.materialized, true);
  assert.equal(reads, 1);
});

test("lazy canvas image data caches named sample computations separately from full readback", () => {
  let reads = 0;
  let sampleComputes = 0;
  const ctx = {
    getImageData() {
      reads += 1;
      return {width: 1, height: 1, data: new Uint8ClampedArray([1, 2, 3, 255])};
    }
  };
  const lazy = createLazyCanvasImageData(ctx, 1, 1);

  const first = lazy.getCachedSample("sample:a", () => {
    sampleComputes += 1;
    return ["cached"];
  });
  const second = lazy.getCachedSample("sample:a", () => {
    sampleComputes += 1;
    return ["miss"];
  });

  assert.equal(first, second);
  assert.deepEqual(first, ["cached"]);
  assert.equal(sampleComputes, 1);
  assert.equal(reads, 0);
  assert.equal(lazy.materialized, false);

  assert.equal(lazy.data[0], 1);
  assert.equal(reads, 1);
});

test("lazy canvas image data can clear cached samples without clearing materialized pixels", () => {
  let reads = 0;
  const ctx = {
    getImageData() {
      reads += 1;
      return {width: 1, height: 1, data: new Uint8ClampedArray([9, 8, 7, 255])};
    }
  };
  const lazy = createLazyCanvasImageData(ctx, 1, 1);
  let computes = 0;

  lazy.getCachedSample("sample:a", () => ++computes);
  lazy.getCachedSample("sample:a", () => ++computes);
  assert.equal(computes, 1);
  assert.equal(lazy.sampleCacheSize, 1);

  assert.equal(lazy.data[0], 9);
  lazy.clearSampleCache();
  assert.equal(lazy.sampleCacheSize, 0);
  assert.equal(lazy.data[1], 8);
  assert.equal(reads, 1);

  lazy.getCachedSample("sample:a", () => ++computes);
  assert.equal(computes, 2);
});
