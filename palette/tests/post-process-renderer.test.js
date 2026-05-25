import test from "node:test";
import assert from "node:assert/strict";
import {
  postProcessActive,
  postProcessSettingsFromConfig,
  renderPostProcessPasses
} from "../src/gl/post-process-renderer.js";

test("postProcessActive is false when despeckle is disabled", () => {
  assert.equal(postProcessActive({}), false);
  assert.equal(postProcessActive({despeckleEnabled: false}), false);
});

test("postProcessActive treats despeckle with zero strength as inactive", () => {
  assert.equal(postProcessActive({despeckleEnabled: true, despeckleStrength: 0}), false);
  assert.equal(postProcessActive({despeckleEnabled: true, despeckleStrength: 1}), true);
});

test("postProcessActive is false while a diagnostic overlay is active", () => {
  const active = {despeckleEnabled: true, despeckleStrength: 2};
  assert.equal(postProcessActive(active, {mode: "none"}), true);
  assert.equal(postProcessActive(active, {mode: "difference"}), false);
  assert.equal(postProcessActive(active, {mode: "swatch"}), false);
});

test("postProcessSettingsFromConfig clamps and normalizes despeckle values", () => {
  const settings = postProcessSettingsFromConfig({
    despeckleEnabled: 1,
    despeckleStrength: 99
  });
  assert.equal(settings.despeckleEnabled, true);
  assert.equal(settings.despeckleStrength, 4);
});

test("postProcessSettingsFromConfig uses safe defaults for missing keys", () => {
  const settings = postProcessSettingsFromConfig({});
  assert.equal(settings.despeckleEnabled, false);
  assert.equal(settings.despeckleStrength, 0);
});


test("renderPostProcessPasses reallocates ping-pong textures when cache is dirty", () => {
  const calls = [];
  let textureId = 0;
  const gl = {
    TEXTURE_2D: "TEXTURE_2D",
    TEXTURE_MIN_FILTER: "TEXTURE_MIN_FILTER",
    TEXTURE_MAG_FILTER: "TEXTURE_MAG_FILTER",
    TEXTURE_WRAP_S: "TEXTURE_WRAP_S",
    TEXTURE_WRAP_T: "TEXTURE_WRAP_T",
    NEAREST: "NEAREST",
    CLAMP_TO_EDGE: "CLAMP_TO_EDGE",
    RGBA: "RGBA",
    UNSIGNED_BYTE: "UNSIGNED_BYTE",
    FRAMEBUFFER: "FRAMEBUFFER",
    createTexture: () => ({id: ++textureId}),
    bindTexture: (...args) => calls.push(["bindTexture", ...args]),
    texParameteri: (...args) => calls.push(["texParameteri", ...args]),
    texImage2D: (...args) => calls.push(["texImage2D", ...args]),
    createFramebuffer: () => ({id: "fb"}),
    bindFramebuffer: (...args) => calls.push(["bindFramebuffer", ...args])
  };
  const cache = {dirty: true};

  renderPostProcessPasses(gl, cache, {
    inputTexture: {id: "input"},
    width: 8,
    height: 4,
    vertexSource: "v",
    fragmentSource: "f",
    settings: {despeckleEnabled: false, despeckleStrength: 0}
  });

  assert.equal(calls.filter(call => call[0] === "texImage2D").length, 2);
  assert.equal(cache.dirty, false);

  renderPostProcessPasses(gl, cache, {
    inputTexture: {id: "input"},
    width: 8,
    height: 4,
    vertexSource: "v",
    fragmentSource: "f",
    settings: {despeckleEnabled: false, despeckleStrength: 0}
  });
  assert.equal(calls.filter(call => call[0] === "texImage2D").length, 2);

  cache.dirty = true;
  renderPostProcessPasses(gl, cache, {
    inputTexture: {id: "input"},
    width: 8,
    height: 4,
    vertexSource: "v",
    fragmentSource: "f",
    settings: {despeckleEnabled: false, despeckleStrength: 0}
  });
  assert.equal(calls.filter(call => call[0] === "texImage2D").length, 4);
});
