import test from "node:test";
import assert from "node:assert/strict";
import { createAppInitializer } from "../src/app/initializer.js";

function makeElement() {
  return {
    hidden: true,
    textContent: "",
    classList: {toggle() {}},
    addEventListener() {}
  };
}

test("app initializer collects UI elements and reports WebGL startup failure", () => {
  const canvas = makeElement();
  const error = makeElement();
  const elements = {canvas, error};
  const root = {
    getElementById: id => elements[id] || null
  };
  const els = {};
  const initializer = createAppInitializer({
    els,
    state: {},
    config: {},
    root,
    createWebgl2Context() {
      throw new Error("missing gpu");
    }
  });

  initializer.init();

  assert.equal(els.canvas, canvas);
  assert.equal(els.error, error);
  assert.equal(error.hidden, false);
  assert.equal(error.textContent, "missing gpu");
});
