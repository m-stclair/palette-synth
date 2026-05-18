import { readJsonStorage, writeJsonStorage } from "./local-storage.js";

const WORKBENCH_STORAGE_KEY = "paletteSynth.workbench.v7";

const DEFAULT_WORKBENCH_PREFS = {
  dock: "right",
  width: 308,
  height: 300,
  collapsed: {
    "recipes": true,
    "animation-export": true,
    "selection-diagnostics": true,
    "diagnostics": true,
    "pixel-inspector": true
  }
};

export function loadWorkbenchPrefs() {
  const stored = readJsonStorage(WORKBENCH_STORAGE_KEY, {});
  const prefs = {
    ...DEFAULT_WORKBENCH_PREFS,
    ...(stored && typeof stored === "object" ? stored : {}),
    collapsed: {
      ...DEFAULT_WORKBENCH_PREFS.collapsed,
      ...(stored && typeof stored.collapsed === "object" ? stored.collapsed : {})
    }
  };
  if (!["left", "right", "bottom"].includes(prefs.dock)) prefs.dock = "right";
  return prefs;
}

export function saveWorkbenchPrefs(prefs) {
  writeJsonStorage(WORKBENCH_STORAGE_KEY, prefs);
}
