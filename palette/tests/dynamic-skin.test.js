import test from "node:test";
import assert from "node:assert/strict";
import { clearDynamicUiSkin, dynamicSkinColors, syncDynamicUiSkin } from "../src/ui/dynamic-skin.js";

function makeStyle() {
  const values = new Map();
  return {
    values,
    setProperty(name, value) { values.set(name, value); },
    removeProperty(name) { values.delete(name); },
    getPropertyValue(name) { return values.get(name) || ""; }
  };
}

test("dynamic skin derives safe css variables from palette records", () => {
  const colors = dynamicSkinColors([
    {hex: "#05070a"},
    {hex: "#f04a2a"},
    {hex: "#f6d365"}
  ]);

  assert.match(colors["--bg"], /^#[0-9a-f]{6}$/);
  assert.match(colors["--panel"], /^#[0-9a-f]{6}$/);
  assert.match(colors["--accent"], /^#[0-9a-f]{6}$/);
  assert.match(colors["--line"], /^rgba\(/);
  assert.equal(colors["--text"], "#f4f6fb");
});

test("dynamic skin applies and clears root variables", () => {
  const documentElement = {style: makeStyle()};
  const body = {dataset: {}};
  const root = {documentElement, body};

  const applied = syncDynamicUiSkin({
    enabled: true,
    records: [{hex: "#000000"}, {hex: "#2f80ed"}, {hex: "#eeeeee"}],
    root
  });

  assert.ok(applied);
  assert.equal(body.dataset.uiSkin, "palette");
  assert.equal(documentElement.style.getPropertyValue("--accent"), applied["--accent"]);

  clearDynamicUiSkin(root);
  assert.equal(body.dataset.uiSkin, undefined);
  assert.equal(documentElement.style.getPropertyValue("--accent"), "");
});
