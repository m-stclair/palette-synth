import test from "node:test";
import assert from "node:assert/strict";
import { RANGE_SCRUB_ACCENT_VARIABLE, RANGE_SCRUB_CLASS, bindRangeScrubSkinHold } from "../src/ui/range-scrub-skin-hold.js";

function makeStyle() {
  const values = new Map();
  return {
    setProperty(name, value) { values.set(name, value); },
    removeProperty(name) { values.delete(name); },
    getPropertyValue(name) { return values.get(name) || ""; }
  };
}

function makeClassList() {
  const classes = new Set();
  return {
    add(name) { classes.add(name); },
    remove(name) { classes.delete(name); },
    contains(name) { return classes.has(name); }
  };
}

function makeEmitter(base = {}) {
  const listeners = new Map();
  return {
    ...base,
    listeners,
    addEventListener(type, listener) {
      const list = listeners.get(type) || [];
      list.push(listener);
      listeners.set(type, list);
    },
    removeEventListener(type, listener) {
      const list = listeners.get(type) || [];
      listeners.set(type, list.filter(item => item !== listener));
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) listener({...event, type});
    }
  };
}

function makeRange() {
  return {
    tagName: "INPUT",
    type: "range",
    matches(selector) {
      return selector === 'input[type="range"]';
    }
  };
}

test("freezes the current range accent while a slider is scrubbed", () => {
  const documentElement = {style: makeStyle()};
  const body = {classList: makeClassList()};
  const root = makeEmitter({documentElement, body});
  const windowRef = makeEmitter();
  const range = makeRange();

  bindRangeScrubSkinHold({
    root,
    windowRef,
    getComputedStyleFn: target => target === range ? {accentColor: "rgb(12, 34, 56)"} : null
  });

  root.dispatch("pointerdown", {target: range});

  assert.equal(body.classList.contains(RANGE_SCRUB_CLASS), true);
  assert.equal(documentElement.style.getPropertyValue(RANGE_SCRUB_ACCENT_VARIABLE), "rgb(12, 34, 56)");

  windowRef.dispatch("pointerup");

  assert.equal(body.classList.contains(RANGE_SCRUB_CLASS), false);
  assert.equal(documentElement.style.getPropertyValue(RANGE_SCRUB_ACCENT_VARIABLE), "");
});

test("ignores non-range targets", () => {
  const documentElement = {style: makeStyle()};
  const body = {classList: makeClassList()};
  const root = makeEmitter({documentElement, body});
  const windowRef = makeEmitter();

  bindRangeScrubSkinHold({root, windowRef});
  root.dispatch("pointerdown", {target: {tagName: "BUTTON", type: "button"}});

  assert.equal(body.classList.contains(RANGE_SCRUB_CLASS), false);
  assert.equal(documentElement.style.getPropertyValue(RANGE_SCRUB_ACCENT_VARIABLE), "");
});
