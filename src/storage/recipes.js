import { readJsonStorage, writeJsonStorage } from "./local-storage.js";

export const RECIPE_FILE_KIND = "palette-synth-recipe";
const RECIPE_STORAGE_KEY = "paletteSynth.recipes.v1";

export function createRecipeId() {
  return (globalThis.crypto?.randomUUID?.() || `recipe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
}

export function defaultRecipeName() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `Recipe ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
}

export function sanitizeRecipeName(name, fallback = defaultRecipeName()) {
  const clean = String(name || "").replace(/\s+/g, " ").trim().slice(0, 80);
  return clean || fallback;
}

export function slugifyRecipeName(name) {
  return sanitizeRecipeName(name, "palette-synth-recipe")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "palette-synth-recipe";
}

export function recipeConfigFromUnknown(value, {sanitizeConfigSnapshot}) {
  if (!value || typeof value !== "object") throw new Error("Recipe JSON must be an object.");
  if (value.config && typeof value.config === "object") return sanitizeConfigSnapshot(value.config);
  if (value.recipe?.config && typeof value.recipe.config === "object") return sanitizeConfigSnapshot(value.recipe.config);
  return sanitizeConfigSnapshot(value);
}

export function normalizeRecipeRecord(raw, {sanitizeConfigSnapshot, fallbackName = "Imported recipe"}) {
  const now = new Date().toISOString();
  const configSnapshot = recipeConfigFromUnknown(raw, {sanitizeConfigSnapshot});
  return {
    id: String(raw?.id || createRecipeId()),
    name: sanitizeRecipeName(raw?.name || raw?.title, fallbackName),
    createdAt: String(raw?.createdAt || now),
    updatedAt: String(raw?.updatedAt || now),
    config: configSnapshot
  };
}

export function recipeRecordsFromUnknown(value, {sanitizeConfigSnapshot, fallbackName = "Imported recipe"}) {
  if (!value || typeof value !== "object") throw new Error("Recipe JSON must be an object.");
  const rawRecipes = Array.isArray(value)
    ? value
    : (Array.isArray(value.recipes) ? value.recipes : null);
  if (rawRecipes) {
    return rawRecipes.map((item, index) => normalizeRecipeRecord(item, {sanitizeConfigSnapshot, fallbackName: `${fallbackName} ${index + 1}`}));
  }
  return [normalizeRecipeRecord(value, {sanitizeConfigSnapshot, fallbackName})];
}

export function loadRecipes({sanitizeConfigSnapshot}) {
  const parsed = readJsonStorage(RECIPE_STORAGE_KEY, null);
  if (!parsed) return [];
  try {
    return recipeRecordsFromUnknown(parsed, {sanitizeConfigSnapshot, fallbackName: "Saved recipe"});
  } catch {
    return [];
  }
}

export function saveRecipes(recipes) {
  return writeJsonStorage(RECIPE_STORAGE_KEY, {
    app: "Palette Synth",
    kind: RECIPE_FILE_KIND,
    version: 1,
    savedAt: new Date().toISOString(),
    recipes: Array.isArray(recipes) ? recipes : []
  });
}

export function recipeFileFor(record, {sanitizeConfigSnapshot}) {
  return {
    app: "Palette Synth",
    kind: RECIPE_FILE_KIND,
    version: 1,
    exportedAt: new Date().toISOString(),
    name: record.name,
    config: sanitizeConfigSnapshot(record.config)
  };
}

export function recipeCollectionFileFor(recipes, {sanitizeConfigSnapshot}) {
  return {
    app: "Palette Synth",
    kind: `${RECIPE_FILE_KIND}-collection`,
    version: 1,
    exportedAt: new Date().toISOString(),
    recipes: (Array.isArray(recipes) ? recipes : []).map(recipe => recipeFileFor(recipe, {sanitizeConfigSnapshot}))
  };
}
