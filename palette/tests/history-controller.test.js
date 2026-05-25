import test from "node:test";
import assert from "node:assert/strict";
import { createHistoryController } from "../src/state/history.js";

function createHarness({limit = 80} = {}) {
  let current = {value: 0};
  const statuses = [];
  const els = {
    undoButton: {disabled: true},
    redoButton: {disabled: true}
  };
  const state = {
    history: {
      undo: [],
      redo: [],
      pending: null,
      applying: false,
      limit
    }
  };
  const controller = createHistoryController({
    els,
    state,
    getSnapshot: () => ({...current}),
    applySnapshot: snapshot => {
      current = {...snapshot};
    },
    setStatus: message => statuses.push(message)
  });
  return {
    controller,
    state,
    els,
    statuses,
    get current() {
      return current;
    },
    mutate(value) {
      current.value = value;
    }
  };
}

test("withHistory records changes and skips no-op snapshots", () => {
  const harness = createHarness();
  const {controller, state, els} = harness;

  controller.withHistory("Change value", () => harness.mutate(1));

  assert.equal(state.history.undo.length, 1);
  assert.deepEqual(state.history.undo[0], {snapshot: {value: 0}, label: "Change value"});
  assert.equal(state.history.redo.length, 0);
  assert.equal(els.undoButton.disabled, false);
  assert.equal(els.redoButton.disabled, true);

  controller.withHistory("No-op", () => harness.mutate(1));

  assert.equal(state.history.undo.length, 1);
});

test("undo and redo apply snapshots, move stacks, and announce labels", () => {
  const harness = createHarness();
  const {controller, state, statuses} = harness;

  controller.withHistory("Change value", () => harness.mutate(1));
  controller.undoHistory();

  assert.deepEqual(harness.current, {value: 0});
  assert.equal(state.history.undo.length, 0);
  assert.equal(state.history.redo.length, 1);
  assert.equal(statuses.at(-1), "Undid Change value.");

  controller.redoHistory();

  assert.deepEqual(harness.current, {value: 1});
  assert.equal(state.history.undo.length, 1);
  assert.equal(state.history.redo.length, 0);
  assert.equal(statuses.at(-1), "Redid Change value.");
});

test("history limit drops the oldest undo snapshot", () => {
  const harness = createHarness({limit: 2});
  const {controller, state} = harness;

  controller.withHistory("One", () => harness.mutate(1));
  controller.withHistory("Two", () => harness.mutate(2));
  controller.withHistory("Three", () => harness.mutate(3));

  assert.deepEqual(state.history.undo.map(entry => entry.label), ["Two", "Three"]);
});

test("keyboard shortcuts route undo, redo, and escape cancellation", () => {
  const harness = createHarness();
  let shouldCancel = false;
  let cancelCount = 0;
  const listeners = [];
  const target = {
    addEventListener(type, listener) {
      if (type === "keydown") listeners.push(listener);
    }
  };
  const controller = createHistoryController({
    els: {},
    state: harness.state,
    getSnapshot: () => ({...harness.current}),
    applySnapshot: snapshot => harness.mutate(snapshot.value),
    shouldCancelShortcut: () => shouldCancel,
    cancelShortcut: () => {
      cancelCount += 1;
    }
  });
  controller.withHistory("Change value", () => harness.mutate(1));
  controller.bindHistoryShortcuts(target);

  let prevented = 0;
  listeners[0]({
    key: "z",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target: {},
    preventDefault: () => {
      prevented += 1;
    }
  });

  assert.equal(prevented, 1);
  assert.deepEqual(harness.current, {value: 0});

  listeners[0]({
    key: "z",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: true,
    target: {},
    preventDefault: () => {
      prevented += 1;
    }
  });

  assert.equal(prevented, 2);
  assert.deepEqual(harness.current, {value: 1});

  shouldCancel = true;
  listeners[0]({
    key: "Escape",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target: {},
    preventDefault: () => {
      prevented += 1;
    }
  });

  assert.equal(prevented, 3);
  assert.equal(cancelCount, 1);
});
