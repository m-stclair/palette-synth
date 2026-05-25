function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

export function compareSplitFromClientX(clientX, rect) {
  return clamp01((clientX - rect.left) / Math.max(rect.width, 1));
}

export function clientNearCompareSplit({clientX, clientY, rect, split, enabled, threshold = 12}) {
  if (!enabled) return false;
  const withinY = clientY >= rect.top && clientY <= rect.top + rect.height;
  if (!withinY) return false;
  const splitX = rect.left + rect.width * clamp01(split);
  return Math.abs(clientX - splitX) <= threshold;
}

export function createCompareSplitController({els, config, getDisplayViewRect, queueRender}) {
  function setCompareSplit(value, {updateControl = true, queue = true} = {}) {
    const next = Number(value);
    config.compareSplit = clamp01(Number.isFinite(next) ? next : 0.5);
    if (updateControl && els.compareSplit) {
      els.compareSplit.value = Math.round(config.compareSplit * 100);
    }
    if (els.compareSplitValue) {
      els.compareSplitValue.textContent = `${Math.round(config.compareSplit * 100)}%`;
    }
    if (queue) queueRender();
  }

  function setCompareEnabled(enabled, {updateControl = true, queue = true} = {}) {
    config.compareEnabled = !!enabled;
    if (updateControl && els.compareToggle) els.compareToggle.checked = config.compareEnabled;
    if (els.compareSplit) els.compareSplit.disabled = !config.compareEnabled;
    if (els.canvas) els.canvas.classList.toggle("is-comparing", config.compareEnabled);
    if (queue) queueRender();
  }

  function pointerCompareSplit(clientX) {
    return compareSplitFromClientX(clientX, getDisplayViewRect());
  }

  function isNearCompareSplit(clientX, clientY) {
    return clientNearCompareSplit({
      clientX,
      clientY,
      rect: getDisplayViewRect(),
      split: config.compareSplit,
      enabled: config.compareEnabled
    });
  }

  function syncCompareControls({queue = false} = {}) {
    setCompareEnabled(config.compareEnabled, {queue});
    setCompareSplit(config.compareSplit, {queue});
  }

  return {
    setCompareSplit,
    setCompareEnabled,
    pointerCompareSplit,
    isNearCompareSplit,
    syncCompareControls
  };
}
