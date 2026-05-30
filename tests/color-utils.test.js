import test from "node:test";
import assert from "node:assert/strict";
import { colorInfoLabel, visibleSwatchLab } from "../src/color-utils.js";

test("colorInfoLabel derives LCH from visible hex before internal lab fallback", () => {
  assert.equal(colorInfoLabel("#000003", [0, 7.4, 0]), "#000003 · LCH 4.4 3.0 0°");
  assert.doesNotMatch(colorInfoLabel("#000003", [0, 7.4, 0]), /LCH 0\.0 7\.4/);
});

test("colorInfoLabel still formats lab-only colors when no hex is available", () => {
  assert.equal(colorInfoLabel("", [0, 7.4, 0]), "LCH 0.0 7.4 0°");
});


test("visibleSwatchLab prefers the painted hex over stale internal lab", () => {
  const lab = visibleSwatchLab({hex: "#000003", lab: [0, 7.4, 0]});
  assert.ok(lab);
  assert.ok(Math.abs(lab[0] - 4.4) < 0.2);
  assert.ok(Math.abs(Math.hypot(lab[1], lab[2]) - 3.0) < 0.2);
});
