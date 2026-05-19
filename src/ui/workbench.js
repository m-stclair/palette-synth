import { clamp } from "../color-utils.js";
import { loadWorkbenchPrefs, saveWorkbenchPrefs } from "../storage/workbench.js";
import { $ } from "./dom.js";

function setCssPx(doc, name, value) {
  doc.documentElement.style.setProperty(name, `${Math.round(value)}px`);
}

const FOCUS_TOOLBAR_PANEL_EVENT = "palette-synth:focus-panel";
const PANEL_SCROLL_CLASS = "tool-pane-panel-scroll";

function normalizePanelKey(text = "") {
  return String(text).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function panelKey(panel, heading, index) {
  return panel.dataset.panelKey || normalizePanelKey(heading.textContent) || `panel-${index}`;
}

function panelIsVisuallyAvailable(panel, win) {
  if (!panel || panel.hidden || panel.closest?.("[hidden]")) return false;
  const style = typeof win?.getComputedStyle === "function" ? win.getComputedStyle(panel) : null;
  return !style || (style.display !== "none" && style.visibility !== "hidden");
}


function elementOffsetWithinScroller(element, scroller, axis) {
  const scrollProperty = axis === "x" ? "scrollLeft" : "scrollTop";
  const rectProperty = axis === "x" ? "left" : "top";
  const offsetProperty = axis === "x" ? "offsetLeft" : "offsetTop";
  const scrollerScroll = Number(scroller?.[scrollProperty]) || 0;

  if (typeof element?.getBoundingClientRect === "function" && typeof scroller?.getBoundingClientRect === "function") {
    const elementRect = element.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const delta = Number(elementRect?.[rectProperty]) - Number(scrollerRect?.[rectProperty]);
    if (Number.isFinite(delta)) return scrollerScroll + delta;
  }

  return Number(element?.[offsetProperty]) || 0;
}

function scrollPanelIntoPane(panel, scroller, {behavior = "smooth"} = {}) {
  if (!panel) return false;
  if (!scroller || scroller === panel || !scroller.contains?.(panel)) {
    if (typeof panel.scrollIntoView === "function") {
      panel.scrollIntoView({block: "start", inline: "nearest", behavior});
      return true;
    }
    return false;
  }

  const top = Math.max(0, elementOffsetWithinScroller(panel, scroller, "y") - 3);
  const left = Math.max(0, elementOffsetWithinScroller(panel, scroller, "x") - 3);

  if (typeof scroller.scrollTo === "function") scroller.scrollTo({top, left, behavior});
  else {
    scroller.scrollTop = top;
    scroller.scrollLeft = left;
  }
  return true;
}

function ensurePanelScroller(toolPane, doc) {
  let scroller = Array.from(toolPane.children || []).find(child => child.classList?.contains(PANEL_SCROLL_CLASS));
  if (scroller) return scroller;

  scroller = doc.createElement("div");
  scroller.className = PANEL_SCROLL_CLASS;
  scroller.setAttribute("data-panel-scroll", "");

  const directPanels = Array.from(toolPane.children || []).filter(child => child.classList?.contains("panel"));
  if (!directPanels.length) {
    toolPane.append(scroller);
    return scroller;
  }

  toolPane.insertBefore(scroller, directPanels[0]);
  directPanels.forEach(panel => scroller.append(panel));
  return scroller;
}

export function initWorkbench({
  root,
  queueRender = () => {},
  updateDiagnostics = () => {},
  resetPanelControls = null,
  panelHasResettableControls = null
} = {}) {
  const rootDocument = root || (typeof document !== "undefined" ? document : null);
  if (!rootDocument) return;

  const workbench = $("workbench", rootDocument);
  const toolPane = $("toolPane", rootDocument);
  const paneResizer = $("paneResizer", rootDocument);
  if (!workbench || !toolPane) return;

  const doc = workbench.ownerDocument || rootDocument;
  const win = doc.defaultView || (typeof window !== "undefined" ? window : null);
  const requestFrame = win?.requestAnimationFrame ? callback => win.requestAnimationFrame(callback) : callback => callback();
  const prefs = loadWorkbenchPrefs();
  const panelScroller = ensurePanelScroller(toolPane, doc);
  const dockButtons = Array.from(toolPane.querySelectorAll("[data-dock-target]"));
  const collapseAllButton = toolPane.querySelector("[data-collapse-all-panels]");
  const panels = Array.from(toolPane.querySelectorAll(".panel"));
  const panelRecords = [];

  function applyDock(dock) {
    const safeDock = ["left", "right", "bottom"].includes(dock) ? dock : "right";
    prefs.dock = safeDock;
    workbench.dataset.dock = safeDock;
    if (paneResizer) paneResizer.setAttribute("aria-orientation", safeDock === "bottom" ? "horizontal" : "vertical");
    dockButtons.forEach(button => button.classList.toggle("is-active", button.dataset.dockTarget === safeDock));
    saveWorkbenchPrefs(prefs);
    queueRender();
  }

  function setPanelExpanded(panel, heading, key, expanded) {
    panel.classList.toggle("is-collapsed", !expanded);
    heading.setAttribute("aria-expanded", expanded ? "true" : "false");
    prefs.collapsed = prefs.collapsed || {};
    prefs.collapsed[key] = !expanded;
  }

  function maybeUpdateDiagnostics(key, expanded) {
    if (key === "diagnostics" && expanded) updateDiagnostics();
  }

  setCssPx(doc, "--tool-pane-width", clamp(Number(prefs.width) || 308, 232, 520));
  setCssPx(doc, "--tool-pane-height", clamp(Number(prefs.height) || 300, 170, 600));

  panels.forEach((panel, index) => {
    panel.hidden = false;
    const heading = panel.querySelector("h2");
    if (!heading) return;
    const headingText = heading.textContent.trim();
    const key = panelKey(panel, heading, index);
    const canResetPanel = typeof resetPanelControls === "function" && (
      typeof panelHasResettableControls === "function" ? panelHasResettableControls(panel) : true
    );

    heading.setAttribute("role", "button");
    heading.setAttribute("tabindex", "0");
    heading.setAttribute("aria-expanded", prefs.collapsed?.[key] ? "false" : "true");
    heading.title = "Collapse / expand";
    if (prefs.collapsed?.[key]) panel.classList.add("is-collapsed");

    if (canResetPanel) {
      const resetButton = doc.createElement("button");
      resetButton.type = "button";
      resetButton.className = "panel-reset-button";
      resetButton.textContent = "Reset";
      resetButton.title = `Reset ${headingText || "panel"} controls`;
      resetButton.setAttribute("aria-label", resetButton.title);
      resetButton.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        resetPanelControls(panel, {label: headingText || "panel"});
        queueRender();
      });
      heading.append(resetButton);
    }

    const toggle = () => {
      const expanded = panel.classList.contains("is-collapsed");
      setPanelExpanded(panel, heading, key, expanded);
      saveWorkbenchPrefs(prefs);
      queueRender();
      maybeUpdateDiagnostics(key, expanded);
    };
    heading.addEventListener("click", event => {
      if (event.target?.closest?.("button")) return;
      toggle();
    });
    heading.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
    panelRecords.push({panel, heading, key});
  });

  collapseAllButton?.addEventListener("click", () => {
    panelRecords.forEach(({panel, heading, key}) => setPanelExpanded(panel, heading, key, false));
    saveWorkbenchPrefs(prefs);
    queueRender();
  });

  function recordContainsFocus(record) {
    const active = doc.activeElement;
    if (!active || !record?.panel) return false;
    return active === record.heading || active === record.panel || !!record.panel.contains?.(active);
  }

  function focusPanel(panelKey, {focus = true, scroll = true, panelKeys = null, toggle = false} = {}) {
    const keys = Array.isArray(panelKeys) && panelKeys.length ? panelKeys : [panelKey];
    const candidates = keys.map(key => panelRecords.find(item => item.key === key)).filter(Boolean);
    const focusedRecord = candidates.find(recordContainsFocus);
    const visibleRecord = candidates.find(item => panelIsVisuallyAvailable(item.panel, win));
    if (!focusedRecord && !visibleRecord && candidates.length > 1) return false;
    const record = focusedRecord || visibleRecord || candidates[0];
    if (!record) return false;

    const expanded = !record.panel.classList.contains("is-collapsed");
    if (toggle && expanded && recordContainsFocus(record)) {
      setPanelExpanded(record.panel, record.heading, record.key, false);
      saveWorkbenchPrefs(prefs);
      queueRender();
      requestFrame(() => {
        if (focus && typeof record.heading.focus === "function") record.heading.focus({preventScroll: true});
      });
      return "collapsed";
    }

    setPanelExpanded(record.panel, record.heading, record.key, true);
    saveWorkbenchPrefs(prefs);
    queueRender();
    maybeUpdateDiagnostics(record.key, true);

    requestFrame(() => {
      if (scroll) scrollPanelIntoPane(record.panel, panelScroller, {behavior: "smooth"});
      if (focus && typeof record.heading.focus === "function") {
        record.heading.focus({preventScroll: true});
      }
    });

    return "focused";
  }

  function handleFocusPanelEvent(event) {
    const targetKey = event?.detail?.panelKey || event?.detail?.key;
    const action = targetKey ? focusPanel(targetKey, event.detail || {}) : false;
    if (!action) return;
    if (event?.detail && typeof event.detail === "object") event.detail.action = action;
    event.preventDefault?.();
  }

  toolPane.addEventListener?.(FOCUS_TOOLBAR_PANEL_EVENT, handleFocusPanelEvent);

  applyDock(prefs.dock);

  dockButtons.forEach(button => {
    button.addEventListener("click", () => applyDock(button.dataset.dockTarget));
  });

  function beginDockResize(event) {
    event.preventDefault();
    const pointerId = event.pointerId;
    const target = event.currentTarget;
    target.setPointerCapture?.(pointerId);
    doc.body.style.setProperty("--resize-cursor", prefs.dock === "bottom" ? "row-resize" : "col-resize");
    doc.body.classList.add("is-resizing");

    function move(e) {
      const rect = workbench.getBoundingClientRect();
      const maxWidth = Math.max(260, rect.width * 0.58);
      const maxHeight = Math.max(220, rect.height * 0.62);
      if (prefs.dock === "bottom") {
        const height = clamp(rect.bottom - e.clientY, 170, maxHeight);
        prefs.height = height;
        setCssPx(doc, "--tool-pane-height", height);
      } else if (prefs.dock === "left") {
        const width = clamp(e.clientX - rect.left, 232, maxWidth);
        prefs.width = width;
        setCssPx(doc, "--tool-pane-width", width);
      } else {
        const width = clamp(rect.right - e.clientX, 232, maxWidth);
        prefs.width = width;
        setCssPx(doc, "--tool-pane-width", width);
      }
      queueRender();
    }

    function end() {
      doc.body.classList.remove("is-resizing");
      doc.body.style.removeProperty("--resize-cursor");
      saveWorkbenchPrefs(prefs);
      win?.removeEventListener("pointermove", move);
      win?.removeEventListener("pointerup", end);
      win?.removeEventListener("pointercancel", end);
    }

    win?.addEventListener("pointermove", move);
    win?.addEventListener("pointerup", end);
    win?.addEventListener("pointercancel", end);
  }

  paneResizer?.addEventListener("pointerdown", beginDockResize);
}
