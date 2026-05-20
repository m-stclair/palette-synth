import { cloneDefaultConfig } from "../state/config.js";
import { createRuntimeState } from "./runtime-state.js";

export function createAppCore({
  shaders = {},
  document = globalThis.document,
  window = globalThis.window,
  requestAnimationFrame = globalThis.requestAnimationFrame,
  cancelAnimationFrame = globalThis.cancelAnimationFrame,
  Image = globalThis.Image,
  URL = globalThis.URL
} = {}) {
  const requestFrame = typeof requestAnimationFrame === "function" ? requestAnimationFrame.bind(window || globalThis) : undefined;
  const cancelFrame = typeof cancelAnimationFrame === "function" ? cancelAnimationFrame.bind(window || globalThis) : undefined;

  const state = createRuntimeState({document});
  const els = {};
  const config = cloneDefaultConfig();

  return {
    env: {
      document,
      window,
      Image,
      URL,
      requestAnimationFrame,
      cancelAnimationFrame,
      requestFrame,
      cancelFrame
    },
    shaders: {
      FRAGMENT_SHADER_BODY: shaders.FRAGMENT_SHADER_BODY || "",
      VERTEX_SHADER: shaders.VERTEX_SHADER || "",
      LEVELS_FRAGMENT_SHADER: shaders.LEVELS_FRAGMENT_SHADER || "",
      CLARITY_LIGHTNESS_BLUR_FRAGMENT_SHADER: shaders.CLARITY_LIGHTNESS_BLUR_FRAGMENT_SHADER || "",
      CLARITY_SHARP_FRAGMENT_SHADER: shaders.CLARITY_SHARP_FRAGMENT_SHADER || "",
      CLARITY_SHARP_BLUR_FRAGMENT_SHADER: shaders.CLARITY_SHARP_BLUR_FRAGMENT_SHADER || "",
      CLARITY_FRAGMENT_SHADER: shaders.CLARITY_FRAGMENT_SHADER || "",
      BLOCK_SAMPLE_FRAGMENT_SHADER: shaders.BLOCK_SAMPLE_FRAGMENT_SHADER || "",
      PALETTE_POST_FRAGMENT_SHADER: shaders.PALETTE_POST_FRAGMENT_SHADER || "",
      VIEW_COMPOSITE_FRAGMENT_SHADER: shaders.VIEW_COMPOSITE_FRAGMENT_SHADER || ""
    },
    state,
    els,
    config
  };
}
