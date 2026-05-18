import test from "node:test";
import assert from "node:assert/strict";
import { bindImageDropControls, hasDraggedFiles } from "../src/ui/controls.js";

function makeEvent({types = ["Files"], files = [{name: "photo.png"}], clientX = 50, clientY = 50} = {}) {
  return {
    defaultPrevented: false,
    clientX,
    clientY,
    dataTransfer: {types, files, dropEffect: "none"},
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
}

function makeDomHarness() {
  const documentHandlers = new Map();
  const windowHandlers = new Map();
  const body = {
    dragging: false,
    classList: {
      toggle(className, force) {
        if (className === "dragging") body.dragging = !!force;
      }
    }
  };
  const documentRef = {
    body,
    addEventListener(type, handler) {
      documentHandlers.set(type, handler);
    }
  };
  const windowRef = {
    innerWidth: 100,
    innerHeight: 100,
    addEventListener(type, handler) {
      windowHandlers.set(type, handler);
    }
  };

  return {
    body,
    documentRef,
    windowRef,
    dispatch(type, event = makeEvent()) {
      documentHandlers.get(type)(event);
      return event;
    },
    dispatchWindow(type) {
      windowHandlers.get(type)();
    }
  };
}

test("image drop controls keep the overlay stable while moving across child elements", () => {
  const loaded = [];
  const harness = makeDomHarness();
  bindImageDropControls({documentRef: harness.documentRef, windowRef: harness.windowRef, loadFile: file => loaded.push(file)});

  harness.dispatch("dragenter");
  harness.dispatch("dragleave");
  assert.equal(harness.body.dragging, true);

  harness.dispatch("dragenter");
  harness.dispatch("dragleave");
  assert.equal(harness.body.dragging, true);

  const over = harness.dispatch("dragover");
  assert.equal(over.defaultPrevented, true);
  assert.equal(over.dataTransfer.dropEffect, "copy");

  const droppedFile = {name: "dropped.png"};
  harness.dispatch("drop", makeEvent({files: [droppedFile]}));
  assert.equal(harness.body.dragging, false);
  assert.deepEqual(loaded, [droppedFile]);
});

test("image drop controls ignore non-file drags", () => {
  const harness = makeDomHarness();
  bindImageDropControls({documentRef: harness.documentRef, windowRef: harness.windowRef, loadFile() { throw new Error("should not load"); }});

  const event = harness.dispatch("dragover", makeEvent({types: ["text/plain"], files: []}));
  assert.equal(event.defaultPrevented, false);
  assert.equal(harness.body.dragging, false);
});

test("image drop controls clear stale overlay state on window blur", () => {
  const harness = makeDomHarness();
  bindImageDropControls({documentRef: harness.documentRef, windowRef: harness.windowRef, loadFile() {}});

  harness.dispatch("dragenter");
  assert.equal(harness.body.dragging, true);

  harness.dispatchWindow("blur");
  assert.equal(harness.body.dragging, false);
});

test("hasDraggedFiles supports DOMStringList-style drag types", () => {
  assert.equal(hasDraggedFiles({dataTransfer: {types: {contains: value => value === "Files"}, files: []}}), true);
});
