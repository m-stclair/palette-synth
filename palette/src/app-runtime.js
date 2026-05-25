import { loadShaders } from "./shaders/index.js";
import { createPaletteSynthApp } from "./app/create-app.js";

let hasStarted = false;

export async function startApp() {
  if (hasStarted) return;
  hasStarted = true;

  const shaders = await loadShaders();
  const app = createPaletteSynthApp({shaders, document, window});
  startWhenReady(() => app.init());
}

function startWhenReady(init) {
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init, {once: true});
  } else {
    init();
  }
}

