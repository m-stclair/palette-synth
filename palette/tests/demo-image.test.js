import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DEMO_IMAGE_ID, demoImages, demoSvg, getDemoImage } from "../src/demo-image.js";
import { populateDemoImageSelect } from "../src/ui/controls.js";

test("built-in demo images expose unique selectable SVG fixtures", () => {
  assert.ok(demoImages.length >= 6);
  assert.equal(DEFAULT_DEMO_IMAGE_ID, demoImages[0].id);
  assert.equal(demoSvg, demoImages[0].svg);

  const ids = new Set();
  for (const demo of demoImages) {
    assert.match(demo.id, /^[a-z0-9-]+$/);
    assert.ok(!ids.has(demo.id), `duplicate demo id: ${demo.id}`);
    ids.add(demo.id);
    assert.ok(demo.name.length > 0);
    assert.match(demo.svg, /^<svg\b/);
    assert.match(demo.svg, /<\/svg>$/);
  }
});

test("demo image lookup falls back to the default fixture", () => {
  assert.equal(getDemoImage("low-contrast").name, "Low contrast");
  assert.equal(getDemoImage("does-not-exist"), demoImages[0]);
  assert.equal(getDemoImage(), demoImages[0]);
});

test("demo selector population mirrors the registered demo fixtures", () => {
  const created = [];
  const documentRef = {
    createElement(tagName) {
      const node = {tagName, value: "", textContent: "", title: ""};
      created.push(node);
      return node;
    }
  };
  const select = {
    textContent: "stale options",
    options: [],
    value: "",
    append(node) {
      this.options.push(node);
    }
  };

  populateDemoImageSelect(select, demoImages, documentRef);

  assert.equal(select.textContent, "");
  assert.equal(created.length, demoImages.length);
  assert.deepEqual(select.options.map(option => option.value), demoImages.map(demo => demo.id));
  assert.deepEqual(select.options.map(option => option.textContent), demoImages.map(demo => demo.name));
  assert.equal(select.value, DEFAULT_DEMO_IMAGE_ID);
});
