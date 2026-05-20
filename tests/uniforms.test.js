import test from "node:test";
import assert from "node:assert/strict";
import { uniformArrayLocation, uniformLocation } from "../src/gl/uniforms.js";

function makeGl({missing = new Set()} = {}) {
  const calls = [];
  return {
    calls,
    getUniformLocation(program, name) {
      calls.push([program, name]);
      if (missing.has(name)) return null;
      return {program, name};
    }
  };
}

test("uniformLocation caches locations by WebGL context, program, and name", () => {
  const gl = makeGl();
  const programA = {id: "a"};
  const programB = {id: "b"};

  const first = uniformLocation(gl, programA, "u_image");
  const second = uniformLocation(gl, programA, "u_image");
  const third = uniformLocation(gl, programA, "u_resolution");
  const fourth = uniformLocation(gl, programB, "u_image");

  assert.equal(first, second);
  assert.notEqual(first, third);
  assert.notEqual(first, fourth);
  assert.deepEqual(
    gl.calls.map(([, name]) => name),
    ["u_image", "u_resolution", "u_image"]
  );
});

test("uniformLocation keeps separate caches for separate WebGL contexts", () => {
  const program = {id: "shared"};
  const glA = makeGl();
  const glB = makeGl();

  uniformLocation(glA, program, "u_image");
  uniformLocation(glA, program, "u_image");
  uniformLocation(glB, program, "u_image");
  uniformLocation(glB, program, "u_image");

  assert.equal(glA.calls.length, 1);
  assert.equal(glB.calls.length, 1);
});

test("uniformArrayLocation caches missing base lookups and array fallback lookups", () => {
  const gl = makeGl({missing: new Set(["u_kernelWeights"])});
  const program = {id: "kernel"};

  const first = uniformArrayLocation(gl, program, "u_kernelWeights");
  const second = uniformArrayLocation(gl, program, "u_kernelWeights");

  assert.equal(first, second);
  assert.deepEqual(
    gl.calls.map(([, name]) => name),
    ["u_kernelWeights", "u_kernelWeights[0]"]
  );
});
