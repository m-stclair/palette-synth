import test from "node:test";
import assert from "node:assert/strict";
import { createAppPorts } from "../src/app/ports.js";

test("app ports expose named deferred controller capabilities", () => {
  const ports = createAppPorts();

  assert.throws(
    () => ports.render.queueRender(),
    /renderSessionController\.queueRender called before renderSessionController is attached/
  );
  assert.equal(ports.diagnosticsActions.optionalUpdateDiagnostics({immediate: true}), undefined);

  const calls = [];
  ports.renderSession.attach({
    queueRender(options) {
      calls.push([this, options]);
      return "queued";
    }
  });

  const options = {immediate: true};
  assert.equal(ports.render.queueRender(options), "queued");
  assert.equal(calls[0][0], ports.renderSession.get());
  assert.equal(calls[0][1], options);
});

test("app ports reject missing controller targets", () => {
  const ports = createAppPorts();
  assert.throws(() => ports.config.attach(null), /configController requires an object target/);
});
