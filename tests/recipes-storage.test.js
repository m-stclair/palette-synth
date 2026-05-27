import test from "node:test";
import assert from "node:assert/strict";
import { recipeConfigFromUnknown, recipeFileFor, saveRecipes } from "../src/storage/recipes.js";

const sanitizeConfigSnapshot = config => ({...config});

function installFakeStorage() {
  const values = new Map();
  globalThis.localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); },
    values
  };
  return values;
}

test("recipe parsing and export omit transient view-only state", () => {
  const raw = {
    name: "Look",
    config: {
      paletteSize: 21,
      paletteSwatchScale: 3,
      compareEnabled: true,
      compareSplit: 0.2
    }
  };

  assert.deepEqual(recipeConfigFromUnknown(raw, {sanitizeConfigSnapshot}), {paletteSize: 21});
  assert.deepEqual(recipeFileFor(raw, {sanitizeConfigSnapshot}).config, {paletteSize: 21});
});

test("saving recipes to local storage strips transient view-only state", () => {
  const values = installFakeStorage();

  assert.equal(saveRecipes([{
    id: "r1",
    name: "Look",
    config: {paletteSize: 15, paletteSwatchScale: 2, compareEnabled: true, compareSplit: 0.75}
  }]), true);

  const stored = JSON.parse(values.get("paletteSynth.recipes.v1"));
  assert.deepEqual(stored.recipes[0].config, {paletteSize: 15});
});
