import test from "node:test";
import assert from "node:assert/strict";
import {
  clientNearCompareSplit,
  compareSplitFromClientX,
  createCompareSplitController
} from "../src/ui/compare-split.js";

function classList() {
  const classes = new Set();
  return {
    toggle(name, force) {
      if (force) classes.add(name);
      else classes.delete(name);
    },
    contains(name) {
      return classes.has(name);
    }
  };
}

test("compare split helpers clamp pointer values and detect the split handle", () => {
  const rect = {left: 10, top: 20, width: 200, height: 100};

  assert.equal(compareSplitFromClientX(110, rect), 0.5);
  assert.equal(compareSplitFromClientX(-100, rect), 0);
  assert.equal(compareSplitFromClientX(999, rect), 1);

  assert.equal(clientNearCompareSplit({clientX: 112, clientY: 50, rect, split: 0.5, enabled: true}), true);
  assert.equal(clientNearCompareSplit({clientX: 140, clientY: 50, rect, split: 0.5, enabled: true}), false);
  assert.equal(clientNearCompareSplit({clientX: 112, clientY: 10, rect, split: 0.5, enabled: true}), false);
  assert.equal(clientNearCompareSplit({clientX: 112, clientY: 50, rect, split: 0.5, enabled: false}), false);
});

test("compare split controller syncs config, controls, classes, and render invalidation", () => {
  let queued = 0;
  const config = {compareEnabled: false, compareSplit: 0.5};
  const els = {
    compareToggle: {checked: false},
    compareSplit: {value: 50, disabled: false},
    compareSplitValue: {textContent: ""},
    canvas: {classList: classList()}
  };
  const controller = createCompareSplitController({
    els,
    config,
    getDisplayViewRect: () => ({left: 10, top: 20, width: 200, height: 100}),
    queueRender: () => queued++
  });

  controller.setCompareEnabled(true);
  assert.equal(config.compareEnabled, true);
  assert.equal(els.compareToggle.checked, true);
  assert.equal(els.compareSplit.disabled, false);
  assert.equal(els.canvas.classList.contains("is-comparing"), true);

  controller.setCompareSplit(2);
  assert.equal(config.compareSplit, 1);
  assert.equal(els.compareSplit.value, 100);
  assert.equal(els.compareSplitValue.textContent, "100%");
  assert.equal(queued, 2);

  controller.setCompareEnabled(false, {queue: false});
  assert.equal(els.compareSplit.disabled, true);
  assert.equal(queued, 2);
  assert.equal(controller.pointerCompareSplit(110), 0.5);
  assert.equal(controller.isNearCompareSplit(110, 50), false);
});
