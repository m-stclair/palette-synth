const SHADER_URLS = {
  FRAGMENT_SHADER_BODY: new URL("./palette.frag", import.meta.url),
  VERTEX_SHADER: new URL("./fullscreen.vert", import.meta.url),
  LEVELS_FRAGMENT_SHADER: new URL("./levels.frag", import.meta.url),
  CLARITY_LIGHTNESS_BLUR_FRAGMENT_SHADER: new URL("./clarity-lightness-blur.frag", import.meta.url),
  CLARITY_SHARP_FRAGMENT_SHADER: new URL("./clarity-sharp-pass.frag", import.meta.url),
  CLARITY_SHARP_BLUR_FRAGMENT_SHADER: new URL("./clarity-sharp-blur.frag", import.meta.url),
  CLARITY_FRAGMENT_SHADER: new URL("./clarity.frag", import.meta.url),
  BLOCK_SAMPLE_FRAGMENT_SHADER: new URL("./block-sample.frag", import.meta.url),
  PALETTE_POST_FRAGMENT_SHADER: new URL("./palette-post.frag", import.meta.url),
  VIEW_COMPOSITE_FRAGMENT_SHADER: new URL("./view-composite.frag", import.meta.url)
};

async function fetchText(label, url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label} shader failed to load (${response.status})`);
  return response.text();
}

export async function loadShaders() {
  const [
    FRAGMENT_SHADER_BODY,
    VERTEX_SHADER,
    LEVELS_FRAGMENT_SHADER,
    CLARITY_LIGHTNESS_BLUR_FRAGMENT_SHADER,
    CLARITY_SHARP_FRAGMENT_SHADER,
    CLARITY_SHARP_BLUR_FRAGMENT_SHADER,
    CLARITY_FRAGMENT_SHADER,
    BLOCK_SAMPLE_FRAGMENT_SHADER,
    PALETTE_POST_FRAGMENT_SHADER,
    VIEW_COMPOSITE_FRAGMENT_SHADER
  ] = await Promise.all([
    fetchText("Palette fragment", SHADER_URLS.FRAGMENT_SHADER_BODY),
    fetchText("Fullscreen vertex", SHADER_URLS.VERTEX_SHADER),
    fetchText("Levels fragment", SHADER_URLS.LEVELS_FRAGMENT_SHADER),
    fetchText("Clarity lightness blur fragment", SHADER_URLS.CLARITY_LIGHTNESS_BLUR_FRAGMENT_SHADER),
    fetchText("Clarity sharp fragment", SHADER_URLS.CLARITY_SHARP_FRAGMENT_SHADER),
    fetchText("Clarity sharp blur fragment", SHADER_URLS.CLARITY_SHARP_BLUR_FRAGMENT_SHADER),
    fetchText("Clarity fragment", SHADER_URLS.CLARITY_FRAGMENT_SHADER),
    fetchText("Block sample fragment", SHADER_URLS.BLOCK_SAMPLE_FRAGMENT_SHADER),
    fetchText("Palette post-process fragment", SHADER_URLS.PALETTE_POST_FRAGMENT_SHADER),
    fetchText("View composite fragment", SHADER_URLS.VIEW_COMPOSITE_FRAGMENT_SHADER)
  ]);
  return {
    FRAGMENT_SHADER_BODY,
    VERTEX_SHADER,
    LEVELS_FRAGMENT_SHADER,
    CLARITY_LIGHTNESS_BLUR_FRAGMENT_SHADER,
    CLARITY_SHARP_FRAGMENT_SHADER,
    CLARITY_SHARP_BLUR_FRAGMENT_SHADER,
    CLARITY_FRAGMENT_SHADER,
    BLOCK_SAMPLE_FRAGMENT_SHADER,
    PALETTE_POST_FRAGMENT_SHADER,
    VIEW_COMPOSITE_FRAGMENT_SHADER
  };
}
