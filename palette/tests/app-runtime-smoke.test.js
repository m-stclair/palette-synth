import test from "node:test";
import assert from "node:assert/strict";

function makeElement(tagName = "div") {
  const classes = new Set();
  return {
    tagName: tagName.toUpperCase(),
    width: 0,
    height: 0,
    hidden: false,
    textContent: "",
    value: "",
    checked: false,
    dataset: {},
    style: {setProperty() {}},
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle: (name, force) => {
        const shouldAdd = force ?? !classes.has(name);
        if (shouldAdd) classes.add(name);
        else classes.delete(name);
        return shouldAdd;
      }
    },
    addEventListener() {},
    removeEventListener() {},
    append() {},
    appendChild(child) { return child; },
    setAttribute() {},
    closest() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getContext() { return null; }
  };
}

function installBrowserStubs({readyState = "loading"} = {}) {
  const created = [];
  const listeners = [];
  const document = {
    readyState,
    body: makeElement("body"),
    documentElement: makeElement("html"),
    createElement(tagName) {
      const element = makeElement(tagName);
      created.push(element);
      return element;
    },
    getElementById() { return null; },
    querySelectorAll() { return []; },
    addEventListener(type, listener, options) {
      listeners.push({target: "document", type, listener, options});
    }
  };
  const window = {
    devicePixelRatio: 1,
    addEventListener(type, listener, options) {
      listeners.push({target: "window", type, listener, options});
    },
    removeEventListener() {},
    prompt() { return null; }
  };

  globalThis.document = document;
  globalThis.window = window;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.localStorage = {
    getItem() { return null; },
    setItem() {}
  };
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => "void main() {}"
  });

  return {created, listeners};
}

async function importFreshAppRuntime() {
  const suffix = `${Date.now()}-${Math.random()}`;
  return import(`../src/app-runtime.js?smoke=${suffix}`);
}

test("startApp loads shaders, creates runtime state, and waits for DOMContentLoaded once", async () => {
  const {created, listeners} = installBrowserStubs({readyState: "loading"});
  const {startApp} = await importFreshAppRuntime();

  await startApp();
  await startApp();

  assert.equal(created.filter(el => el.tagName === "CANVAS").length, 5);
  assert.deepEqual(
    listeners.map(({target, type, options}) => ({target, type, options})),
    [{target: "window", type: "DOMContentLoaded", options: {once: true}}]
  );
});
