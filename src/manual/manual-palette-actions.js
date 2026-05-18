import {DEFAULT_CONFIG} from "../state/config.js";
import {MAX_PALETTE_SIZE, PALETTE_PRESETS} from "../constants.js";
import {byteRgbToHex, clamp, labToHex, normalizeHexColor, normalizeManualLab} from "../color-utils.js";
import {createManualSwatch, manualSwatchesFromColors, normalizeCapturedPaletteEntry} from "./swatches.js";
import {
    createManualPresetId,
    loadManualPresets,
    normalizeManualPreset,
    saveManualPresets
} from "../storage/manual-presets.js";

export function humanizePresetName(name) {
    return String(name)
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/^./, ch => ch.toUpperCase());
}

export const PRESET_CATEGORY_ORDER = [
    "Computer hardware",
    "Consoles + handhelds",
    "Fantasy consoles",
    "Operating systems + terminals",
    "Game worlds",
    "Art + mood",
    "Other presets"
];

const PRESET_CATEGORY_BY_NAME = {
    amigaWorkbench: "Computer hardware",
    amigaDemoscene: "Computer hardware",
    amigaCopperSunset: "Computer hardware",
    appleIIHgr: "Computer hardware",
    atariST: "Computer hardware",
    cgaBright: "Computer hardware",
    cgaMode4Cyan: "Computer hardware",
    cgaMode4Green: "Computer hardware",
    commodore64: "Computer hardware",
    lotus123: "Computer hardware",
    msxTms9918: "Computer hardware",
    pc98VisualNovel: "Computer hardware",
    tandy1000: "Computer hardware",
    x68000Cyber: "Computer hardware",
    zxSpectrum: "Computer hardware",

    gameBoyDmg: "Consoles + handhelds",
    gameBoyPocket: "Consoles + handhelds",
    neoGeoFighter: "Consoles + handhelds",
    nes: "Consoles + handhelds",
    saturnArcade: "Consoles + handhelds",
    virtualBoy: "Consoles + handhelds",

    pico8: "Fantasy consoles",
    tic80Sweetie16: "Fantasy consoles",

    dosMidnightCommander: "Operating systems + terminals",
    greenPhosphor: "Operating systems + terminals",
    irixDesktop: "Operating systems + terminals",
    macintoshClassic: "Operating systems + terminals",
    solarisCde: "Operating systems + terminals",
    terminalAmber: "Operating systems + terminals",
    win32: "Operating systems + terminals",
    win95Teal: "Operating systems + terminals",

    arcadeNeon: "Game worlds",
    castlevania: "Game worlds",
    doomMars: "Game worlds",
    egaDungeon: "Game worlds",
    poisonDamage: "Game worlds",
    snesRpgTown: "Game worlds",
    quakeBrown: "Game worlds",
    swampRpg: "Game worlds",
    vgaDungeon: "Game worlds",

    "1bit": "Art + mood",
    agedSilk: "Art + mood",
    alpineClouds: "Art + mood",
    bauhaus: "Art + mood",
    bruise: "Art + mood",
    cassette: "Art + mood",
    coldSun: "Art + mood",
    coolPortrait: "Art + mood",
    cyberNight: "Art + mood",
    desertCRT: "Art + mood",
    forestStaircase: "Art + mood",
    geocitiesNight: "Art + mood",
    hauntedMonitor: "Art + mood",
    jungleDawn: "Art + mood",
    liminalWater: "Art + mood",
    lospec: "Art + mood",
    mint: "Art + mood",
    moroccanTile: "Art + mood",
    nanGoldin: "Art + mood",
    nightLake: "Art + mood",
    noir: "Art + mood",
    playaDusk: "Art + mood",
    retrofuture: "Art + mood",
    roseGlass: "Art + mood",
    sepiaType: "Art + mood",
    smokeBreak: "Art + mood",
    softGoth: "Art + mood",
    synthwaveBbs: "Art + mood",
    vaporwaveDos: "Art + mood",
    victorianAutumn: "Art + mood",
    witchLuxe: "Art + mood",
    zuhanden: "Art + mood"
};

function comparePresetLabels(a, b) {
    return humanizePresetName(a).localeCompare(humanizePresetName(b), undefined, {sensitivity: "base", numeric: true});
}

function compareManualPresetLabels(a, b) {
    return String(a?.name || "").localeCompare(String(b?.name || ""), undefined, {sensitivity: "base", numeric: true});
}

export function presetCategoryForName(name) {
    return PRESET_CATEGORY_BY_NAME[name] || "Other presets";
}

export function groupedBuiltInPresetNames(presets = PALETTE_PRESETS) {
    const buckets = new Map(PRESET_CATEGORY_ORDER.map(label => [label, []]));
    for (const name of Object.keys(presets || {}).sort(comparePresetLabels)) {
        const category = presetCategoryForName(name);
        if (!buckets.has(category)) buckets.set(category, []);
        buckets.get(category).push(name);
    }
    return PRESET_CATEGORY_ORDER
        .filter(label => buckets.get(label)?.length)
        .map(label => ({label, names: buckets.get(label)}));
}


function normalizeHexToken(token) {
    if (typeof token !== "string") return null;
    let raw = token.trim().replace(/^#|^0x/i, "");
    if (![3, 4, 6, 8].includes(raw.length) || /[^0-9a-f]/i.test(raw)) return null;
    if (raw.length === 3 || raw.length === 4) raw = raw.slice(0, 3).split("").map(ch => ch + ch).join("");
    if (raw.length === 8) raw = raw.slice(0, 6);
    return normalizeHexColor(`#${raw}`, null);
}

function parseCssNumberToken(token, max = 255) {
    const text = String(token ?? "").trim();
    if (!text) return null;
    if (text.endsWith("%")) {
        const pct = Number.parseFloat(text.slice(0, -1));
        return Number.isFinite(pct) ? clamp((pct / 100) * max, 0, max) : null;
    }
    const value = Number.parseFloat(text);
    return Number.isFinite(value) ? clamp(value, 0, max) : null;
}

function rgbFunctionToHex(body) {
    const source = String(body ?? "")
        .replace(/\/[^,]+$/, "")
        .replace(/,/g, " ")
        .trim();
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length < 3) return null;
    const rgb = parts.slice(0, 3).map(part => parseCssNumberToken(part, 255));
    if (rgb.some(value => value === null)) return null;
    return byteRgbToHex(rgb[0], rgb[1], rgb[2]);
}

function parseHueToken(token) {
    const text = String(token ?? "").trim().toLowerCase();
    if (!text) return null;
    const value = Number.parseFloat(text);
    if (!Number.isFinite(value)) return null;
    if (text.endsWith("turn")) return value * 360;
    if (text.endsWith("rad")) return value * (180 / Math.PI);
    if (text.endsWith("grad")) return value * 0.9;
    return value;
}

function hslFunctionToHex(body) {
    const source = String(body ?? "")
        .replace(/\/[^,]+$/, "")
        .replace(/,/g, " ")
        .trim();
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length < 3) return null;
    const hue = parseHueToken(parts[0]);
    const sat = parseCssNumberToken(parts[1], 1);
    const light = parseCssNumberToken(parts[2], 1);
    if (hue === null || sat === null || light === null) return null;
    const h = ((hue % 360) + 360) % 360 / 360;
    const s = clamp(sat, 0, 1);
    const l = clamp(light, 0, 1);
    if (s === 0) {
        const channel = l * 255;
        return byteRgbToHex(channel, channel, channel);
    }
    const hueToRgb = (p, q, t0) => {
        let t = t0;
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return byteRgbToHex(
        hueToRgb(p, q, h + 1 / 3) * 255,
        hueToRgb(p, q, h) * 255,
        hueToRgb(p, q, h - 1 / 3) * 255
    );
}

function pushColorMatch(matches, index, end, hex) {
    if (!hex || index < 0 || end <= index) return;
    matches.push({index, end, hex});
}

function rangesOverlap(a, b) {
    return a.index < b.end && b.index < a.end;
}

export function extractPaletteColorsFromText(text, limit = MAX_PALETTE_SIZE) {
    const source = String(text ?? "");
    const matches = [];

    for (const match of source.matchAll(/(?:#|0x)([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g)) {
        pushColorMatch(matches, match.index, match.index + match[0].length, normalizeHexToken(match[0]));
    }

    for (const match of source.matchAll(/(^|[^0-9A-Za-z#])([0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?=$|[^0-9A-Za-z])/g)) {
        const token = match[2];
        const index = match.index + match[1].length;
        pushColorMatch(matches, index, index + token.length, normalizeHexToken(token));
    }

    for (const match of source.matchAll(/rgba?\(([^)]*)\)/gi)) {
        pushColorMatch(matches, match.index, match.index + match[0].length, rgbFunctionToHex(match[1]));
    }

    for (const match of source.matchAll(/hsla?\(([^)]*)\)/gi)) {
        pushColorMatch(matches, match.index, match.index + match[0].length, hslFunctionToHex(match[1]));
    }

    return matches
        .sort((a, b) => (a.index - b.index) || (b.end - b.index) - (a.end - a.index))
        .reduce((out, match) => {
            if (out.length >= limit) return out;
            if (out.some(existing => rangesOverlap(existing, match))) return out;
            out.push(match);
            return out;
        }, [])
        .map(match => match.hex);
}

function byId(root, id) {
    return root?.getElementById?.(id) || null;
}

export function createManualPaletteActions({
                                               els,
                                               state,
                                               config,
                                               root,
                                               window,
                                               Image,
                                               URL,
                                               cloneConfigSnapshot,
                                               pushHistorySnapshot,
                                               withHistory,
                                               presetExists,
                                               presetColors,
                                               presetSize,
                                               manualPresetName,
                                               activePaletteImageData,
                                               activePaletteRegionRect,
                                               getPaletteRecords,
                                               syncManualSwatches,
                                               renderManualSwatches,
                                               markPaletteDirty,
                                               updateConditionalPanels,
                                               queueRender,
                                               setStatus,
                                               setOutputText
                                           }) {
    function loadStoredManualPresets() {
        state.manualPresets = loadManualPresets();
    }

    function saveStoredManualPresets() {
        if (!saveManualPresets(state.manualPresets)) {
            setStatus("Could not save manual presets. Local storage may be blocked.");
        }
    }

    function addManualPreset(name, colors) {
        const preset = normalizeManualPreset({
            id: createManualPresetId(name),
            name,
            createdAt: new Date().toISOString(),
            colors
        }, name);
        if (!preset) return null;
        state.manualPresets.unshift(preset);
        state.manualPresets = state.manualPresets.slice(0, 80);
        saveStoredManualPresets();
        populatePresetSelect(config.presetName);
        return preset;
    }

    function presetSelectEntries() {
        const builtIn = groupedBuiltInPresetNames(PALETTE_PRESETS)
            .flatMap(group => group.names);
        const captured = [...(state.manualPresets || [])]
            .sort(compareManualPresetLabels)
            .map(preset => manualPresetName(preset.id));
        return [...builtIn, ...captured].filter(presetExists);
    }

    function presetDisplayName(name) {
        const manualId = String(name || "").startsWith("manualPreset:") ? String(name).slice("manualPreset:".length) : "";
        if (manualId) return state.manualPresets.find(preset => preset.id === manualId)?.name || "Captured preset";
        return humanizePresetName(name);
    }

    function syncPresetSelection(name) {
        const fallback = presetExists(DEFAULT_CONFIG.presetName) ? DEFAULT_CONFIG.presetName : presetSelectEntries()[0];
        const next = presetExists(name) ? name : fallback;
        if (!next) return null;
        config.presetName = next;
        if (els.presetName) els.presetName.value = next;
        const select = byId(root, "presetName");
        if (select) select.value = next;
        return next;
    }

    function appendPresetOption(group, name) {
        const option = root.createElement("option");
        option.value = name;
        option.textContent = `${humanizePresetName(name)} (${presetSize(name)})`;
        group.append(option);
    }

    function populatePresetSelect(selectedName = config.presetName) {
        const select = byId(root, "presetName");
        if (!select) return;
        select.innerHTML = "";

        const builtInGroups = groupedBuiltInPresetNames(PALETTE_PRESETS);
        if (!builtInGroups.length) {
            const emptyBuiltInGroup = root.createElement("optgroup");
            emptyBuiltInGroup.label = "Built-in";
            select.append(emptyBuiltInGroup);
        }
        for (const group of builtInGroups) {
            const optgroup = root.createElement("optgroup");
            optgroup.label = group.label;
            for (const name of group.names) appendPresetOption(optgroup, name);
            select.append(optgroup);
        }

        if (state.manualPresets.length) {
            const manualGroup = root.createElement("optgroup");
            manualGroup.label = "Captured manual";
            for (const preset of [...state.manualPresets].sort(compareManualPresetLabels)) {
                const option = root.createElement("option");
                option.value = manualPresetName(preset.id);
                option.textContent = `${preset.name} (${preset.colors.length})`;
                manualGroup.append(option);
            }
            select.append(manualGroup);
        }

        syncPresetSelection(selectedName);
    }

    function loadPresetAsManual(name = config.presetName) {
        const selectedName = syncPresetSelection(name);
        if (!selectedName) {
            setStatus("No palette presets found.");
            return false;
        }
        const colors = presetColors(selectedName).slice(0, Math.min(42, presetSize(selectedName)));
        if (!colors.length) {
            setStatus("That preset has no colors to load.");
            return false;
        }
        withHistory("Load preset as manual palette", () => {
            config.paletteMode = "manual";
            if (els.paletteMode) els.paletteMode.value = "manual";
            config.manualPalette = manualSwatchesFromColors(colors, `preset-${selectedName}`);
            config.manualMatchAliases = [];
            renderManualSwatches();
            markPaletteDirty();
            updateConditionalPanels();
            queueRender();
            setStatus(`Loaded preset: ${presetDisplayName(selectedName)}.`);
        });
        return true;
    }

    function switchPalettePreset(delta = 1) {
        const entries = presetSelectEntries();
        if (!entries.length) {
            setStatus("No palette presets found.");
            return false;
        }
        const current = presetExists(config.presetName) ? config.presetName : entries[0];
        const index = Math.max(0, entries.indexOf(current));
        const next = entries[(index + Math.sign(delta || 1) + entries.length) % entries.length];
        return loadPresetAsManual(next);
    }

    function visiblePaletteHasColors() {
        return colorsFromVisiblePalette().length > 0;
    }

    function capturePaletteAvailable(mode = config.paletteMode, {compute = true} = {}) {
        if (mode === "manual") return false;

        // UI availability path. Do not synthesize palettes here.
        if (!compute) return true;

        // Action/validation path. This may compute.
        return visiblePaletteHasColors();
    }

    function updateCapturePaletteUi() {
        const available = capturePaletteAvailable(config.paletteMode, {compute: false});
        if (els.capturePalette) els.capturePalette.disabled = !available;
        if (els.capturePaletteMenu) els.capturePaletteMenu.classList.toggle("is-disabled", !available);
    }

    function captureSourceLabel(mode = config.paletteMode) {
        if (mode === "generated") {
            if (!activePaletteImageData(mode)) return "visible palette";
            const region = activePaletteRegionRect(activePaletteImageData(mode), mode);
            return region ? `selected region ${region.width}×${region.height}` : "main image";
        }
        if (mode === "generatedReference") return activePaletteImageData(mode) ? "reference image" : "visible palette";
        if (mode === "harmony") return "harmony";
        if (mode === "cosine") return "cosine";
        if (mode === "manual") return "manual palette";
        return "visible palette";
    }

    function captureSeedForMode(mode = config.paletteMode) {
        if (mode === "generatedReference") return "reference";
        if (mode === "harmony") return `harmony-${config.harmonyRelationship}`;
        if (mode === "cosine") return `cosine-${config.cosinePreset}`;
        if (mode === "manual") return "manual";
        return "generated";
    }

    function capturedPaletteEntriesFromVisiblePalette() {
        const records = state.paletteRecords.length && !state.paletteDirty ? state.paletteRecords : getPaletteRecords();
        return records
            .slice(0, MAX_PALETTE_SIZE)
            .map(record => {
                const lab = normalizeManualLab(record.lab);
                const hex = normalizeHexColor(record.hex ?? (lab ? labToHex(lab) : ""), lab ? labToHex(lab) : "");
                return hex ? {hex, lab, colorSpace: lab ? "oklab-scaled" : null} : null;
            })
            .filter(Boolean);
    }

    function colorsFromVisiblePalette() {
        return capturedPaletteEntriesFromVisiblePalette().map(entry => entry.hex);
    }

    function defaultManualPresetName(mode = config.paletteMode) {
        const d = new Date();
        const pad = n => String(n).padStart(2, "0");
        const source = captureSourceLabel(mode).replace(/\s+/g, " ");
        return `${source} ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
    }

    function applyCapturedColorsToManual(colors, strategy = "replace", seed = captureSeedForMode()) {
        const current = syncManualSwatches();
        const incoming = colors
            .slice(0, MAX_PALETTE_SIZE)
            .map(normalizeCapturedPaletteEntry)
            .filter(Boolean);
        if (!incoming.length) return {changed: false, count: 0};

        const swatchFromEntry = (entry, swatchSeed, locked = false) => createManualSwatch(entry.hex, null, swatchSeed, locked, entry.lab);

        if (strategy === "append") {
            const room = Math.max(0, MAX_PALETTE_SIZE - current.length);
            const additions = incoming.slice(0, room).map((entry, index) => swatchFromEntry(entry, `${seed}-append-${index + 1}`));
            config.manualPalette = current.concat(additions);
            return {changed: additions.length > 0, count: additions.length};
        }

        if (strategy === "fillUnlocked") {
            const out = current.map(swatch => ({...swatch}));
            let cursor = 0;
            let filled = 0;
            for (let i = 0; i < out.length && cursor < incoming.length; i++) {
                if (out[i].locked) continue;
                const entry = incoming[cursor++];
                const {lab, colorSpace, ...swatch} = out[i];
                out[i] = {...swatch, hex: entry.hex, aliasHex: null};
                if (entry.lab) {
                    out[i].lab = entry.lab;
                    out[i].colorSpace = "oklab-scaled";
                }
                filled++;
            }
            while (cursor < incoming.length && out.length < MAX_PALETTE_SIZE) {
                out.push(swatchFromEntry(incoming[cursor], `${seed}-fill-${cursor + 1}`));
                cursor++;
                filled++;
            }
            config.manualPalette = out;
            return {changed: filled > 0, count: filled};
        }

        config.manualPalette = manualSwatchesFromColors(incoming, seed);
        return {changed: true, count: incoming.length};
    }

    function captureCurrentPaletteToManual(strategy = "replace") {
        const mode = config.paletteMode;
        if (mode === "manual") {
            setStatus("No visible palette to capture.");
            return;
        }
        const captured = capturedPaletteEntriesFromVisiblePalette();
        if (!captured.length) {
            setStatus("No visible palette to capture.");
            return;
        }

        let preset = null;
        if (strategy === "preset") {
            const name = window.prompt("Name this manual preset", defaultManualPresetName(mode));
            if (name === null) return;
            preset = addManualPreset(name, captured.map(entry => entry.hex));
            if (!preset) {
                setStatus("Could not save manual preset.");
                return;
            }
        }

        const strategyLabels = {
            replace: "Replace manual palette",
            append: "Append to manual palette",
            fillUnlocked: "Fill unlocked manual slots",
            preset: "Save manual preset"
        };
        const source = captureSourceLabel(mode);

        withHistory(strategyLabels[strategy] || "Capture palette", () => {
            const result = applyCapturedColorsToManual(captured, strategy === "preset" ? "replace" : strategy, captureSeedForMode(mode));
            if (!result.changed) {
                setStatus(strategy === "append" ? "Manual palette is already full." : "No manual slots were available to fill.");
                return;
            }
            config.paletteMode = "manual";
            if (config.generatedAssist !== 0) config.generatedAssist = 0;
            if (preset) config.presetName = manualPresetName(preset.id);
            if (els.paletteMode) els.paletteMode.value = "manual";
            if (els.generatedAssist) els.generatedAssist.value = config.generatedAssist;
            setOutputText("generatedAssist", byId(root, "generatedAssistValue"), config.generatedAssist);
            if (els.presetName && preset) els.presetName.value = config.presetName;
            config.manualMatchAliases = [];
            renderManualSwatches();
            markPaletteDirty();
            updateConditionalPanels();
            const saved = preset ? ` Saved “${preset.name}” as a manual preset.` : "";
            const action = strategy === "append"
                ? `Appended ${result.count} color${result.count === 1 ? "" : "s"}`
                : (strategy === "fillUnlocked" ? `Filled ${result.count} manual slot${result.count === 1 ? "" : "s"}` : `Captured ${result.count} color${result.count === 1 ? "" : "s"}`);
            setStatus(`${action} from ${source}.${saved}`);
            queueRender();
        });
    }

    function closeCapturePaletteMenu() {
        if (els.capturePaletteMenu) els.capturePaletteMenu.open = false;
    }

    async function importLut(file) {
        if (!file) return;
        const before = cloneConfigSnapshot();
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const canvas = root.createElement("canvas");
            canvas.width = img.width;
            canvas.height = 1;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, img.width, 1);
            const data = ctx.getImageData(0, 0, img.width, 1).data;
            const colors = [];
            const target = Math.min(42, img.width);
            for (let i = 0; i < target; i++) {
                const src = Math.round((i / Math.max(1, target - 1)) * (img.width - 1)) * 4;
                colors.push(byteRgbToHex(data[src], data[src + 1], data[src + 2]));
            }
            config.paletteMode = "manual";
            els.paletteMode.value = "manual";
            config.manualPalette = manualSwatchesFromColors(colors, "lut");
            config.manualMatchAliases = [];
            renderManualSwatches();
            markPaletteDirty();
            updateConditionalPanels();
            queueRender();
            pushHistorySnapshot(before, "Import LUT");
            URL.revokeObjectURL(url);
        };
        img.onerror = () => URL.revokeObjectURL(url);
        img.src = url;
    }

    function addManualSwatch() {
        const swatches = syncManualSwatches();
        if (swatches.length >= 42) return;
        withHistory("Add manual swatch", () => {
            const current = syncManualSwatches();
            const last = current[current.length - 1]?.hex || "#eeeeee";
            current.push(createManualSwatch(last, null, "added"));
            config.manualPalette = current;
            renderManualSwatches();
            markPaletteDirty();
            queueRender();
        });
    }

    function addPixelSourceToManualPalette() {
        const pixel = state.diagnostics?.pixel;
        const sourceHex = normalizeHexColor(pixel?.sourceHex, "");
        if (!sourceHex) {
            setStatus("Inspect a pixel first.");
            return;
        }
        if (syncManualSwatches().length >= MAX_PALETTE_SIZE) {
            setStatus("Manual palette is already full.");
            return;
        }

        withHistory("Add source color to manual palette", () => {
            const current = syncManualSwatches();
            if (current.length >= MAX_PALETTE_SIZE) {
                setStatus("Manual palette is already full.");
                return;
            }
            current.push(createManualSwatch(sourceHex, null, "pixel-source", false, pixel.sourceLab));
            config.manualPalette = current;
            config.paletteMode = "manual";
            if (config.generatedAssist !== 0) config.generatedAssist = 0;
            if (els.paletteMode) els.paletteMode.value = "manual";
            if (els.generatedAssist) els.generatedAssist.value = config.generatedAssist;
            setOutputText("generatedAssist", byId(root, "generatedAssistValue"), config.generatedAssist);
            config.manualMatchAliases = [];
            renderManualSwatches();
            markPaletteDirty();
            updateConditionalPanels();
            queueRender();
            setStatus(`Added ${sourceHex} from the inspected pixel to the manual palette.`);
        });
    }


    async function copyCurrentPaletteHexStrings() {
        const colors = colorsFromVisiblePalette();
        if (!colors.length) {
            setStatus("No palette colors to copy.");
            return;
        }
        const text = colors.join("\n");
        const clipboard = window?.navigator?.clipboard || globalThis.navigator?.clipboard;
        try {
            if (!clipboard?.writeText) throw new Error("Clipboard unavailable");
            await clipboard.writeText(text);
            setStatus(`Copied ${colors.length} hex color${colors.length === 1 ? "" : "s"}.`);
        } catch {
            setStatus(text);
        }
    }

    function openManualPaletteTextDialog() {
        const dialog = els.manualPaletteTextDialog || byId(root, "manualPaletteTextDialog");
        const input = els.manualPaletteTextInput || byId(root, "manualPaletteTextInput");
        if (!dialog || !input) return;
        input.value = "";
        if (typeof dialog.showModal === "function") dialog.showModal();
        else {
            dialog.hidden = false;
            dialog.setAttribute?.("open", "");
        }
        input.focus?.();
    }

    function closeManualPaletteTextDialog() {
        const dialog = els.manualPaletteTextDialog || byId(root, "manualPaletteTextDialog");
        if (!dialog) return;
        if (typeof dialog.close === "function" && dialog.open) dialog.close();
        else {
            dialog.hidden = true;
            dialog.removeAttribute?.("open");
        }
    }

    function importManualPaletteText() {
        const input = els.manualPaletteTextInput || byId(root, "manualPaletteTextInput");
        const colors = extractPaletteColorsFromText(input?.value || "");
        if (!colors.length) {
            setStatus("No CSS colors found in that text.");
            return;
        }

        withHistory("Import text palette", () => {
            config.paletteMode = "manual";
            if (config.generatedAssist !== 0) config.generatedAssist = 0;
            if (els.paletteMode) els.paletteMode.value = "manual";
            if (els.generatedAssist) els.generatedAssist.value = config.generatedAssist;
            setOutputText("generatedAssist", byId(root, "generatedAssistValue"), config.generatedAssist);
            config.manualPalette = manualSwatchesFromColors(colors, "text-import");
            config.manualMatchAliases = [];
            renderManualSwatches();
            markPaletteDirty();
            updateConditionalPanels();
            queueRender();
            closeManualPaletteTextDialog();
            setStatus(`Imported ${colors.length} color${colors.length === 1 ? "" : "s"} from text.`);
        });
    }

    return {
        loadStoredManualPresets,
        saveStoredManualPresets,
        addManualPreset,
        populatePresetSelect,
        loadPresetAsManual,
        switchPalettePreset,
        visiblePaletteHasColors,
        capturePaletteAvailable,
        updateCapturePaletteUi,
        captureSourceLabel,
        captureSeedForMode,
        capturedPaletteEntriesFromVisiblePalette,
        colorsFromVisiblePalette,
        defaultManualPresetName,
        applyCapturedColorsToManual,
        captureCurrentPaletteToManual,
        closeCapturePaletteMenu,
        importLut,
        addManualSwatch,
        addPixelSourceToManualPalette,
        copyCurrentPaletteHexStrings,
        openManualPaletteTextDialog,
        closeManualPaletteTextDialog,
        importManualPaletteText
    };
}
