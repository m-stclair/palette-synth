  import { hexToByteRgb, normalizeHexColor } from "./color-utils.js";

function hexToRgbObject(hex) {
  const [r, g, b] = hexToByteRgb(hex);
  return {r, g, b};
}

export function formatPaletteExport(format, hexes) {
  const safeHexes = hexes.map(hex => normalizeHexColor(hex));
  const upperNoHash = safeHexes.map(hex => hex.slice(1).toUpperCase());
  const cssName = index => `palette-${String(index + 1).padStart(2, "0")}`;
  const jsStrings = safeHexes.map(hex => `  "${hex}"`).join(",\n");

  switch (format) {
    case "hex":
      return {
        extension: "hex",
        mime: "text/plain;charset=utf-8",
        body: upperNoHash.join("\n") + "\n"
      };
    case "txt":
      return {
        extension: "txt",
        mime: "text/plain;charset=utf-8",
        body: safeHexes.join("\n") + "\n"
      };
    case "json":
      return {
        extension: "json",
        mime: "application/json;charset=utf-8",
        body: JSON.stringify(safeHexes, null, 2) + "\n"
      };
    case "jsArray":
      return {
        extension: "js",
        mime: "text/javascript;charset=utf-8",
        body: `const palette = [\n${jsStrings}\n];\n`
      };
    case "css":
      return {
        extension: "css",
        mime: "text/css;charset=utf-8",
        body: `:root {\n${safeHexes.map((hex, i) => `  --${cssName(i)}: ${hex};`).join("\n")}\n}\n`
      };
    case "scss":
      return {
        extension: "scss",
        mime: "text/x-scss;charset=utf-8",
        body: `${safeHexes.map((hex, i) => `$${cssName(i)}: ${hex};`).join("\n")}\n\n$palette: (${safeHexes.join(", ")});\n`
      };
    case "csv":
      return {
        extension: "csv",
        mime: "text/csv;charset=utf-8",
        body: "index,hex,r,g,b\n" + safeHexes.map((hex, i) => {
          const {r, g, b} = hexToRgbObject(hex);
          return `${i + 1},${hex},${r},${g},${b}`;
        }).join("\n") + "\n"
      };
    case "gpl":
      return {
        extension: "gpl",
        mime: "text/plain;charset=utf-8",
        body: `GIMP Palette\nName: Palette Synth\nColumns: ${Math.min(safeHexes.length, 16)}\n#\n` + safeHexes.map((hex, i) => {
          const {r, g, b} = hexToRgbObject(hex);
          return `${String(r).padStart(3, " ")} ${String(g).padStart(3, " ")} ${String(b).padStart(3, " ")}\tColor ${String(i + 1).padStart(2, "0")}`;
        }).join("\n") + "\n"
      };
    default:
      return null;
  }
}
