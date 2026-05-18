import test from "node:test";
import assert from "node:assert/strict";
import { bindFloatingPixelInspector } from "../src/ui/floating-pixel-inspector.js";

function fakeElement(parentElement = null) {
  return {
    parentElement,
    classList: {
      add() {},
      remove() {}
    },
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() { return {left: 0, top: 0, right: 100, bottom: 100}; },
    offsetWidth: 100,
    offsetHeight: 100,
    style: {}
  };
}

test("floating pixel inspector is hoisted to the body stacking context", () => {
  const oldDocument = globalThis.document;
  const originalParent = {name: "stage-shell"};
  const pane = fakeElement(originalParent);
  const body = {
    appended: [],
    appendChild(child) {
      this.appended.push(child);
      child.parentElement = this;
    }
  };
  globalThis.document = {body};

  try {
    const binding = bindFloatingPixelInspector({els: {pixelInspectorPane: pane}});
    assert.equal(pane.parentElement, body);
    assert.deepEqual(body.appended, [pane]);
    binding.destroy();
  } finally {
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  }
});
