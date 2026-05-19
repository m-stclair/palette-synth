import test from "node:test";
import assert from "node:assert/strict";
import { colorInfoLabel } from "../src/color-utils.js";

test("colorInfoLabel derives LCH from visible hex before internal lab fallback", () => {
  assert.equal(colorInfoLabel("#000003", [0, 7.4, 0]), "#000003 · LCH 4.4 3.0 264°");
  assert.doesNotMatch(colorInfoLabel("#000003", [0, 7.4, 0]), /LCH 0\.0 7\.4/);
});

test("colorInfoLabel still formats lab-only colors when no hex is available", () => {
  assert.equal(colorInfoLabel("", [0, 7.4, 0]), "LCH 0.0 7.4 0°");
});
