import test from "node:test";
import assert from "node:assert/strict";
import { bindCanvasInteractions } from "../src/ui/canvas-interactions.js";

function classList() {
  const classes = new Set();
  return {
    add(...names) {
      for (const name of names) classes.add(name);
    },
    remove(...names) {
      for (const name of names) classes.delete(name);
    },
    toggle(name, force) {
      const enabled = force ?? !classes.has(name);
      if (enabled) classes.add(name);
      else classes.delete(name);
    },
    contains(name) {
      return classes.has(name);
    }
  };
}

function fakeCanvas() {
  const handlers = new Map();
  return {
    classList: classList(),
    captured: [],
    handlers,
    setPointerCapture(pointerId) {
      this.captured.push(pointerId);
    },
    addEventListener(type, handler) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(handler);
    },
    dispatch(type, event = {}) {
      const fullEvent = {
        preventDefault() {
          this.defaultPrevented = true;
        },
        ...event
      };
      for (const handler of handlers.get(type) ?? []) handler(fullEvent);
      return fullEvent;
    }
  };
}

function makeState() {
  return {
    paletteRegion: {enabled: false, dragging: false},
    view: {
      pointerId: null,
      lastClientX: 0,
      lastClientY: 0,
      clickStartX: 0,
      clickStartY: 0,
      movedForClick: false,
      compareDragging: false,
      dragging: false
    }
  };
}

function bindWithFakes({canvas = fakeCanvas(), state = makeState(), diagnosticsOpen = false, compareNear = false, region = {}} = {}) {
  const calls = [];
  const viewport = {
    zoomBy: (...args) => calls.push(["zoomBy", ...args]),
    panByClientDelta: (...args) => calls.push(["panByClientDelta", ...args]),
    resetView: () => calls.push(["resetView"])
  };
  const compareSplit = {
    isNearCompareSplit: () => compareNear,
    pointerCompareSplit: clientX => clientX / 100,
    setCompareSplit: value => calls.push(["setCompareSplit", value])
  };
  const paletteRegion = {
    beginPaletteRegionDrag: () => false,
    updatePaletteRegionDrag: () => false,
    finishPaletteRegionDrag: () => false,
    cancelPaletteRegionDrag: options => calls.push(["cancelPaletteRegionDrag", options]),
    ...region
  };
  bindCanvasInteractions({
    canvas,
    state,
    viewport,
    compareSplit,
    paletteRegion,
    diagnosticsPanelIsOpen: () => diagnosticsOpen,
    inspectDiagnosticPixel: (...args) => calls.push(["inspectDiagnosticPixel", ...args])
  });
  return {canvas, state, calls};
}

test("canvas interactions route wheel, pan, diagnostic click, and double-click reset", () => {
  const {canvas, state, calls} = bindWithFakes({diagnosticsOpen: true});

  const wheel = canvas.dispatch("wheel", {deltaY: -100, clientX: 20, clientY: 30});
  assert.equal(wheel.defaultPrevented, true);
  assert.deepEqual(calls.shift(), ["zoomBy", -100, 20, 30]);

  canvas.dispatch("pointerdown", {button: 0, pointerId: 7, clientX: 10, clientY: 20});
  assert.equal(state.view.dragging, true);
  assert.equal(state.view.pointerId, 7);
  assert.deepEqual(canvas.captured, [7]);
  assert.equal(canvas.classList.contains("is-panning"), true);

  canvas.dispatch("pointermove", {pointerId: 7, clientX: 15, clientY: 28});
  assert.equal(state.view.movedForClick, true);
  assert.deepEqual(calls.shift(), ["panByClientDelta", 5, 8]);

  canvas.dispatch("click", {clientX: 15, clientY: 28});
  assert.equal(calls.length, 0);

  canvas.dispatch("pointerup", {pointerId: 7});
  assert.equal(state.view.dragging, false);
  assert.equal(state.view.pointerId, null);
  assert.equal(canvas.classList.contains("is-panning"), false);

  state.view.movedForClick = false;
  canvas.dispatch("click", {clientX: 44, clientY: 55});
  assert.deepEqual(calls.shift(), ["inspectDiagnosticPixel", 44, 55]);

  canvas.dispatch("dblclick", {});
  assert.deepEqual(calls.shift(), ["resetView"]);
});

test("canvas interactions route compare dragging without panning", () => {
  const {canvas, state, calls} = bindWithFakes({compareNear: true});

  canvas.dispatch("pointerdown", {button: 0, pointerId: 2, clientX: 40, clientY: 20});
  assert.equal(state.view.compareDragging, true);
  assert.equal(state.view.dragging, false);
  assert.equal(canvas.classList.contains("is-splitting"), true);
  assert.deepEqual(calls.shift(), ["setCompareSplit", 0.4]);

  canvas.dispatch("pointermove", {pointerId: 2, clientX: 70, clientY: 20});
  assert.deepEqual(calls.shift(), ["setCompareSplit", 0.7]);

  canvas.dispatch("pointerup", {pointerId: 2});
  assert.equal(state.view.compareDragging, false);
  assert.equal(canvas.classList.contains("is-splitting"), false);
});

test("canvas interactions let palette-region drag own pointer events", () => {
  const canvas = fakeCanvas();
  const state = makeState();
  state.paletteRegion.enabled = true;
  state.paletteRegion.dragging = true;
  const calls = [];
  bindWithFakes({
    canvas,
    state,
    region: {
      beginPaletteRegionDrag: event => {
        calls.push(["begin", event.pointerId]);
        return true;
      },
      updatePaletteRegionDrag: event => {
        calls.push(["update", event.pointerId]);
        return true;
      },
      finishPaletteRegionDrag: event => {
        calls.push(["finish", event.pointerId]);
        return true;
      },
      cancelPaletteRegionDrag: options => calls.push(["cancel", options])
    }
  });

  canvas.dispatch("pointerdown", {button: 0, pointerId: 9, clientX: 10, clientY: 10});
  assert.equal(state.view.pointerId, null);
  canvas.dispatch("pointermove", {pointerId: 9, clientX: 30, clientY: 30});
  canvas.dispatch("pointerup", {pointerId: 9});
  assert.deepEqual(calls, [["begin", 9], ["update", 9], ["finish", 9]]);

  canvas.dispatch("pointercancel", {pointerId: 9});
  assert.deepEqual(calls.at(-1), ["cancel", {announce: false}]);
});

test("canvas interactions suppress double-click reset while selecting a palette region", () => {
  const state = makeState();
  state.paletteRegion.enabled = true;
  const {canvas, calls} = bindWithFakes({state});

  const event = canvas.dispatch("dblclick", {});
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(calls, []);
});


test("canvas interactions let mask painting own pointer events before pan", () => {
  const canvas = fakeCanvas();
  const state = makeState();
  state.mask = {paintMode: "paint", dragging: false};
  const calls = [];
  const viewport = {
    zoomBy: (...args) => calls.push(["zoomBy", ...args]),
    panByClientDelta: (...args) => calls.push(["panByClientDelta", ...args]),
    resetView: () => calls.push(["resetView"])
  };
  const compareSplit = {
    isNearCompareSplit: () => false,
    pointerCompareSplit: () => 0,
    setCompareSplit: value => calls.push(["setCompareSplit", value])
  };
  const paletteRegion = {
    beginPaletteRegionDrag: () => false,
    updatePaletteRegionDrag: () => false,
    finishPaletteRegionDrag: () => false,
    cancelPaletteRegionDrag: () => false
  };
  const cycleCalls = [];

  bindCanvasInteractions({
    canvas,
    state,
    viewport,
    compareSplit,
    paletteRegion,
    mask: {
      beginMaskPaint: event => {
        cycleCalls.push(["begin", event.pointerId]);
        return true;
      },
      updateMaskPaint: event => {
        cycleCalls.push(["update", event.pointerId]);
        return true;
      },
      finishMaskPaint: event => {
        cycleCalls.push(["finish", event.pointerId]);
        return true;
      },
      cancelMaskPaint: () => false
    },
    diagnosticsPanelIsOpen: () => false,
    inspectDiagnosticPixel: () => {}
  });

  canvas.dispatch("pointerdown", {button: 0, pointerId: 12, clientX: 10, clientY: 10});
  canvas.dispatch("pointermove", {pointerId: 12, clientX: 20, clientY: 20});
  canvas.dispatch("pointerup", {pointerId: 12});

  assert.deepEqual(cycleCalls, [["begin", 12], ["update", 12], ["finish", 12]]);
  assert.equal(state.view.dragging, false);
  assert.equal(state.view.pointerId, null);
  assert.deepEqual(calls, []);
});
