import test from "node:test";
import assert from "node:assert/strict";
import { createPaletteSynthApp } from "../src/app/create-app.js";

function makeDocumentStub() {
  const created = [];
  return {
    created,
    createElement(tagName) {
      const element = {
        tagName: tagName.toUpperCase(),
        width: 0,
        height: 0,
        classList: {toggle() {}},
        getContext() { return null; }
      };
      created.push(element);
      return element;
    },
    getElementById() { return null; },
    querySelectorAll() { return []; }
  };
}

const shaders = {
  FRAGMENT_SHADER_BODY: "fragment",
  VERTEX_SHADER: "vertex",
  LEVELS_FRAGMENT_SHADER: "levels"
};

test("createPaletteSynthApp creates an isolated runtime graph", () => {
  const firstDocument = makeDocumentStub();
  const secondDocument = makeDocumentStub();

  const first = createPaletteSynthApp({shaders, document: firstDocument, window: {}});
  const second = createPaletteSynthApp({shaders, document: secondDocument, window: {}});

  assert.equal(typeof first.init, "function");
  assert.equal(firstDocument.created.filter(el => el.tagName === "CANVAS").length, 5);
  assert.equal(secondDocument.created.filter(el => el.tagName === "CANVAS").length, 5);

  first.config.paletteSize = 7;
  first.state.paletteRecords.push({hex: "#000000"});
  first.els.canvas = {id: "first-canvas"};

  assert.notEqual(second.config.paletteSize, 7);
  assert.deepEqual(second.state.paletteRecords, []);
  assert.equal(second.els.canvas, undefined);
});
