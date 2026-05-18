import test from "node:test";
import assert from "node:assert/strict";
import { createRuntimeState } from "../src/app/runtime-state.js";

function makeDocumentStub() {
  const created = [];
  return {
    created,
    createElement(tagName) {
      const element = {tagName: tagName.toUpperCase(), width: 0, height: 0};
      created.push(element);
      return element;
    }
  };
}

test("runtime state creates isolated canvas-backed defaults", () => {
  const doc = makeDocumentStub();
  const state = createRuntimeState({document: doc, maxImageSide: 1234});

  assert.equal(doc.created.length, 5);
  assert.deepEqual(doc.created.map(el => el.tagName), ["CANVAS", "CANVAS", "CANVAS", "CANVAS", "CANVAS"]);
  assert.equal(state.originalCanvas, doc.created[0]);
  assert.equal(state.sourceCanvas, doc.created[1]);
  assert.equal(state.referenceOriginalCanvas, doc.created[2]);
  assert.equal(state.referenceCanvas, doc.created[3]);
  assert.equal(state.levels.canvas, doc.created[4]);
  assert.equal(state.maxImageSide, 1234);
  assert.equal(state.originalSourceVersion, 0);
  assert.equal(state.referenceOriginalSourceVersion, 0);
  assert.equal(state.textureDirty, true);
  assert.equal(state.paletteDirty, true);
  assert.equal(state.swatchesDirty, true);
  assert.deepEqual(state.diagnostics, {signature: "", stats: null, pixel: null, overlay: {mode: "none", swatchIndex: null}});
});

test("runtime state instances do not share mutable collections", () => {
  const first = createRuntimeState({document: makeDocumentStub()});
  const second = createRuntimeState({document: makeDocumentStub()});

  first.paletteRecords.push({lab: [50, 0, 0]});
  first.history.undo.push({label: "old"});
  first.view.zoom = 3;

  assert.deepEqual(second.paletteRecords, []);
  assert.deepEqual(second.history.undo, []);
  assert.equal(second.view.zoom, 1);
});

test("runtime state requires a document-like dependency", () => {
  assert.throws(
    () => createRuntimeState({document: null}),
    /requires a document with createElement/
  );
});
