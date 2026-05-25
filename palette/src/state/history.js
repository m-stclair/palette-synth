export function snapshotsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createHistoryController({
  els,
  state,
  getSnapshot,
  applySnapshot,
  setStatus = () => {},
  shouldCancelShortcut = () => false,
  cancelShortcut = () => {},
  snapshotsEqual: equalSnapshots = snapshotsEqual
}) {
  if (!state?.history) throw new Error("createHistoryController requires state.history.");
  if (typeof getSnapshot !== "function") throw new Error("createHistoryController requires getSnapshot().");
  if (typeof applySnapshot !== "function") throw new Error("createHistoryController requires applySnapshot().");

  function updateHistoryButtons() {
    if (els?.undoButton) els.undoButton.disabled = !state.history.undo.length;
    if (els?.redoButton) els.redoButton.disabled = !state.history.redo.length;
  }

  function pushHistorySnapshot(before, label = "Change settings") {
    if (state.history.applying || !before) return false;
    const after = getSnapshot();
    if (equalSnapshots(before, after)) {
      updateHistoryButtons();
      return false;
    }
    state.history.undo.push({snapshot: before, label});
    if (state.history.undo.length > state.history.limit) state.history.undo.shift();
    state.history.redo = [];
    updateHistoryButtons();
    return true;
  }

  function beginHistory(label = "Change settings") {
    if (state.history.applying || state.history.pending) return;
    state.history.pending = {snapshot: getSnapshot(), label};
  }

  function commitHistory(label = null) {
    if (state.history.applying || !state.history.pending) return false;
    const pending = state.history.pending;
    state.history.pending = null;
    return pushHistorySnapshot(pending.snapshot, label || pending.label);
  }

  function cancelPendingHistory() {
    state.history.pending = null;
  }

  function withHistory(label, mutator) {
    beginHistory(label);
    try {
      return mutator();
    } finally {
      commitHistory(label);
    }
  }

  function applyHistorySnapshot(snapshot) {
    state.history.applying = true;
    try {
      applySnapshot(snapshot);
    } finally {
      state.history.applying = false;
      updateHistoryButtons();
    }
  }

  function undoHistory() {
    if (!state.history.undo.length) return;
    cancelPendingHistory();
    const current = getSnapshot();
    const entry = state.history.undo.pop();
    state.history.redo.push({snapshot: current, label: entry.label});
    applyHistorySnapshot(entry.snapshot);
    setStatus(`Undid ${entry.label}.`);
  }

  function redoHistory() {
    if (!state.history.redo.length) return;
    cancelPendingHistory();
    const current = getSnapshot();
    const entry = state.history.redo.pop();
    state.history.undo.push({snapshot: current, label: entry.label});
    applyHistorySnapshot(entry.snapshot);
    setStatus(`Redid ${entry.label}.`);
  }

  function bindHistoryShortcuts(target = document) {
    target.addEventListener("keydown", e => {
      if (e.key === "Escape" && shouldCancelShortcut()) {
        e.preventDefault();
        cancelShortcut();
        return;
      }
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const targetElement = e.target;
      if (targetElement?.closest?.('input, select, textarea, [contenteditable], dialog[open]')) return;
      const key = e.key.toLowerCase();
      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) redoHistory();
        else undoHistory();
      } else if (key === "y" && !e.shiftKey) {
        e.preventDefault();
        redoHistory();
      }
    });
  }

  return {
    beginHistory,
    commitHistory,
    cancelPendingHistory,
    withHistory,
    pushHistorySnapshot,
    undoHistory,
    redoHistory,
    bindHistoryShortcuts,
    updateHistoryButtons
  };
}
