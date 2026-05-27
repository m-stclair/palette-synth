import test from "node:test";
import assert from "node:assert/strict";
import { createRecipeController } from "../src/recipes/controller.js";

function installFakeDocument() {
  globalThis.document = {
    createElement(tagName) {
      return {tagName, value: "", textContent: ""};
    }
  };
}

function installFakeStorage() {
  const values = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
    }
  };
}

function selectElement(value = "") {
  return {
    value,
    disabled: false,
    options: [],
    append(option) {
      this.options.push(option);
    },
    set innerHTML(value) {
      this.options = [];
      this._innerHTML = value;
    },
    get innerHTML() {
      return this._innerHTML || "";
    }
  };
}

function createHarness({recipes = [], selectedId = "", name = "Look", snapshot = {version: 1}} = {}) {
  installFakeDocument();
  installFakeStorage();
  const statuses = [];
  const state = {recipes: recipes.map(recipe => ({...recipe, config: {...recipe.config}}))};
  const els = {
    recipeSelect: selectElement(selectedId),
    recipeName: {value: name},
    loadRecipeButton: {disabled: false},
    deleteRecipeButton: {disabled: false},
    exportSelectedRecipeButton: {disabled: false}
  };
  const controller = createRecipeController({
    els,
    state,
    cloneConfigSnapshot: () => ({...snapshot}),
    sanitizeConfigSnapshot: config => ({...config}),
    replaceConfigSnapshot() {},
    pushHistorySnapshot() {},
    setStatus: message => statuses.push(message)
  });
  return {controller, els, state, statuses};
}

test("saving a selected recipe with the same name updates that recipe", () => {
  const existing = {
    id: "recipe-1",
    name: "Look",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    config: {version: 1}
  };
  const {controller, state, statuses} = createHarness({
    recipes: [existing],
    selectedId: "recipe-1",
    name: "Look",
    snapshot: {version: 2}
  });

  controller.saveCurrentRecipe();

  assert.equal(state.recipes.length, 1);
  assert.equal(state.recipes[0].id, "recipe-1");
  assert.equal(state.recipes[0].name, "Look");
  assert.deepEqual(state.recipes[0].config, {version: 2});
  assert.match(statuses.at(-1), /^Updated recipe/);
});

test("saving a selected recipe under a new name creates a new recipe instead of overwriting", () => {
  const existing = {
    id: "recipe-1",
    name: "Original look",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    config: {version: 1}
  };
  const {controller, els, state, statuses} = createHarness({
    recipes: [existing],
    selectedId: "recipe-1",
    name: "New look",
    snapshot: {version: 2}
  });

  controller.saveCurrentRecipe();

  assert.equal(state.recipes.length, 2);
  const original = state.recipes.find(recipe => recipe.id === "recipe-1");
  const created = state.recipes.find(recipe => recipe.name === "New look");
  assert.ok(original);
  assert.ok(created);
  assert.equal(original.name, "Original look");
  assert.deepEqual(original.config, {version: 1});
  assert.deepEqual(created.config, {version: 2});
  assert.equal(els.recipeSelect.value, created.id);
  assert.match(statuses.at(-1), /^Saved new recipe/);
});

test("saving without a selected recipe never updates by name collision", () => {
  const existing = {
    id: "recipe-1",
    name: "Look",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    config: {version: 1}
  };
  const {controller, state} = createHarness({
    recipes: [existing],
    selectedId: "",
    name: "Look",
    snapshot: {version: 2}
  });

  controller.saveCurrentRecipe();

  assert.equal(state.recipes.length, 2);
  const original = state.recipes.find(recipe => recipe.id === "recipe-1");
  const created = state.recipes.find(recipe => recipe.name === "Look 2");
  assert.ok(original);
  assert.ok(created);
  assert.deepEqual(original.config, {version: 1});
  assert.deepEqual(created.config, {version: 2});
});



test("saving recipes strips transient view-only state", () => {
  const {controller, state} = createHarness({
    name: "Viewless look",
    snapshot: {
      version: 2,
      paletteSwatchScale: 3,
      compareEnabled: true,
      compareSplit: 0.2
    }
  });

  controller.saveCurrentRecipe();

  assert.deepEqual(state.recipes[0].config, {version: 2});
});

test("recipe controller exposes the full binding surface used by runtime controls", () => {
  const {controller} = createHarness();
  for (const method of [
    "loadStoredRecipes",
    "updateRecipeControls",
    "selectedRecipe",
    "saveCurrentRecipe",
    "loadSelectedRecipe",
    "deleteSelectedRecipe",
    "exportCurrentRecipe",
    "exportSelectedRecipe",
    "exportAllRecipes",
    "importRecipeFile"
  ]) {
    assert.equal(typeof controller[method], "function", `${method} should be exposed`);
  }
});
