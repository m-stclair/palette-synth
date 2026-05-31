import test from "node:test";
import assert from "node:assert/strict";
import { attachColorPicker, syncColorPickerInput } from "../src/ui/color-picker.js";

function makeElement(tagName = "div", ownerDocument = null) {
  const listeners = new Map();
  const classes = new Set();
  const el = {
    tagName: tagName.toUpperCase(),
    ownerDocument,
    children: [],
    parentNode: null,
    style: {
      setProperty(name, value) {
        this[name] = String(value);
      }
    },
    attributes: {},
    dataset: {},
    hidden: false,
    disabled: false,
    readOnly: false,
    value: "",
    type: "",
    title: "",
    autocomplete: "",
    spellcheck: true,
    inputMode: "",
    tabIndex: 0,
    textContent: "",
    id: "",
    classList: {
      add(...names) {
        for (const name of names) classes.add(name);
      },
      remove(...names) {
        for (const name of names) classes.delete(name);
      },
      toggle(name, force) {
        const shouldAdd = force === undefined ? !classes.has(name) : !!force;
        if (shouldAdd) classes.add(name);
        else classes.delete(name);
        return shouldAdd;
      },
      contains(name) {
        return classes.has(name);
      }
    },
    append(...nodes) {
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        node.parentNode = el;
        node.ownerDocument ||= ownerDocument;
        el.children.push(node);
      }
    },
    remove() {
      if (!el.parentNode) return;
      el.parentNode.children = el.parentNode.children.filter(child => child !== el);
      el.parentNode = null;
    },
    setAttribute(name, value) {
      el.attributes[name] = String(value);
    },
    getAttribute(name) {
      return el.attributes[name] ?? null;
    },
    removeAttribute(name) {
      delete el.attributes[name];
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatchEvent(event) {
      const normalized = typeof event === "string" ? {type: event} : event;
      for (const listener of listeners.get(normalized.type) || []) listener(normalized);
      return true;
    },
    click() {
      el.dispatchEvent({type: "click"});
    },
    focus() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    getBoundingClientRect() {
      return {left: 0, top: 0, right: 184, bottom: 184, width: 184, height: 184};
    },
    getContext() {
      return null;
    }
  };
  Object.defineProperty(el, "className", {
    get() {
      return [...classes].join(" ");
    },
    set(value) {
      classes.clear();
      String(value || "").split(/\s+/).filter(Boolean).forEach(name => classes.add(name));
    }
  });
  return el;
}

function installDocument() {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const doc = {
    body: null,
    createElement(tagName) {
      return makeElement(tagName, doc);
    },
    addEventListener() {},
    querySelector() {
      return null;
    }
  };
  doc.body = makeElement("body", doc);
  globalThis.document = doc;
  globalThis.window = {innerWidth: 1024, innerHeight: 768, addEventListener() {}};
  return () => {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  };
}

function findByClass(root, className) {
  if (root.classList?.contains(className)) return root;
  for (const child of root.children || []) {
    const found = findByClass(child, className);
    if (found) return found;
  }
  return null;
}

function findByAriaLabel(root, label) {
  if (root.getAttribute?.("aria-label") === label) return root;
  for (const child of root.children || []) {
    const found = findByAriaLabel(child, label);
    if (found) return found;
  }
  return null;
}

function pointerEvent(type, x, y) {
  return {
    type,
    clientX: x,
    clientY: y,
    pointerId: 1,
    buttons: type === "pointerup" ? 0 : 1,
    preventDefault() {}
  };
}

test("color picker triangle can select saturated sRGB yellow", () => {
  const restore = installDocument();
  try {
    const input = makeElement("input", document);
    input.value = "#ffff00";
    document.body.append(input);

    const picker = attachColorPicker(input, {label: "Test color"});
    picker.open({focus: false});

    const plane = findByClass(document.body, "app-color-picker-plane");
    assert.ok(plane);

    plane.dispatchEvent(pointerEvent("pointerdown", 141.36, 120.5));
    plane.dispatchEvent(pointerEvent("pointerup", 141.36, 120.5));
    assert.equal(input.value, "#000000");

    plane.dispatchEvent(pointerEvent("pointerdown", 92, 35));
    plane.dispatchEvent(pointerEvent("pointerup", 92, 35));
    assert.equal(input.value, "#ffff00");
  } finally {
    restore();
  }
});

test("color picker preserves max chroma intent while rotating hue", () => {
  const restore = installDocument();
  try {
    const input = makeElement("input", document);
    input.value = "#ffff00";
    document.body.append(input);

    const picker = attachColorPicker(input, {label: "Test color"});
    picker.open({focus: false});

    const plane = findByClass(document.body, "app-color-picker-plane");
    assert.ok(plane);

    const center = 92;
    const ringRadius = 74.5;
    const yellowHue = 1.9158345171210678;
    plane.dispatchEvent(pointerEvent("pointerdown", center + ringRadius, center));
    assert.notEqual(input.value, "#ffff00");
    plane.dispatchEvent(pointerEvent(
      "pointermove",
      center + Math.cos(yellowHue) * ringRadius,
      center + Math.sin(yellowHue) * ringRadius
    ));
    plane.dispatchEvent(pointerEvent("pointerup", center + Math.cos(yellowHue) * ringRadius, center + Math.sin(yellowHue) * ringRadius));

    assert.equal(input.value, "#ffff00");
  } finally {
    restore();
  }
});



test("color picker preserves underlying hue for low-chroma colors on open", () => {
  const restore = installDocument();
  try {
    const input = makeElement("input", document);
    input.value = "#c7d5ef";
    document.body.append(input);

    const picker = attachColorPicker(input, {label: "Test color"});
    picker.open({focus: false});

    const hueInput = findByAriaLabel(document.body, "OKLCh hue degrees");
    assert.ok(hueInput);
    assert.notEqual(hueInput.value, "0");
    assert.equal(hueInput.value, "263");
  } finally {
    restore();
  }
});
function makeCountingContext(counter) {
  return {
    createImageData(width, height) {
      counter.createImageData += 1;
      return {width, height, data: new Uint8ClampedArray(width * height * 4)};
    },
    putImageData() {
      counter.putImageData += 1;
    },
    clearRect() {},
    save() {},
    restore() {},
    beginPath() {},
    arc() {},
    stroke() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    set lineWidth(value) {},
    set strokeStyle(value) {}
  };
}

test("color picker skips duplicate wheel redraws during external input sync", () => {
  const restore = installDocument();
  try {
    const input = makeElement("input", document);
    input.value = "#ffff00";
    document.body.append(input);

    const picker = attachColorPicker(input, {label: "Test color"});
    picker.open({focus: false});

    const plane = findByClass(document.body, "app-color-picker-plane");
    assert.ok(plane);
    const counter = {createImageData: 0, putImageData: 0};
    const context = makeCountingContext(counter);
    plane.getContext = () => context;
    input.addEventListener("input", () => picker.syncFromInput());

    plane.dispatchEvent(pointerEvent("pointerdown", 166.5, 92));

    assert.equal(counter.putImageData, 1);
  } finally {
    restore();
  }
});

test("color picker defers closed popover model sync until reopened", () => {
  const restore = installDocument();
  try {
    const input = makeElement("input", document);
    input.value = "#000000";
    document.body.append(input);

    const picker = attachColorPicker(input, {label: "Test color"});
    picker.open({focus: false});
    const popover = findByClass(document.body, "app-color-picker-popover");
    const hexInput = popover.children?.[4]?.children?.[0]?.children?.[1];
    assert.ok(popover);
    assert.ok(hexInput);
    assert.equal(hexInput.value, "#000000");

    picker.close({commit: false});
    input.value = "#00ff00";
    syncColorPickerInput(input);

    assert.equal(popover.hidden, true);
    assert.equal(input.style["--picker-color"], "#00ff00");
    assert.equal(hexInput.value, "#000000");

    picker.open({focus: false});
    assert.equal(hexInput.value, "#00ff00");
  } finally {
    restore();
  }
});

test("color picker eyedropper applies sampled screen color", async () => {
  const restore = installDocument();
  const previousEyeDropper = globalThis.EyeDropper;
  try {
    let openCalls = 0;
    globalThis.EyeDropper = class {
      open() {
        openCalls += 1;
        return Promise.resolve({sRGBHex: "#12ABef"});
      }
    };

    const input = makeElement("input", document);
    input.value = "#000000";
    document.body.append(input);

    let inputEvents = 0;
    let changeEvents = 0;
    input.addEventListener("input", () => { inputEvents += 1; });
    input.addEventListener("change", () => { changeEvents += 1; });

    const picker = attachColorPicker(input, {label: "Test color"});
    picker.open({focus: false});

    const eyeDropper = findByClass(document.body, "app-color-picker-eyedropper");
    assert.ok(eyeDropper);
    assert.equal(eyeDropper.disabled, false);

    eyeDropper.dispatchEvent({type: "click"});
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(openCalls, 1);
    assert.equal(input.value, "#12abef");
    assert.equal(inputEvents, 1);
    assert.equal(changeEvents, 1);
    assert.equal(eyeDropper.disabled, false);
  } finally {
    if (previousEyeDropper === undefined) delete globalThis.EyeDropper;
    else globalThis.EyeDropper = previousEyeDropper;
    restore();
  }
});

test("color picker eyedropper keeps native open in the click activation path", async () => {
  const restore = installDocument();
  const previousEyeDropper = globalThis.EyeDropper;
  try {
    const input = makeElement("input", document);
    input.value = "#000000";
    document.body.append(input);

    const picker = attachColorPicker(input, {label: "Test color"});
    picker.open({focus: false});

    const eyeDropper = findByClass(document.body, "app-color-picker-eyedropper");
    assert.ok(eyeDropper);

    let disabledWhenOpenWasCalled = null;
    globalThis.EyeDropper = class {
      open() {
        disabledWhenOpenWasCalled = eyeDropper.disabled;
        return Promise.resolve({sRGBHex: "#abcdef"});
      }
    };

    eyeDropper.dispatchEvent({type: "click"});
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(disabledWhenOpenWasCalled, false);
    assert.equal(input.value, "#abcdef");
  } finally {
    if (previousEyeDropper === undefined) delete globalThis.EyeDropper;
    else globalThis.EyeDropper = previousEyeDropper;
    restore();
  }
});

test("color picker pick button falls back to native color input", async () => {
  const restore = installDocument();
  const previousEyeDropper = globalThis.EyeDropper;
  try {
    delete globalThis.EyeDropper;
    const input = makeElement("input", document);
    input.value = "#000000";
    document.body.append(input);

    let inputEvents = 0;
    let changeEvents = 0;
    input.addEventListener("input", () => { inputEvents += 1; });
    input.addEventListener("change", () => { changeEvents += 1; });

    const picker = attachColorPicker(input, {label: "Test color"});
    picker.open({focus: false});

    const eyeDropper = findByClass(document.body, "app-color-picker-eyedropper");
    const nativeColor = findByClass(document.body, "app-color-picker-native-color");
    assert.ok(eyeDropper);
    assert.ok(nativeColor);
    assert.equal(eyeDropper.disabled, false);

    nativeColor.click = () => {
      nativeColor.value = "#334455";
      nativeColor.dispatchEvent({type: "input"});
      nativeColor.dispatchEvent({type: "change"});
    };

    eyeDropper.dispatchEvent({type: "click"});
    await Promise.resolve();

    assert.equal(input.value, "#334455");
    assert.equal(inputEvents, 1);
    assert.equal(changeEvents, 1);
  } finally {
    if (previousEyeDropper === undefined) delete globalThis.EyeDropper;
    else globalThis.EyeDropper = previousEyeDropper;
    restore();
  }
});


test("color picker native color fallback prefers showPicker and propagates change", async () => {
  const restore = installDocument();
  const previousEyeDropper = globalThis.EyeDropper;
  try {
    delete globalThis.EyeDropper;
    const input = makeElement("input", document);
    input.value = "#000000";
    document.body.append(input);

    const propagated = [];
    input.addEventListener("input", () => propagated.push(["input", input.value]));
    input.addEventListener("change", () => propagated.push(["change", input.value]));

    const picker = attachColorPicker(input, {label: "Test color"});
    picker.open({focus: false});

    const eyeDropper = findByClass(document.body, "app-color-picker-eyedropper");
    const nativeColor = findByClass(document.body, "app-color-picker-native-color");
    assert.ok(eyeDropper);
    assert.ok(nativeColor);

    let showPickerCalls = 0;
    nativeColor.click = () => {
      throw new Error("click fallback should not run when showPicker exists");
    };
    nativeColor.showPicker = () => {
      showPickerCalls += 1;
      nativeColor.value = "#778899";
      nativeColor.dispatchEvent({type: "input"});
      nativeColor.dispatchEvent({type: "change"});
    };

    eyeDropper.dispatchEvent({type: "click"});
    await Promise.resolve();

    assert.equal(showPickerCalls, 1);
    assert.equal(input.value, "#778899");
    assert.deepEqual(propagated, [["input", "#778899"], ["change", "#778899"]]);
  } finally {
    if (previousEyeDropper === undefined) delete globalThis.EyeDropper;
    else globalThis.EyeDropper = previousEyeDropper;
    restore();
  }
});

// Chrome has shipped versions of the EyeDropper API where result.sRGBHex is
// returned as an rgb()/rgba() string instead of "#RRGGBB", contrary to spec.
// The picker must coerce these into hex rather than silently bailing.
test("color picker eyedropper accepts rgba() output from non-spec browsers", async () => {
  const restore = installDocument();
  const previousEyeDropper = globalThis.EyeDropper;
  try {
    globalThis.EyeDropper = class {
      open() {
        return Promise.resolve({sRGBHex: "rgba(255, 128, 64, 1)"});
      }
    };

    const input = makeElement("input", document);
    input.value = "#000000";
    document.body.append(input);

    const picker = attachColorPicker(input, {label: "Test color"});
    picker.open({focus: false});

    const eyeDropper = findByClass(document.body, "app-color-picker-eyedropper");
    eyeDropper.dispatchEvent({type: "click"});
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(input.value, "#ff8040");
  } finally {
    if (previousEyeDropper === undefined) delete globalThis.EyeDropper;
    else globalThis.EyeDropper = previousEyeDropper;
    restore();
  }
});

test("color picker eyedropper accepts CSS Color 4 space-separated rgb() output", async () => {
  const restore = installDocument();
  const previousEyeDropper = globalThis.EyeDropper;
  try {
    globalThis.EyeDropper = class {
      open() {
        return Promise.resolve({sRGBHex: "rgb(16 200 96 / 1)"});
      }
    };

    const input = makeElement("input", document);
    input.value = "#000000";
    document.body.append(input);

    const picker = attachColorPicker(input, {label: "Test color"});
    picker.open({focus: false});

    const eyeDropper = findByClass(document.body, "app-color-picker-eyedropper");
    eyeDropper.dispatchEvent({type: "click"});
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(input.value, "#10c860");
  } finally {
    if (previousEyeDropper === undefined) delete globalThis.EyeDropper;
    else globalThis.EyeDropper = previousEyeDropper;
    restore();
  }
});
