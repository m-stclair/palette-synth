export function createStatusController({els, state}) {
  function idleStatusText() {
    return state.imageData ? "Ready" : "Open image";
  }

  function setStatus(text) {
    if (!els.status) return;
    const next = text || idleStatusText();
    els.status.textContent = next;
    els.status.classList.toggle("is-transient", next !== idleStatusText());
  }

  return {setStatus};
}
