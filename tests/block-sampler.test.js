import test from "node:test";
import assert from "node:assert/strict";
import {
  blockSampleModeCode,
  blockSamplePassNeeded,
  renderBlockSamplePass,
  BLOCK_SAMPLE_MODE
} from "../src/gl/block-sampler.js";

test("block sampler exposes representative sample mode", () => {
  assert.equal(blockSampleModeCode("center"), BLOCK_SAMPLE_MODE.center);
  assert.equal(blockSampleModeCode("mean"), BLOCK_SAMPLE_MODE.mean);
  assert.equal(blockSampleModeCode("representative"), BLOCK_SAMPLE_MODE.representative);
  assert.equal(blockSampleModeCode("missing"), BLOCK_SAMPLE_MODE.center);
});

test("block sample pass runs for enabled non-center art-pixel modes only", () => {
  assert.equal(blockSamplePassNeeded({pixelArtEnabled: false, pixelBlockSize: 4, pixelBlockSampleMode: "mean"}), false);
  assert.equal(blockSamplePassNeeded({pixelArtEnabled: true, pixelBlockSize: 1, pixelBlockSampleMode: "representative"}), false);
  assert.equal(blockSamplePassNeeded({pixelArtEnabled: true, pixelBlockSize: 4, pixelBlockSampleMode: "center"}), false);
  assert.equal(blockSamplePassNeeded({pixelArtEnabled: true, pixelBlockSize: 4, pixelBlockSampleMode: "mean"}), true);
  assert.equal(blockSamplePassNeeded({pixelArtEnabled: true, pixelBlockSize: 4, pixelBlockSampleMode: "representative"}), true);
  assert.equal(blockSamplePassNeeded({pixelArtEnabled: true, pixelBlockSize: 4, pixelBlockSampleMode: "missing"}), false);
});

test("block sample pass restores the caller framebuffer", () => {
  const calls = [];
  const previousFramebuffer = {id: "offscreen"};
  const state = {framebuffer: previousFramebuffer, activeTexture: "TEXTURE0"};
  const gl = {
    TEXTURE_2D: "TEXTURE_2D",
    TEXTURE_MIN_FILTER: "TEXTURE_MIN_FILTER",
    TEXTURE_MAG_FILTER: "TEXTURE_MAG_FILTER",
    TEXTURE_WRAP_S: "TEXTURE_WRAP_S",
    TEXTURE_WRAP_T: "TEXTURE_WRAP_T",
    TEXTURE0: "TEXTURE0",
    ACTIVE_TEXTURE: "ACTIVE_TEXTURE",
    NEAREST: "NEAREST",
    CLAMP_TO_EDGE: "CLAMP_TO_EDGE",
    RGBA: "RGBA",
    UNSIGNED_BYTE: "UNSIGNED_BYTE",
    FRAMEBUFFER: "FRAMEBUFFER",
    FRAMEBUFFER_BINDING: "FRAMEBUFFER_BINDING",
    COLOR_ATTACHMENT0: "COLOR_ATTACHMENT0",
    FRAMEBUFFER_COMPLETE: "FRAMEBUFFER_COMPLETE",
    TRIANGLES: "TRIANGLES",
    getParameter: pname => {
      if (pname === "FRAMEBUFFER_BINDING") return state.framebuffer;
      if (pname === "ACTIVE_TEXTURE") return state.activeTexture;
      return null;
    },
    activeTexture: texture => {
      state.activeTexture = texture;
      calls.push(["activeTexture", texture]);
    },
    bindTexture: (...args) => calls.push(["bindTexture", ...args]),
    texParameteri: (...args) => calls.push(["texParameteri", ...args]),
    texImage2D: (...args) => calls.push(["texImage2D", ...args]),
    bindFramebuffer: (_target, framebuffer) => {
      state.framebuffer = framebuffer;
      calls.push(["bindFramebuffer", framebuffer]);
    },
    framebufferTexture2D: (...args) => calls.push(["framebufferTexture2D", ...args]),
    checkFramebufferStatus: () => "FRAMEBUFFER_COMPLETE",
    useProgram: (...args) => calls.push(["useProgram", ...args]),
    viewport: (...args) => calls.push(["viewport", ...args]),
    getUniformLocation: (_program, name) => name,
    uniform1i: (...args) => calls.push(["uniform1i", ...args]),
    uniform2i: (...args) => calls.push(["uniform2i", ...args]),
    drawArrays: (...args) => calls.push(["drawArrays", ...args])
  };

  renderBlockSamplePass(gl, "program", {
    sourceTexture: {id: "source"},
    targetTexture: {id: "target"},
    framebuffer: {id: "block-sample"},
    sourceSize: [12, 10],
    targetSize: {width: 4, height: 3},
    blockSize: 3,
    sampleMode: "mean"
  });

  assert.equal(state.framebuffer, previousFramebuffer);
  assert.deepEqual(calls.at(-2), ["bindTexture", "TEXTURE_2D", null]);
  assert.deepEqual(calls.at(-1), ["activeTexture", "TEXTURE0"]);
  assert.ok(calls.some(call => call[0] === "bindFramebuffer" && call[1]?.id === "block-sample"));
  assert.ok(calls.some(call => call[0] === "bindFramebuffer" && call[1] === previousFramebuffer));
});
