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

test("postProcessActive treats edge tighten as an independent post-process", () => {
  assert.equal(postProcessActive({edgeTightenEnabled: false, edgeTightenStrength: 2}), false);
  assert.equal(postProcessActive({edgeTightenEnabled: true, edgeTightenStrength: 0}), false);
  assert.equal(postProcessActive({edgeTightenEnabled: true, edgeTightenStrength: 1}), true);
});

test("postProcessActive is false while a diagnostic overlay is active", () => {
  const active = {despeckleEnabled: true, despeckleStrength: 2};
  assert.equal(postProcessActive(active, {mode: "none"}), true);
  assert.equal(postProcessActive(active, {mode: "difference"}), false);
  assert.equal(postProcessActive(active, {mode: "swatch"}), false);
});

test("postProcessSettingsFromConfig clamps and normalizes post-process values", () => {
  const settings = postProcessSettingsFromConfig({
    despeckleEnabled: 1,
    despeckleStrength: 99,
    edgeTightenEnabled: 1,
    edgeTightenStrength: 99,
    ditherProtectionEnabled: true,
    assignMode: "dither",
    ditherPattern: "ordered8",
    ditherScale: 99,
    ditherAngle: -999
  });
  assert.equal(settings.despeckleEnabled, true);
  assert.equal(settings.despeckleStrength, 4);
  assert.equal(settings.edgeTightenEnabled, true);
  assert.equal(settings.edgeTightenStrength, 2);
  assert.equal(settings.ditherProtectionEnabled, true);
  assert.equal(settings.ditherKnown, true);
  assert.equal(settings.ditherPattern, 2);
  assert.equal(settings.ditherScale, 12);
  assert.equal(settings.ditherAngle, -180);
});

test("postProcessSettingsFromConfig uses safe defaults for missing keys", () => {
  const settings = postProcessSettingsFromConfig({});
  assert.equal(settings.despeckleEnabled, false);
  assert.equal(settings.despeckleStrength, 0);
  assert.equal(settings.edgeTightenEnabled, false);
  assert.equal(settings.edgeTightenStrength, 0);
  assert.equal(settings.ditherProtectionEnabled, true);
  assert.equal(settings.ditherKnown, false);
  assert.equal(settings.ditherPattern, 1);
  assert.equal(settings.ditherScale, 1);
  assert.equal(settings.ditherAngle, 0);
});


test("postProcessSettingsFromConfig can disable the dither protection veto", () => {
  const settings = postProcessSettingsFromConfig({
    ditherProtectionEnabled: false,
    assignMode: "dither",
    ditherPattern: "hash"
  });
  assert.equal(settings.ditherProtectionEnabled, false);
  assert.equal(settings.ditherKnown, false);
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
