import test from "node:test";
import assert from "node:assert/strict";
import { bindDismissibleMenus } from "../src/ui/dismissible-menus.js";

function makeEmitter(base = {}) {
  const listeners = new Map();
  return {
    ...base,
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
      for (const listener of listeners.get(type) || []) {
        listener({...event, type, currentTarget: this});
      }
    }
  };
}

function makeSummary() {
  const attrs = new Map();
  return {
    setAttribute(name, value) {
      attrs.set(name, value);
    },
    getAttribute(name) {
      return attrs.get(name);
    }
  };
}

function makeMenu(children = []) {
  const summary = makeSummary();
  return makeEmitter({
    open: false,
    contains(target) {
      return target === this || target === summary || children.includes(target);
    },
    querySelector(selector) {
      return selector === "summary" ? summary : null;
    },
    summary
  });
}

function makeRoot(menus) {
  return makeEmitter({
    querySelectorAll() {
      return menus;
    }
  });
}

test("closes open menus when clicking outside", () => {
  const inside = {};
  const menu = makeMenu([inside]);
  const root = makeRoot([menu]);
  bindDismissibleMenus({root});

  menu.open = true;
  root.dispatch("click", {target: {}});

  assert.equal(menu.open, false);
  assert.equal(menu.summary.getAttribute("aria-expanded"), "false");
});

test("keeps an open menu open when clicking inside it", () => {
  const inside = {};
  const menu = makeMenu([inside]);
  const root = makeRoot([menu]);
  bindDismissibleMenus({root});

  menu.open = true;
  root.dispatch("click", {target: inside});

  assert.equal(menu.open, true);
});

test("opening one menu closes the other menus", () => {
  const first = makeMenu();
  const second = makeMenu();
  const root = makeRoot([first, second]);
  bindDismissibleMenus({root});

  first.open = true;
  second.open = true;
  second.dispatch("toggle", {target: second});

  assert.equal(first.open, false);
  assert.equal(second.open, true);
  assert.equal(second.summary.getAttribute("aria-expanded"), "true");
});

test("Escape closes every open menu", () => {
  const first = makeMenu();
  const second = makeMenu();
  const root = makeRoot([first, second]);
  bindDismissibleMenus({root});

  first.open = true;
  second.open = true;
  root.dispatch("keydown", {key: "Escape"});

  assert.equal(first.open, false);
  assert.equal(second.open, false);
});
