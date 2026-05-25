import test from "node:test";
import assert from "node:assert/strict";
import {
  canvasRenderSize,
  clampedViewCenter,
  createViewportController,
  fitViewRect,
  imagePixelFromClientPoint,
  normalizePointerToRect,
  panCenterByClientDelta,
  viewSpan
} from "../src/ui/viewport.js";

function fakeCanvas(rect = {left: 0, top: 0, width: 200, height: 100}) {
  return {
    getBoundingClientRect() {
      return rect;
    }
  };
}

test("fitViewRect matches image fit and zoom rules", () => {
  assert.deepEqual(fitViewRect(1000, 500, 100, 100, 1), {x: 250, y: 0, w: 500, h: 500});
  assert.deepEqual(fitViewRect(1000, 500, 100, 100, 2), {x: 0, y: 0, w: 1000, h: 500});
  assert.deepEqual(fitViewRect(500, 1000, 1000, 500, 1), {x: 0, y: 375, w: 500, h: 250});
  assert.deepEqual(fitViewRect(500, 1000, 1000, 500, 2), {x: 0, y: 250, w: 500, h: 500});
});

test("viewSpan follows image/view aspect and clamps at full image", () => {
  assert.deepEqual(viewSpan(800, 400, 400, 200, 1), [1, 1]);
  assert.deepEqual(viewSpan(800, 400, 400, 200, 2), [0.5, 0.5]);
  assert.deepEqual(viewSpan(800, 200, 400, 200, 2), [1, 0.5]);
  assert.deepEqual(viewSpan(200, 800, 400, 200, 2), [0.5, 1]);
  assert.deepEqual(viewSpan(200, 800, 0, 0, 2), [1, 1]);
});

test("pure viewport helpers keep center and pixel math bounded", () => {
  assert.deepEqual(clampedViewCenter({centerX: -1, centerY: 2}, 0.5, 0.25), {
    centerX: 0.25,
    centerY: 0.875
  });

  assert.deepEqual(
    normalizePointerToRect(110, 20, {left: 10, top: 20, width: 200, height: 100}),
    {rect: {left: 10, top: 20, width: 200, height: 100}, nx: 0.5, ny: 0}
  );

  assert.deepEqual(
    normalizePointerToRect(110, 120, {left: 10, top: 20, width: 200, height: 100}),
    {rect: {left: 10, top: 20, width: 200, height: 100}, nx: 0.5, ny: 1}
  );

  assert.deepEqual(
    panCenterByClientDelta({centerX: 0.5, centerY: 0.5}, 20, 10, {width: 200, height: 100}, 0.5, 0.5),
    {centerX: 0.45, centerY: 0.45}
  );

  assert.deepEqual(
    imagePixelFromClientPoint({
      clientX: 110,
      clientY: 70,
      displayRect: {left: 10, top: 20, width: 200, height: 100},
      view: {centerX: 0.5, centerY: 0.5},
      spanX: 1,
      spanY: 1,
      imageWidth: 400,
      imageHeight: 200
    }),
    {x: 200, y: 100}
  );
});

test("canvasRenderSize uses css size, dpr, and source fallback", () => {
  assert.deepEqual(
    canvasRenderSize({canvas: fakeCanvas({left: 0, top: 0, width: 320, height: 180}), sourceCanvas: {width: 50, height: 40}, dpr: 2}),
    {width: 640, height: 360, dpr: 2, cssWidth: 320, cssHeight: 180}
  );

  assert.deepEqual(
    canvasRenderSize({canvas: fakeCanvas({left: 0, top: 0, width: 0, height: 0}), sourceCanvas: {width: 50, height: 40}, dpr: 2}),
    {width: 100, height: 80, dpr: 2, cssWidth: 50, cssHeight: 40}
  );
});

test("viewport controller caches canvas render size between layout changes", () => {
  let rectReads = 0;
  const state = {
    gl: null,
    sourceCanvas: {width: 400, height: 200},
    view: {zoom: 1, centerX: 0.5, centerY: 0.5}
  };
  const els = {
    canvas: {
      getBoundingClientRect() {
        rectReads++;
        return {left: 0, top: 0, width: 320, height: 180};
      }
    }
  };
  const viewport = createViewportController({els, state, queueRender: () => {}});

  assert.deepEqual(viewport.getCanvasRenderSize(), {width: 320, height: 180, dpr: 1, cssWidth: 320, cssHeight: 180});
  assert.deepEqual(viewport.getCanvasRenderSize(), {width: 320, height: 180, dpr: 1, cssWidth: 320, cssHeight: 180});
  assert.equal(rectReads, 1);
});


test("viewport invalidation rereads canvas size only when layout is known to have changed", () => {
  let rectReads = 0;
  let rect = {left: 0, top: 0, width: 320, height: 180};
  const queueCalls = [];
  const state = {
    gl: null,
    sourceCanvas: {width: 400, height: 200},
    view: {zoom: 2, centerX: 0.5, centerY: 0.5}
  };
  const els = {
    canvas: {
      getBoundingClientRect() {
        rectReads++;
        return rect;
      }
    }
  };
  const viewport = createViewportController({els, state, queueRender: options => queueCalls.push(options)});

  assert.equal(viewport.getCanvasRenderSize().width, 320);
  rect = {left: 0, top: 0, width: 640, height: 360};
  assert.equal(viewport.getCanvasRenderSize().width, 320);

  viewport.invalidateCanvasRenderSize({queue: true});
  assert.deepEqual(queueCalls, [{afterCurrent: true}]);
  assert.equal(viewport.getCanvasRenderSize().width, 640);
  assert.equal(rectReads, 2);
});

test("viewport resize observer queues a follow-up render when size changes", () => {
  const previousResizeObserver = globalThis.ResizeObserver;
  let observerCallback;
  let observedTarget;

  globalThis.ResizeObserver = class {
    constructor(callback) {
      observerCallback = callback;
    }

    observe(target) {
      observedTarget = target;
    }
  };

  try {
    const queueCalls = [];
    const state = {
      gl: null,
      sourceCanvas: {width: 400, height: 200},
      view: {zoom: 2, centerX: 0.5, centerY: 0.5}
    };
    const els = {
      canvas: {
        getBoundingClientRect() {
          throw new Error("resize observer size should avoid a layout read");
        }
      }
    };
    const viewport = createViewportController({els, state, queueRender: options => queueCalls.push(options)});

    assert.equal(observedTarget, els.canvas);
    observerCallback([{
      target: els.canvas,
      borderBoxSize: {inlineSize: 640, blockSize: 360},
      contentRect: {width: 640, height: 360}
    }]);

    assert.deepEqual(queueCalls, [{afterCurrent: true}]);
    assert.deepEqual(viewport.getCanvasRenderSize(), {width: 640, height: 360, dpr: 1, cssWidth: 640, cssHeight: 360});
  } finally {
    globalThis.ResizeObserver = previousResizeObserver;
  }
});

test("viewport controller keeps off-center zoom anchored on the same Y pixel", () => {
  const state = {
    gl: {canvas: {width: 200, height: 100}},
    sourceCanvas: {width: 400, height: 200},
    imageData: {width: 400, height: 200},
    view: {
      zoom: 1,
      centerX: 0.5,
      centerY: 0.5
    }
  };
  const els = {
    canvas: fakeCanvas({left: 10, top: 20, width: 200, height: 100}),
    viewStatus: {textContent: ""},
    zoomOutButton: {disabled: true},
    resetViewButton: {disabled: true}
  };
  const viewport = createViewportController({els, state, queueRender: () => {}});

  viewport.zoomBy(-Math.log(2) * 1000, 110, 20);

  assert.equal(state.view.zoom, 2);
  assert.equal(state.view.centerX, 0.5);
  assert.equal(state.view.centerY, 0.25);
  assert.deepEqual(viewport.clientPointToImagePixel(110, 20), {x: 200, y: 0});
});

test("viewport controller zooms, pans, updates controls, and maps image pixels", () => {
  let queued = 0;
  const state = {
    gl: {canvas: {width: 200, height: 100}},
    sourceCanvas: {width: 400, height: 200},
    imageData: {width: 400, height: 200},
    view: {
      zoom: 1,
      centerX: 0.5,
      centerY: 0.5
    }
  };
  const els = {
    canvas: fakeCanvas({left: 10, top: 20, width: 200, height: 100}),
    viewStatus: {textContent: ""},
    zoomOutButton: {disabled: true},
    resetViewButton: {disabled: true}
  };
  const viewport = createViewportController({els, state, queueRender: () => queued++});

  viewport.zoomBy(-Math.log(2) * 1000, 110, 70);
  assert.equal(state.view.zoom, 2);
  assert.equal(state.view.centerX, 0.5);
  assert.equal(state.view.centerY, 0.5);
  assert.equal(els.viewStatus.textContent, "200%");
  assert.equal(els.zoomOutButton.disabled, false);
  assert.equal(els.resetViewButton.disabled, false);

  viewport.panByClientDelta(20, 10);
  assert.equal(state.view.centerX, 0.45);
  assert.equal(state.view.centerY, 0.45);
  assert.equal(queued, 2);

  assert.deepEqual(viewport.clientPointToImagePixel(110, 70), {x: 180, y: 90});

  viewport.resetView(false);
  assert.equal(state.view.zoom, 1);
  assert.equal(state.view.centerX, 0.5);
  assert.equal(state.view.centerY, 0.5);
  assert.equal(queued, 2);
});
