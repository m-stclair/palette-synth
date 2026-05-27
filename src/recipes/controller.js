import { downloadJson } from "../export/downloads.js";
import {
  createRecipeId,
  defaultRecipeName,
  loadRecipes,
  recipeCollectionFileFor,
  recipeFileFor,
  recipeConfigForStorage,
  recipeRecordsFromUnknown,
  sanitizeRecipeName,
  saveRecipes,
  slugifyRecipeName
} from "../storage/recipes.js";

export function createRecipeController({
  els,
  state,
  cloneConfigSnapshot,
  sanitizeConfigSnapshot,
  replaceConfigSnapshot,
  pushHistorySnapshot,
  setStatus
}) {
  function loadStoredRecipes() {
    state.recipes = loadRecipes({sanitizeConfigSnapshot});
  }

  function saveStoredRecipes() {
    if (!saveRecipes(state.recipes)) {
      setStatus("Could not save recipes. Local storage may be blocked.");
    }
  }

  function selectedRecipe() {
    const id = els.recipeSelect?.value;
    return state.recipes.find(recipe => recipe.id === id) || null;
  }

  function uniqueRecipeName(name, skipId = null) {
    const base = sanitizeRecipeName(name);
    const taken = new Set(state.recipes
      .filter(recipe => recipe.id !== skipId)
      .map(recipe => recipe.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    let i = 2;
    while (taken.has(`${base} ${i}`.toLowerCase())) i++;
    return `${base} ${i}`;
  }

  function sortRecipes() {
    state.recipes.sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: "base"}));
  }

  function updateRecipeControls(selectedId = null) {
    const select = els.recipeSelect;
    if (!select) return;
    const previous = selectedId || select.value;
    select.innerHTML = "";
    sortRecipes();

    if (!state.recipes.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No saved recipes";
      select.append(option);
      select.disabled = true;
    } else {
      select.disabled = false;
      for (const recipe of state.recipes) {
        const option = document.createElement("option");
        option.value = recipe.id;
        option.textContent = recipe.name;
        select.append(option);
      }
      select.value = state.recipes.some(recipe => recipe.id === previous) ? previous : state.recipes[0].id;
    }

    const recipe = selectedRecipe();
    if (els.recipeName && recipe && !els.recipeName.value) els.recipeName.value = recipe.name;
    const hasSelection = !!recipe;
    [els.loadRecipeButton, els.deleteRecipeButton, els.exportSelectedRecipeButton].forEach(button => {
      if (button) button.disabled = !hasSelection;
    });
  }

  function saveCurrentRecipe() {
    const existing = selectedRecipe();
    const requestedName = sanitizeRecipeName(els.recipeName?.value || existing?.name, defaultRecipeName());
    const now = new Date().toISOString();
    const shouldUpdateSelected = !!existing && requestedName.toLowerCase() === existing.name.toLowerCase();
    const recipe = shouldUpdateSelected
      ? existing
      : {
        id: createRecipeId(),
        name: uniqueRecipeName(requestedName),
        createdAt: now
      };

    recipe.name = shouldUpdateSelected ? existing.name : recipe.name;
    recipe.updatedAt = now;
    recipe.config = recipeConfigForStorage(cloneConfigSnapshot(), {sanitizeConfigSnapshot});

    if (!shouldUpdateSelected) state.recipes.push(recipe);

    saveStoredRecipes();
    if (els.recipeName) els.recipeName.value = recipe.name;
    updateRecipeControls(recipe.id);
    setStatus(`${shouldUpdateSelected ? "Updated" : "Saved new"} recipe “${recipe.name}”.`);
  }

  function loadSelectedRecipe() {
    const recipe = selectedRecipe();
    if (!recipe) return;
    const before = cloneConfigSnapshot();
    replaceConfigSnapshot(recipe.config);
    pushHistorySnapshot(before, `Load recipe “${recipe.name}”`);
    if (els.recipeName) els.recipeName.value = recipe.name;
    updateRecipeControls(recipe.id);
    setStatus(`Loaded recipe “${recipe.name}”.`);
  }

  function deleteSelectedRecipe() {
    const recipe = selectedRecipe();
    if (!recipe) return;
    state.recipes = state.recipes.filter(item => item.id !== recipe.id);
    saveStoredRecipes();
    if (els.recipeName) els.recipeName.value = "";
    updateRecipeControls();
    setStatus(`Deleted recipe “${recipe.name}”.`);
  }

  function exportCurrentRecipe() {
    const name = sanitizeRecipeName(els.recipeName?.value, defaultRecipeName());
    downloadJson(
      recipeFileFor({name, config: cloneConfigSnapshot()}, {sanitizeConfigSnapshot}),
      `${slugifyRecipeName(name)}.palette-synth-recipe.json`
    );
    setStatus(`Exported current recipe “${name}”.`);
  }

  function exportSelectedRecipe() {
    const recipe = selectedRecipe();
    if (!recipe) return;
    downloadJson(
      recipeFileFor(recipe, {sanitizeConfigSnapshot}),
      `${slugifyRecipeName(recipe.name)}.palette-synth-recipe.json`
    );
    setStatus(`Exported recipe “${recipe.name}”.`);
  }

  function exportAllRecipes() {
    if (!state.recipes.length) {
      setStatus("No saved recipes to export.");
      return;
    }
    downloadJson(
      recipeCollectionFileFor(state.recipes, {sanitizeConfigSnapshot}),
      "palette-synth-recipes.json"
    );
    setStatus(`Exported ${state.recipes.length} recipe${state.recipes.length === 1 ? "" : "s"}.`);
  }

  function importRecipeFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const records = recipeRecordsFromUnknown(JSON.parse(String(reader.result || "{}")), {
          sanitizeConfigSnapshot,
          fallbackName: file.name.replace(/\.json$/i, "")
        });
        const imported = records.map(record => ({
          ...record,
          id: createRecipeId(),
          name: uniqueRecipeName(record.name)
        }));
        state.recipes.push(...imported);
        saveStoredRecipes();
        if (els.recipeName && imported.length === 1) els.recipeName.value = imported[0].name;
        updateRecipeControls(imported[0]?.id);
        setStatus(`Imported ${imported.length} recipe${imported.length === 1 ? "" : "s"}.`);
      } catch (err) {
        setStatus(`Recipe import failed: ${err.message}`);
      } finally {
        if (els.recipeImportInput) els.recipeImportInput.value = "";
      }
    };
    reader.onerror = () => {
      setStatus("Recipe import failed: could not read the file.");
      if (els.recipeImportInput) els.recipeImportInput.value = "";
    };
    reader.readAsText(file);
  }

  return {
    loadStoredRecipes,
    saveStoredRecipes,
    selectedRecipe,
    updateRecipeControls,
    saveCurrentRecipe,
    loadSelectedRecipe,
    deleteSelectedRecipe,
    exportCurrentRecipe,
    exportSelectedRecipe,
    exportAllRecipes,
    importRecipeFile
  };
}
