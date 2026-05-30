import test from "node:test";
import assert from "node:assert/strict";
import { constrainedKMeansLabs } from "../src/palette/kmeans.js";

test("constrained k-means keeps fixed centers anchored and moves only movable centers", () => {
  const samples = [
    [0, 0, 0],
    [1, 0, 0],
    [100, 0, 0],
    [101, 0, 0]
  ];

  const result = constrainedKMeansLabs(samples, {
    fixedCenters: [[0, 0, 0]],
    movableCenters: [[50, 0, 0]],
    maxIterations: 12,
    snapToSamples: true
  });

  assert.deepEqual(result.fixedCenters, [[0, 0, 0]]);
  assert.equal(result.movableCenters.length, 1);
  assert.ok(result.movableCenters[0][0] >= 100);
});

test("constrained k-means can seed a new movable center from residual error", () => {
  const samples = [
    [0, 0, 0],
    [0.5, 0, 0],
    [80, 20, 0],
    [82, 20, 0]
  ];

  const result = constrainedKMeansLabs(samples, {
    fixedCenters: [[0, 0, 0]],
    movableCount: 1,
    seed: 3,
    maxIterations: 12,
    snapToSamples: true
  });

  assert.equal(result.movableCenters.length, 1);
  assert.ok(result.movableCenters[0][0] >= 80);
});
