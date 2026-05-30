import test from "node:test";
import assert from "node:assert/strict";
import { createStatusDomain } from "../src/app/domains/status-domain.js";
import { createHistoryDomain } from "../src/app/domains/history-domain.js";
import { createManualDomain } from "../src/app/domains/manual-domain.js";
import { createPaletteDomain } from "../src/app/domains/palette-domain.js";
import { createDiagnosticsDomain } from "../src/app/domains/diagnostics-domain.js";
import { createViewDomain } from "../src/app/domains/view-domain.js";
import { createRenderDomain } from "../src/app/domains/render-domain.js";
import { createExportDomain } from "../src/app/domains/export-domain.js";
import { createImageDomain } from "../src/app/domains/image-domain.js";
import { createAppActionsDomain } from "../src/app/domains/app-actions-domain.js";
import { createAppPorts } from "../src/app/ports.js";

test("status domain exposes a stable status capability", () => {
  const statusEl = {
    textContent: "",
    classList: {
      transient: false,
      toggle(name, value) {
        if (name === "is-transient") this.transient = value;
      }
    }
  };
  const domain = createStatusDomain({
    els: {status: statusEl},
    state: {imageData: null}
  });

  domain.setStatus("Loading");
  assert.equal(statusEl.textContent, "Loading");
  assert.equal(statusEl.classList.transient, true);

  domain.setStatus();
  assert.equal(statusEl.textContent, "Open image");
  assert.equal(statusEl.classList.transient, false);
});

test("history domain routes escape cancellation to active mask state before palette region", () => {
  let current = {value: 0};
  const statuses = [];
  const calls = [];
  const state = {
    history: {
      undo: [],
      redo: [],
      pending: null,
      applying: false,
      limit: 80
    },
    mask: {
      paintMode: "brush",
      dragging: true
    },
    paletteRegion: {
      enabled: true,
      dragging: true
    }
  };
  const listeners = [];
  const target = {
    addEventListener(type, listener) {
      if (type === "keydown") listeners.push(listener);
    }
  };
  const domain = createHistoryDomain({
    els: {},
    state,
    getSnapshot: () => ({...current}),
    applySnapshot: snapshot => {
      current = {...snapshot};
    },
    setStatus: message => statuses.push(message),
    maskActions: {
      optionalSyncMaskUi: () => calls.push("syncMaskUi"),
      optionalUpdateMaskOverlay: () => calls.push("updateMaskOverlay")
    },
    paletteRegionActions: {
      cancelPaletteRegionDrag: () => calls.push("cancelPaletteRegionDrag")
    }
  });

  domain.bindHistoryShortcuts(target);
  listeners[0]({
    key: "Escape",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target: {},
    preventDefault() {}
  });

  assert.equal(state.mask.paintMode, "off");
  assert.equal(state.mask.dragging, false);
  assert.deepEqual(calls, ["syncMaskUi", "updateMaskOverlay"]);
  assert.equal(statuses.at(-1), "Mask painting off.");
});

test("history domain routes escape cancellation to palette region when mask is inactive", () => {
  const state = {
    history: {
      undo: [],
      redo: [],
      pending: null,
      applying: false,
      limit: 80
    },
    mask: {
      paintMode: "off",
      dragging: false
    },
    paletteRegion: {
      enabled: true,
      dragging: false
    }
  };
  const listeners = [];
  const calls = [];
  const domain = createHistoryDomain({
    els: {},
    state,
    getSnapshot: () => ({}),
    applySnapshot: () => {},
    setStatus: () => {},
    paletteRegionActions: {
      cancelPaletteRegionDrag: () => calls.push("cancelPaletteRegionDrag")
    }
  });

  domain.bindHistoryShortcuts({
    addEventListener(type, listener) {
      if (type === "keydown") listeners.push(listener);
    }
  });
  listeners[0]({
    key: "Escape",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target: {},
    preventDefault() {}
  });

  assert.deepEqual(calls, ["cancelPaletteRegionDrag"]);
});


test("manual domain groups swatch, list, and editor capabilities", () => {
  const calls = [];
  const config = {
    paletteMode: "manual",
    manualPalette: [
      {id: "swatch-a", hex: "#111111", locked: false},
      {id: "swatch-b", hex: "#222222", locked: true}
    ],
    manualMatchAliases: []
  };
  const state = {
    paletteRecords: [],
    manualEditor: {sourceIndex: null, swatchId: null, colorInputActive: false}
  };
  const domain = createManualDomain({
    els: {},
    state,
    config,
    history: {
      beginHistory: label => calls.push(["begin", label]),
      commitHistory: label => calls.push(["commit", label]),
      withHistory: (label, fn) => {
        calls.push(["with", label]);
        return fn();
      }
    },
    render: {
      markPaletteDirty: () => calls.push(["dirty"]),
      queueRender: () => calls.push(["render"])
    },
    copyPaletteHex: hex => calls.push(["copy", hex]),
    setStatus: message => calls.push(["status", message])
  });

  assert.equal(typeof domain.swatches.syncManualSwatches, "function");
  assert.equal(typeof domain.list.renderManualSwatches, "function");
  assert.equal(typeof domain.editor.closeManualPaletteEditor, "function");
  assert.equal(domain.manualSourceHex("swatch-a"), "#111111");
  assert.equal(domain.manualSwatchIndexForId("swatch-b"), 1);

  domain.setManualMatchAlias("swatch-a", "#334455");
  assert.equal(config.manualPalette[0].aliasHex, "#334455");
  assert.deepEqual(calls.slice(-2), [["dirty"], ["render"]]);
});

test("manual domain exposes list rendering through the same runtime surface", () => {
  let createdRows = 0;
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement(tagName) {
      const listeners = new Map();
      const el = {
        tagName: tagName.toUpperCase(),
        children: [],
        parentNode: null,
        style: {},
        dataset: {},
        attributes: {},
        value: "",
        checked: false,
        disabled: false,
        type: "",
        title: "",
        textContent: "",
        spellcheck: true,
        className: "",
        classList: {
          add() {},
          remove() {},
          toggle() { return false; },
          contains() { return false; }
        },
        append(...nodes) {
          this.children.push(...nodes);
          for (const node of nodes) if (node && typeof node === "object") node.parentNode = this;
        },
        setAttribute(name, value) {
          this.attributes[name] = String(value);
        },
        addEventListener(type, listener) {
          if (!listeners.has(type)) listeners.set(type, []);
          listeners.get(type).push(listener);
        },
        dispatchEvent(event) {
          const normalized = typeof event === "string" ? {type: event} : event;
          for (const listener of listeners.get(normalized.type) || []) listener(normalized);
        },
        querySelectorAll() {
          return [];
        }
      };
      Object.defineProperty(el, "innerHTML", {
        get() { return ""; },
        set() { this.children = []; }
      });
      if (tagName === "div") createdRows += 1;
      return el;
    }
  };

  try {
    const wrap = globalThis.document.createElement("div");
    const config = {
      paletteMode: "manual",
      manualPalette: [{id: "swatch-a", hex: "#111111", locked: false}],
      manualMatchAliases: []
    };
    const domain = createManualDomain({
      els: {manualSwatches: wrap},
      state: {paletteRecords: [], manualEditor: {}},
      config,
      history: {},
      render: {}
    });

    domain.renderManualSwatches();
    assert.equal(wrap.children.length, 1);
    assert.ok(createdRows >= 2);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("manual domain can make a match anchor into the source color", () => {
  const calls = [];
  const config = {
    paletteMode: "manual",
    manualPalette: [{id: "swatch-a", hex: "#111111", aliasHex: "#334455", locked: false, lab: [10, 1, 1], colorSpace: "oklab-scaled"}],
    manualMatchAliases: []
  };
  const state = {paletteRecords: [], manualEditor: {}};
  const domain = createManualDomain({
    els: {},
    state,
    config,
    history: {},
    render: {
      markPaletteDirty: () => calls.push("markPaletteDirty"),
      queueRender: () => calls.push("queueRender")
    },
    setStatus: message => calls.push(["status", message])
  });

  const next = domain.makeManualMatchAnchorSource("swatch-a");

  assert.equal(next.hex, "#334455");
  assert.equal(next.aliasHex, null);
  assert.equal("lab" in next, false);
  assert.equal("colorSpace" in next, false);
  assert.equal(config.manualPalette[0].hex, "#334455");
  assert.equal(config.manualPalette[0].aliasHex, null);
  assert.ok(calls.includes("markPaletteDirty"));
  assert.ok(calls.includes("queueRender"));
  assert.match(calls.find(call => Array.isArray(call))?.[1] || "", /source set to former match anchor #334455/);
});

test("palette domain drops graph-drag anchors and promotes them through one action", () => {
  const calls = [];
  const swatches = [{id: "swatch-a", hex: "#111111", aliasHex: null, locked: false}];
  const record = {source: "manual", swatchId: "swatch-a", sourceIndex: 0, lab: [50, 1, 1], hex: "#111111"};
  const manual = {
    syncManualSwatches: () => swatches,
    manualSwatchLab: () => [50, 1, 1],
    manualSwatchIndex: () => 0,
    manualSwatchEditable: () => true,
    manualMatchAliasHex: () => swatches[0].aliasHex,
    manualSourceHex: () => swatches[0].hex,
    manualSwatchMuted: () => false,
    toggleManualSwatchMuted: () => swatches[0],
    activeManualMatchAliasCount: () => 0,
    setManualMatchAlias: (id, color) => {
      calls.push(["alias", id, color]);
      swatches[0].aliasHex = color;
      return swatches[0];
    },
    makeManualMatchAnchorSource: () => {
      swatches[0].hex = swatches[0].aliasHex;
      swatches[0].aliasHex = null;
      calls.push("makeAnchorSource");
      return swatches[0];
    },
    syncManualPaletteEditor: () => calls.push("syncManualPaletteEditor"),
    openManualPaletteEditor: () => calls.push("openManualPaletteEditor")
  };
  const domain = createPaletteDomain({
    els: {},
    state: {paletteRecords: [record], palette: [], manualEditor: {}},
    config: {paletteMode: "manual", manualPalette: swatches, manualMatchAliases: [], generatedLocks: []},
    manual,
    history: {
      beginHistory: label => calls.push(["begin", label]),
      commitHistory: label => calls.push(["commit", label]),
      withHistory: (label, fn) => {
        calls.push(["history", label]);
        return fn();
      }
    },
    render: {
      markPaletteDirty: () => calls.push("markPaletteDirty"),
      queueRender: () => calls.push("queueRender")
    },
    setStatus: message => calls.push(["status", message])
  });

  assert.equal(domain.repositionManualGraphSwatch(record, record.lab, {phase: "start"}), true);
  assert.equal(domain.repositionManualGraphSwatch(record, record.lab, {phase: "anchor", anchorHex: "#111111"}), true);
  assert.equal(swatches[0].aliasHex, "#111111");
  assert.equal(domain.makeGraphSwatchAnchorSource(record), true);

  assert.deepEqual(calls.filter(call => Array.isArray(call) && call[0] === "alias")[0], ["alias", "swatch-a", "#111111"]);
  assert.ok(calls.some(call => Array.isArray(call) && call[0] === "history" && call[1] === "Make match anchor source"));
  assert.equal(swatches[0].hex, "#111111");
  assert.equal(swatches[0].aliasHex, null);
});


test("palette domain groups cycle, runtime, and preview capabilities", () => {
  const calls = [];
  const config = {
    CYCLE_MODE: "manual",
    cycleOffset: 0,
    cycleManualKeys: ["manual:swatch-a"],
    manualPalette: [{id: "swatch-a", hex: "#111111", locked: false}],
    manualMatchAliases: [],
    generatedLocks: [],
    paletteMode: "manual"
  };
  const state = {
    paletteRecords: [{cycleKey: "manual:swatch-a", hex: "#111111", lab: [0, 0, 0]}],
    palette: [],
    manualEditor: {}
  };
  const manual = {
    syncManualSwatches: () => config.manualPalette,
    manualSwatchLab: () => [0, 0, 0],
    manualSwatchEditable: () => false,
    manualMatchAliasHex: () => null,
    manualSourceHex: () => "#111111",
    activeManualMatchAliasCount: () => 0,
    syncManualPaletteEditor: () => calls.push("syncManualPaletteEditor"),
    openManualPaletteEditor: () => calls.push("openManualPaletteEditor")
  };

  const domain = createPaletteDomain({
    els: {},
    state,
    config,
    manual,
    history: {
      withHistory: (label, fn) => {
        calls.push(["history", label]);
        return fn();
      }
    },
    render: {
      markPaletteDirty: () => calls.push("markPaletteDirty"),
      queueRender: () => calls.push("queueRender")
    },
    cyclePreviewActions: {
      syncCycleControls: () => calls.push("syncCycleControls")
    },
    copyPaletteHex: hex => calls.push(["copy", hex]),
    setStatus: message => calls.push(["status", message])
  });

  assert.equal(typeof domain.cycle.manualCycleModeEnabled, "function");
  assert.equal(typeof domain.runtime.getPaletteRecords, "function");
  assert.equal(typeof domain.preview.renderSwatches, "function");
  assert.equal(domain.manualCycleModeEnabled(), true);
  assert.deepEqual(domain.manualCycleIndices(), [0]);
});

test("palette domain routes manual cycle clearing through preview render capabilities", () => {
  const calls = [];
  const config = {
    CYCLE_MODE: "manual",
    cycleOffset: 0,
    cycleManualKeys: ["manual:swatch-a"],
    manualPalette: [{id: "swatch-a", hex: "#111111", locked: false}],
    manualMatchAliases: [],
    generatedLocks: [],
    paletteMode: "manual"
  };
  const state = {paletteRecords: [], palette: [], manualEditor: {}};
  const domain = createPaletteDomain({
    els: {},
    state,
    config,
    manual: {
      syncManualSwatches: () => config.manualPalette,
      manualSwatchLab: () => [0, 0, 0],
      manualSwatchEditable: () => false,
      manualMatchAliasHex: () => null,
      manualSourceHex: () => "#111111",
      activeManualMatchAliasCount: () => 0,
      syncManualPaletteEditor: () => {},
      openManualPaletteEditor: () => {}
    },
    render: {
      markPaletteDirty: () => calls.push("markPaletteDirty"),
      queueRender: () => calls.push("queueRender")
    },
    cyclePreviewActions: {
      syncCycleControls: () => calls.push("syncCycleControls")
    },
    setStatus: message => calls.push(["status", message])
  });

  domain.clearManualCycleTags();

  assert.deepEqual(config.cycleManualKeys, []);
  assert.deepEqual(calls, [
    "markPaletteDirty",
    "syncCycleControls",
    ["status", "Cleared manual cycle tags."],
    "queueRender"
  ]);
});


test("diagnostics domain groups metrics, panel, controller, and overlay capabilities", () => {
  const calls = [];
  const state = {
    diagnostics: {},
    paletteRecords: [{id: "a", hex: "#000000", lab: [0, 0, 0], displayIndex: 0}],
    imageData: null
  };
  const config = {
    paletteMode: "manual",
    assignMode: "nearest",
    outputMode: "mapped",
    blendK: 1,
    softness: 1,
    ditherLumaAmount: 0,
    blendAmount: 1,
    maxDistanceEnabled: false,
    maxDistance: 0,
    lumaWeight: 1,
    chromaWeight: 1,
    hueWeight: 1,
    cycleOffset: 0
  };
  const domain = createDiagnosticsDomain({
    els: {},
    state,
    config,
    palette: {
      manualCycleModeEnabled: () => false,
      cycleTagged: () => false,
      isGeneratedPaletteMode: () => false,
      activePaletteImageData: () => null,
      syncGeneratedLocks: () => [],
      renderPaletteLabs: records => records.map(record => record.lab),
      paletteUniformEntries: records => records.map(record => ({
        sourceRecord: record,
        featureLab: record.lab,
        renderLab: record.lab,
        renderHex: record.hex,
        featureHex: record.hex,
        alias: false
      }))
    },
    render: {
      ensurePalette: () => calls.push("ensurePalette"),
      queueRender: () => calls.push("queueRender")
    },
    view: {
      clientPointToImagePixel: () => null,
      getDisplayViewRect: () => null,
      getViewSpan: () => [1, 1]
    },
    env: {},
    setStatus: message => calls.push(["status", message])
  });

  assert.equal(typeof domain.metrics.diagnosticsSignature, "function");
  assert.equal(typeof domain.panel.renderDiagnosticsPanel, "function");
  assert.equal(typeof domain.controller.updateDiagnostics, "function");
  assert.equal(typeof domain.setDiagnosticOverlay, "function");
  assert.equal(domain.diagnosticsSignature(), domain.metrics.diagnosticsSignature());

  domain.setDiagnosticOverlay({mode: "swatch", swatchIndex: 99});

  assert.deepEqual(state.diagnostics.overlay, {mode: "swatch", swatchIndex: 63});
  assert.deepEqual(calls.slice(-2), [["status", "Diagnostic overlay: swatch 64."], "queueRender"]);
});

test("diagnostics domain normalizes histogram overlay bins", () => {
  const calls = [];
  const state = {diagnostics: {histogramBinCount: 80}, paletteRecords: [], imageData: null};
  const domain = createDiagnosticsDomain({
    els: {},
    state,
    config: {},
    palette: {
      manualCycleModeEnabled: () => false,
      cycleTagged: () => false,
      isGeneratedPaletteMode: () => false,
      activePaletteImageData: () => null,
      syncGeneratedLocks: () => [],
      renderPaletteLabs: () => [],
      paletteUniformEntries: () => []
    },
    render: {queueRender: () => calls.push("queueRender")},
    view: {},
    setStatus: message => calls.push(["status", message])
  });

  domain.setDiagnosticOverlay({
    mode: "histogram",
    histogramScope: "output",
    histogramChannel: "hue",
    histogramBinIndex: 999,
    histogramBinCount: 40,
    histogramDomainMax: 360,
    histogramStart: 351,
    histogramEnd: 360
  });

  assert.equal(state.diagnostics.overlay.mode, "histogram");
  assert.equal(state.diagnostics.overlay.histogramScope, "output");
  assert.equal(state.diagnostics.overlay.histogramChannel, "hue");
  assert.equal(state.diagnostics.overlay.histogramBinIndex, 39);
  assert.equal(state.diagnostics.overlay.histogramBinCount, 40);
  assert.equal(state.diagnostics.overlay.histogramMin, 351);
  assert.equal(state.diagnostics.overlay.histogramMax, 1e20);
  assert.deepEqual(calls.slice(-2), [["status", "Diagnostic overlay: output H° bin 40 (351.0–360.0)."], "queueRender"]);
});

test("diagnostics domain supports a neutral hue-skipped histogram overlay", () => {
  const calls = [];
  const state = {diagnostics: {histogramBinCount: 80}, paletteRecords: [], imageData: null};
  const domain = createDiagnosticsDomain({
    els: {},
    state,
    config: {},
    palette: {
      manualCycleModeEnabled: () => false,
      cycleTagged: () => false,
      isGeneratedPaletteMode: () => false,
      activePaletteImageData: () => null,
      syncGeneratedLocks: () => [],
      renderPaletteLabs: () => [],
      paletteUniformEntries: () => []
    },
    render: {queueRender: () => calls.push("queueRender")},
    view: {},
    setStatus: message => calls.push(["status", message])
  });

  domain.setDiagnosticOverlay({
    mode: "histogram",
    histogramScope: "source",
    histogramChannel: "neutral"
  });

  assert.equal(state.diagnostics.overlay.mode, "histogram");
  assert.equal(state.diagnostics.overlay.histogramChannel, "neutral");
  assert.equal(state.diagnostics.overlay.histogramBinIndex, null);
  assert.deepEqual(calls.slice(-2), [["status", "Diagnostic overlay: source neutral / unreliable hue."], "queueRender"]);
});

test("diagnostics domain normalizes unsupported overlay modes to off", () => {
  const calls = [];
  const state = {diagnostics: {}, paletteRecords: [], imageData: null};
  const domain = createDiagnosticsDomain({
    els: {},
    state,
    config: {},
    palette: {
      manualCycleModeEnabled: () => false,
      cycleTagged: () => false,
      isGeneratedPaletteMode: () => false,
      activePaletteImageData: () => null,
      syncGeneratedLocks: () => [],
      renderPaletteLabs: () => [],
      paletteUniformEntries: () => []
    },
    render: {queueRender: () => calls.push("queueRender")},
    view: {},
    setStatus: message => calls.push(["status", message])
  });

  domain.setDiagnosticOverlay({mode: "bogus", swatchIndex: 2});

  assert.deepEqual(state.diagnostics.overlay, {mode: "none", swatchIndex: null});
  assert.deepEqual(calls, [["status", "Diagnostic overlay off."], "queueRender"]);
});


test("view domain groups viewport, compare, palette region, and mask capabilities", () => {
  const calls = [];
  const canvasClasses = [];
  const els = {
    canvas: {
      classList: {
        toggle: (name, value) => canvasClasses.push([name, value])
      },
      getBoundingClientRect: () => ({left: 10, top: 20, width: 200, height: 100})
    },
    viewStatus: {textContent: ""},
    zoomOutButton: {disabled: false},
    resetViewButton: {disabled: false},
    compareSplit: {value: 0, disabled: false},
    compareSplitValue: {textContent: ""},
    compareToggle: {checked: false},
    selectPaletteRegion: {
      textContent: "",
      pressed: null,
      setAttribute(name, value) {
        if (name === "aria-pressed") this.pressed = value;
      }
    },
    clearPaletteRegion: {disabled: false},
    paletteRegionNote: {textContent: ""}
  };
  const state = {
    sourceCanvas: {width: 400, height: 200},
    view: {zoom: 2, centerX: 0.45, centerY: 0.55},
    paletteRegion: {enabled: true, dragging: true},
    mask: {paintMode: "off", showOverlay: true},
    imageData: {width: 400, height: 200},
    paletteRecords: []
  };
  const config = {
    compareEnabled: false,
    compareSplit: 0.25,
    paletteMode: "generated",
    paletteRegionRect: {x: 5, y: 6, width: 10, height: 12},
    showPaletteRegion: false
  };

  const domain = createViewDomain({
    els,
    state,
    config,
    render: {
      markPaletteDirty: () => calls.push("markPaletteDirty"),
      markMaskDirty: () => calls.push("markMaskDirty"),
      queueRender: () => calls.push("queueRender")
    },
    configActions: {
      cloneConfigSnapshot: () => ({...config})
    },
    history: {
      pushHistorySnapshot: label => calls.push(["history", label])
    },
    conditionalPanelsActions: {
      updateConditionalPanels: () => calls.push("updateConditionalPanels")
    },
    setStatus: message => calls.push(["status", message])
  });

  assert.equal(typeof domain.viewportController.getCanvasRenderSize, "function");
  assert.equal(typeof domain.compareSplitController.setCompareSplit, "function");
  assert.equal(typeof domain.paletteRegionController.resetPaletteRegion, "function");
  assert.equal(typeof domain.maskController.resetMask, "function");
  assert.equal(typeof domain.getDisplayViewRect, "function");
  assert.equal(typeof domain.setCompareEnabled, "function");
  assert.equal(typeof domain.updatePaletteRegionUi, "function");
  assert.equal(typeof domain.syncMaskUi, "function");

  domain.resetView();
  assert.equal(state.view.zoom, 1);
  assert.equal(state.view.centerX, 0.5);
  assert.equal(state.view.centerY, 0.5);
  assert.equal(els.viewStatus.textContent, "100%");

  domain.setCompareEnabled(true);
  assert.equal(config.compareEnabled, true);
  assert.equal(els.compareToggle.checked, true);
  assert.equal(els.compareSplit.disabled, false);
  assert.ok(canvasClasses.some(([name, value]) => name === "is-comparing" && value === true));

  domain.resetPaletteRegion({announce: true});
  assert.equal(config.paletteRegionRect, null);
  assert.equal(state.paletteRegion.enabled, false);
  assert.ok(calls.includes("markPaletteDirty"));
  assert.ok(calls.some(call => Array.isArray(call) && call[1] === "Using the full image for generated palettes."));
});

test("view domain routes mask reset through render invalidation and mask UI sync", () => {
  const calls = [];
  const state = {
    sourceCanvas: {width: 16, height: 16},
    view: {zoom: 1, centerX: 0.5, centerY: 0.5},
    paletteRegion: {},
    mask: {
      paintMode: "brush",
      dragging: true,
      showOverlay: true,
      canvas: {
        width: 16,
        height: 16,
        getContext: () => ({clearRect: () => calls.push("clearRect")})
      },
      ctx: {clearRect: () => calls.push("clearRect")}
    },
    imageData: {width: 16, height: 16},
    paletteRecords: []
  };
  const domain = createViewDomain({
    els: {
      canvas: {
        classList: {toggle() {}},
        getBoundingClientRect: () => ({left: 0, top: 0, width: 16, height: 16})
      }
    },
    state,
    config: {paletteMode: "manual"},
    render: {
      markPaletteDirty: () => calls.push("markPaletteDirty"),
      markMaskDirty: () => calls.push("markMaskDirty"),
      queueRender: () => calls.push("queueRender")
    },
    configActions: {cloneConfigSnapshot: () => ({})},
    history: {pushHistorySnapshot: () => {}},
    conditionalPanelsActions: {updateConditionalPanels: () => {}},
    setStatus: message => calls.push(["status", message])
  });

  domain.resetMask({announce: true});

  assert.equal(state.mask.paintMode, "off");
  assert.equal(state.mask.dragging, false);
  assert.ok(calls.includes("markMaskDirty"));
  assert.ok(calls.includes("queueRender"));
  assert.ok(calls.some(call => Array.isArray(call) && call[1] === "Mask cleared."));
});


test("render domain groups shader, level, and session capabilities", () => {
  const state = {
    diagnostics: {},
    sourceLevelsDirty: false,
    referenceLevelsDirty: false,
    textureDirty: false,
    paletteDirty: false,
    swatchesDirty: false,
    blockSample: {dirty: false},
    postProcess: {
      offscreen: {dirty: false},
      pipeline: {dirty: false}
    },
    sourceCanvas: {width: 0, height: 0},
    originalCanvas: {width: 0},
    referenceOriginalCanvas: {width: 0},
    view: {centerX: 0.5, centerY: 0.5},
    paletteRecords: [],
    palette: []
  };
  const config = {
    assignMode: "nearest",
    outputMode: "mapped",
    ditherPattern: "bayer",
    CYCLE_MODE: 0,
    cycleOffset: 0
  };
  const calls = [];
  const domain = createRenderDomain({
    els: {},
    state,
    config,
    shaders: {},
    palette: {
      manualCycleModeEnabled: () => false,
      normalizedCycleOffset: () => 0,
      getPaletteRecords: () => [],
      paletteUniformEntries: () => [],
      renderPaletteLabs: () => [],
      preprocessPaletteEntries: () => ({
        paletteBlock: new Float32Array(),
        paletteFeatures: new Float32Array()
      }),
      renderSwatches: () => calls.push("renderSwatches")
    },
    view: {
      getCanvasRenderSize: () => ({width: 1, height: 1}),
      getViewRect: () => ({x: 0, y: 0, w: 1, h: 1}),
      getViewSpan: () => [1, 1],
      updatePaletteRegionOverlay: () => calls.push("updatePaletteRegionOverlay"),
      updateMaskOverlay: () => calls.push("updateMaskOverlay"),
      syncMaskUi: () => calls.push("syncMaskUi")
    },
    diagnostics: {
      updateDiagnostics: () => calls.push("updateDiagnostics")
    },
    env: {requestFrame: callback => callback(0)}
  });

  assert.equal(typeof domain.shaderPrograms.buildProgram, "function");
  assert.equal(typeof domain.levels.ensureLevelAdjustedSources, "function");
  assert.equal(typeof domain.session.markPaletteDirty, "function");
  assert.equal(typeof domain.renderSessionController.queueRender, "function");

  domain.markPaletteDirty();
  assert.equal(state.paletteDirty, true);
  assert.equal(state.swatchesDirty, true);
  assert.equal(state.postProcess.offscreen.dirty, true);
  assert.equal(state.postProcess.pipeline.dirty, true);

  domain.markTextureDirty();
  assert.equal(state.textureDirty, true);
  assert.equal(state.diagnostics.signature, "");
  assert.equal(state.diagnostics.pixel, null);
  assert.equal(state.blockSample.dirty, true);
});

test("render domain exposes level invalidation through the render session", () => {
  const state = {
    diagnostics: {},
    sourceLevelsDirty: false,
    referenceLevelsDirty: false,
    textureDirty: false,
    paletteDirty: false,
    swatchesDirty: false,
    sourceCanvas: {width: 0, height: 0},
    originalCanvas: {width: 0},
    referenceOriginalCanvas: {width: 0},
    paletteRecords: [],
    palette: []
  };
  const domain = createRenderDomain({
    els: {},
    state,
    config: {paletteMode: "generated"},
    shaders: {},
    palette: {
      manualCycleModeEnabled: () => false,
      normalizedCycleOffset: () => 0,
      getPaletteRecords: () => [],
      paletteUniformEntries: () => [],
      renderPaletteLabs: () => [],
      preprocessPaletteEntries: () => ({paletteBlock: new Float32Array(), paletteFeatures: new Float32Array()}),
      renderSwatches: () => {}
    },
    view: {
      getCanvasRenderSize: () => ({width: 1, height: 1}),
      getViewRect: () => ({x: 0, y: 0, w: 1, h: 1}),
      getViewSpan: () => [1, 1],
      updatePaletteRegionOverlay: () => {},
      updateMaskOverlay: () => {},
      syncMaskUi: () => {}
    },
    diagnostics: {updateDiagnostics: () => {}}
  });

  domain.markLevelsDirty();

  assert.equal(state.sourceLevelsDirty, true);
  assert.equal(state.referenceLevelsDirty, false);
  assert.equal(state.textureDirty, true);
  assert.equal(state.paletteDirty, true);
  assert.equal(state.swatchesDirty, true);
});


test("export domain groups rendered canvas, animation, and file export capabilities", () => {
  const calls = [];
  const state = {
    imageData: null,
    sourceCanvas: {width: 0, height: 0},
    paletteRecords: [],
    palette: [],
    animationExport: {
      frameCount: null,
      fps: 8,
      step: 2,
      prefix: "Test Export",
      exporting: false
    }
  };
  const domain = createExportDomain({
    els: {},
    state,
    config: {cycleOffset: 0, CYCLE_MODE: 0},
    root: {
      createElement: tagName => ({tagName, width: 0, height: 0})
    },
    shaders: {},
    palette: {
      getPaletteRecords: () => [{id: "a"}],
      fallbackPaletteRecords: () => [{id: "fallback"}],
      paletteUniformEntries: () => [],
      preprocessPaletteEntries: () => ({paletteBlock: new Float32Array(), paletteFeatures: new Float32Array()}),
      manualCycleModeEnabled: () => false,
      applyManualCycle: () => [],
      normalizedCycleOffset: () => 0,
      cyclePeriod: () => 6
    },
    render: {
      ensurePalette: () => calls.push("ensurePalette"),
      buildProgramForContext: () => null,
      renderPaletteProgram: () => calls.push("renderPaletteProgram"),
      draw: () => calls.push("draw")
    },
    setStatus: message => calls.push(["status", message])
  });

  assert.equal(typeof domain.renderedCanvas.renderFullImageCanvas, "function");
  assert.equal(typeof domain.animation.syncAnimationExportUi, "function");
  assert.equal(typeof domain.actions.downloadCanvas, "function");
  assert.equal(typeof domain.renderFullImageCanvas, "function");
  assert.equal(typeof domain.exportAnimationPngZip, "function");
  assert.equal(domain.renderFullImageCanvas(), null);
  assert.deepEqual(calls, ["ensurePalette"]);
});

test("export domain keeps animation export controls behind the export surface", () => {
  const statuses = [];
  const state = {
    imageData: null,
    sourceCanvas: {width: 0, height: 0},
    paletteRecords: [{id: "a"}],
    animationExport: {
      frameCount: 9999,
      fps: 99,
      step: 2,
      prefix: "My Export?",
      exporting: false
    }
  };
  const els = {
    animFrameCount: {value: ""},
    animFps: {value: ""},
    animStep: {value: ""},
    animPrefix: {value: ""},
    animLoopInfo: {textContent: ""},
    exportAnimationZipButton: {disabled: false},
    exportAnimationGifButton: {disabled: false},
    animUseLoopSpan: {disabled: false}
  };
  const domain = createExportDomain({
    els,
    state,
    config: {cycleOffset: 1, CYCLE_MODE: 0},
    root: {createElement: () => ({})},
    palette: {
      getPaletteRecords: () => state.paletteRecords,
      fallbackPaletteRecords: () => state.paletteRecords,
      paletteUniformEntries: () => [],
      preprocessPaletteEntries: () => ({paletteBlock: new Float32Array(), paletteFeatures: new Float32Array()}),
      manualCycleModeEnabled: () => false,
      applyManualCycle: () => [],
      normalizedCycleOffset: () => 1,
      cyclePeriod: () => 6
    },
    render: {
      ensurePalette: () => {},
      buildProgramForContext: () => null,
      renderPaletteProgram: () => {},
      draw: () => {}
    },
    setStatus: message => statuses.push(message)
  });

  domain.syncAnimationExportUi();

  assert.equal(state.animationExport.frameCount, 1000);
  assert.equal(state.animationExport.fps, 60);
  assert.equal(state.animationExport.prefix, "My-Export");
  assert.equal(els.animPrefix.value, "My-Export");
  assert.equal(els.exportAnimationZipButton.disabled, true);
  assert.match(els.animLoopInfo.textContent, /^3 frames · global · 1\/6$/);

  domain.useAnimationLoopSpan();
  assert.equal(state.animationExport.frameCount, 3);
  assert.equal(statuses.at(-1), "Animation frame count set to the current loop span: 3.");
});


function makeImageDomainCanvas(name) {
  const calls = [];
  return {
    name,
    width: 0,
    height: 0,
    calls,
    getContext(type, options) {
      calls.push(["getContext", type, options]);
      return {
        canvas: this,
        clearRect: (...args) => calls.push(["clearRect", ...args]),
        drawImage: (...args) => calls.push(["drawImage", ...args]),
        getImageData: (x, y, width, height) => {
          calls.push(["getImageData", x, y, width, height]);
          return {width, height, data: new Uint8ClampedArray(width * height * 4)};
        }
      };
    }
  };
}

function makeImageDomainState() {
  return {
    maxImageSide: 100,
    originalCanvas: makeImageDomainCanvas("original"),
    originalSourceVersion: 0,
    sourceCanvas: makeImageDomainCanvas("source"),
    referenceOriginalCanvas: makeImageDomainCanvas("referenceOriginal"),
    referenceOriginalSourceVersion: 0,
    referenceCanvas: makeImageDomainCanvas("reference"),
    sourceLevelsDirty: false,
    referenceLevelsDirty: false,
    imageData: null,
    referenceImageData: null,
    referenceImageName: ""
  };
}

function makeImageDomain(overrides = {}) {
  const calls = [];
  const state = overrides.state || makeImageDomainState();
  const config = overrides.config || {paletteMode: "generated"};
  const domain = createImageDomain({
    els: overrides.els || {},
    state,
    config,
    root: overrides.root || {getElementById: () => null},
    env: overrides.env || {
      Image: class {},
      URL: {
        createObjectURL: file => `blob:${file.name}`,
        revokeObjectURL: url => calls.push(["revoke", url])
      }
    },
    configActions: {
      cloneConfigSnapshot: () => ({before: true})
    },
    history: {
      pushHistorySnapshot: (...args) => calls.push(["history", ...args])
    },
    render: {
      ensureLevelAdjustedSources: () => {
        calls.push("levels");
        if (state.sourceLevelsDirty) {
          state.imageData = {width: state.sourceCanvas.width, height: state.sourceCanvas.height};
        }
        if (state.referenceLevelsDirty) {
          state.referenceImageData = {width: state.referenceCanvas.width, height: state.referenceCanvas.height};
        }
      },
      markEverythingDirty: () => calls.push("markEverythingDirty"),
      markPaletteDirty: () => calls.push("markPaletteDirty"),
      queueRender: () => calls.push("queueRender")
    },
    view: {
      resetPaletteRegion: (...args) => calls.push(["resetPaletteRegion", ...args]),
      resetMask: (...args) => calls.push(["resetMask", ...args]),
      resetView: (...args) => calls.push(["resetView", ...args])
    },
    conditionalPanelsActions: {
      updateConditionalPanels: () => calls.push("updateConditionalPanels")
    },
    setStatus: message => calls.push(["status", message])
  });
  return {domain, state, config, calls};
}

test("image domain groups bitmap loading capabilities", () => {
  const {domain, state, calls} = makeImageDomain();

  assert.equal(typeof domain.controller.loadFile, "function");
  assert.equal(typeof domain.image.loadDemo, "function");
  assert.equal(typeof domain.loadImageFromBitmapSource, "function");

  domain.loadImageFromBitmapSource({width: 400, height: 200}, "sample.png");

  assert.equal(state.originalCanvas.width, 100);
  assert.equal(state.originalCanvas.height, 50);
  assert.equal(state.sourceCanvas.width, 100);
  assert.equal(state.sourceCanvas.height, 50);
  assert.equal(state.originalSourceVersion, 1);
  assert.deepEqual(state.imageData, {width: 100, height: 50});
  assert.deepEqual(calls, [
    "levels",
    ["resetPaletteRegion", {announce: false, dirty: false}],
    ["resetMask", {announce: false, resize: true, keepEnabled: false}],
    ["resetView", false],
    "markEverythingDirty",
    ["status", "sample.png: 100×50"],
    "queueRender"
  ]);
});

test("image domain routes reference loads through palette and panel invalidation", () => {
  const referenceStatus = {textContent: ""};
  const paletteMode = {value: "generated"};
  const {domain, state, config, calls} = makeImageDomain({
    els: {referenceImageStatus: referenceStatus, paletteMode}
  });

  domain.loadReferenceImageFromBitmapSource({width: 50, height: 25}, "ref.jpg");

  assert.equal(state.referenceOriginalCanvas.width, 50);
  assert.equal(state.referenceCanvas.height, 25);
  assert.equal(state.referenceImageName, "ref.jpg");
  assert.equal(state.referenceOriginalSourceVersion, 1);
  assert.equal(state.referenceImageData.width, 50);
  assert.equal(state.referenceImageData.height, 25);
  assert.equal(state.referenceImageData.materialized, false);
  assert.equal(state.referenceLevelsDirty, false);
  assert.equal(config.paletteMode, "generatedReference");
  assert.equal(paletteMode.value, "generatedReference");
  assert.equal(referenceStatus.textContent, "ref.jpg: 50×25");
  assert.deepEqual(calls, [
    "markPaletteDirty",
    "updateConditionalPanels",
    ["status", "Reference ref.jpg: 50×25"],
    "queueRender"
  ]);
});


test("app actions domain groups config, manual palette, randomizer, conditional panels, and reset", () => {
  const calls = [];
  const body = {dataset: {}};
  const capturePaletteMenu = {
    disabled: false,
    classList: {
      disabled: false,
      toggle(name, value) {
        if (name === "is-disabled") this.disabled = value;
      }
    }
  };
  const els = {
    capturePalette: {disabled: false},
    capturePaletteMenu
  };
  const state = {
    paletteRegion: {enabled: false, dragging: false},
    manualPresets: [],
    paletteRecords: [{hex: "#111111", lab: [0, 0, 0]}]
  };
  const config = {
    paletteMode: "harmony",
    cosinePreset: "custom",
    assignMode: "nearest",
    outputMode: "mapped",
    presetName: "demo",
    manualPalette: [],
    manualMatchAliases: []
  };
  const ports = createAppPorts();
  ports.cyclePreview.attach({
    stopCyclePreview: () => calls.push("stopCyclePreview"),
    syncCycleControls: () => calls.push("syncCycleControls"),
    toggleCyclePreview: () => calls.push("toggleCyclePreview")
  });
  ports.paletteRegion.attach({
    cancelPaletteRegionDrag: () => calls.push("cancelPaletteRegionDrag")
  });

  const domain = createAppActionsDomain({
    els,
    state,
    config,
    root: {body, createElement: tagName => ({tagName, append() {}})},
    env: {window: {navigator: {}}, Image: class {}, URL: {}},
    ports,
    history: {
      cancelPendingHistory: () => calls.push("cancelPendingHistory"),
      pushHistorySnapshot: (...args) => calls.push(["pushHistorySnapshot", ...args]),
      withHistory: (label, fn) => {
        calls.push(["history", label]);
        return fn();
      },
      updateHistoryButtons: () => calls.push("updateHistoryButtons")
    },
    manual: {
      closeManualPaletteEditor: () => calls.push("closeManualPaletteEditor"),
      renderManualSwatches: () => calls.push("renderManualSwatches"),
      syncManualSwatches: () => config.manualPalette
    },
    palette: {
      presetExists: () => true,
      presetColors: () => ["#111111"],
      presetSize: () => 1,
      manualPresetName: id => `manualPreset:${id}`,
      activePaletteImageData: () => null,
      activePaletteRegionRect: () => null,
      getPaletteRecords: () => state.paletteRecords,
      manualCycleModeEnabled: () => false,
      updateGeneratedLockUi: () => calls.push("updateGeneratedLockUi")
    },
    view: {
      updatePaletteRegionUi: () => calls.push("updatePaletteRegionUi"),
      updatePaletteRegionOverlay: () => calls.push("updatePaletteRegionOverlay"),
      updateViewStatus: () => calls.push("updateViewStatus"),
      syncCompareControls: () => calls.push("syncCompareControls"),
      resetView: () => calls.push("resetView"),
      resetPaletteRegion: () => calls.push("resetPaletteRegion")
    },
    render: {
      markEverythingDirty: () => calls.push("markEverythingDirty"),
      markLevelsDirty: () => calls.push("markLevelsDirty"),
      markPaletteDirty: () => calls.push("markPaletteDirty"),
      markTextureDirty: () => calls.push("markTextureDirty"),
      queueRender: () => calls.push("queueRender")
    },
    exporting: {
      syncAnimationExportUi: () => calls.push("syncAnimationExportUi")
    },
    setStatus: message => calls.push(["status", message])
  });

  assert.equal(typeof domain.config.cloneConfigSnapshot, "function");
  assert.equal(typeof domain.manualPalette.captureCurrentPaletteToManual, "function");
  assert.equal(typeof domain.randomizer.randomizePalette, "function");
  assert.equal(typeof domain.conditionalPanels.updateConditionalPanels, "function");
  assert.equal(typeof domain.reset.resetSettings, "function");
  assert.equal(ports.config.get(), domain.configController);
  assert.equal(ports.conditionalPanels.get(), domain.conditionalPanelsController);
  assert.equal(ports.reset.get(), domain.resetController);

  domain.updateConditionalPanels();

  assert.equal(body.dataset.paletteMode, "harmony");
  assert.equal(body.dataset.cosinePreset, "custom");
  assert.equal(body.dataset.assignMode, "nearest");
  assert.equal(body.dataset.outputMode, "mapped");
  assert.equal(els.capturePalette.disabled, false);
  assert.equal(capturePaletteMenu.classList.disabled, false);
  assert.ok(calls.includes("updateGeneratedLockUi"));
  assert.ok(calls.includes("syncCycleControls"));
});

test("app actions domain wraps panel reset operations in history", () => {
  const calls = [];
  const config = {paletteMode: "manual", assignMode: "nearest", outputMode: "mapped", manualPalette: [], manualMatchAliases: []};
  const ports = createAppPorts();
  ports.cyclePreview.attach({stopCyclePreview() {}, syncCycleControls() {}, toggleCyclePreview() {}});
  ports.paletteRegion.attach({cancelPaletteRegionDrag() {}});
  const domain = createAppActionsDomain({
    els: {},
    state: {paletteRegion: {}, manualPresets: [], animationExport: {}, paletteRecords: []},
    config,
    root: {body: {dataset: {}}, createElement: tagName => ({tagName, append() {}})},
    env: {window: {}, Image: class {}, URL: {}},
    ports,
    history: {
      withHistory: (label, fn) => {
        calls.push(label);
        return fn();
      },
      pushHistorySnapshot() {},
      cancelPendingHistory() {},
      updateHistoryButtons() {}
    },
    manual: {closeManualPaletteEditor() {}, renderManualSwatches() {}, syncManualSwatches: () => []},
    palette: {
      presetExists: () => true,
      presetColors: () => [],
      presetSize: () => 0,
      manualPresetName: id => id,
      activePaletteImageData: () => null,
      activePaletteRegionRect: () => null,
      getPaletteRecords: () => [],
      manualCycleModeEnabled: () => false,
      updateGeneratedLockUi() {}
    },
    view: {
      updatePaletteRegionUi() {},
      updatePaletteRegionOverlay() {},
      updateViewStatus() {},
      syncCompareControls() {},
      resetView() {},
      resetPaletteRegion() {}
    },
    render: {
      markEverythingDirty() {},
      markLevelsDirty() {},
      markPaletteDirty() {},
      markTextureDirty() {},
      queueRender() {}
    },
    exporting: {syncAnimationExportUi() {}},
    setStatus() {}
  });

  const result = domain.resetPanelControls({querySelectorAll: () => []}, {label: "demo"});

  assert.equal(result, false);
  assert.deepEqual(calls, ["Reset demo controls"]);
});
