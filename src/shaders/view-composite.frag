#version 300 es
precision highp float;

// Final viewport blit used for post-processing and before/after compare.
// Samples the paletted image (at source-image resolution) with the usual
// zoom/pan transform. When compare is enabled, the "before" half samples the
// level-adjusted source texture (u_source) for true side-by-side compares.

uniform sampler2D u_image;   // post-processed image, source resolution
uniform sampler2D u_source;  // level-adjusted source, source resolution
uniform vec2 u_resolution;
uniform vec2 u_viewportOrigin;
uniform vec2 u_viewCenter;
uniform vec2 u_viewSpan;
uniform float u_compareSplit;
uniform int u_compareEnabled;

out vec4 outColor;

void main() {
    vec2 localFragCoord = gl_FragCoord.xy - u_viewportOrigin;
    vec2 screenUv = vec2(localFragCoord.x / u_resolution.x, 1.0 - (localFragCoord.y / u_resolution.y));
    vec2 uv = clamp(u_viewCenter + (screenUv - 0.5) * u_viewSpan, vec2(0.0), vec2(1.0));

    vec2 processedUv = vec2(uv.x, 1.0 - uv.y);
    vec3 processed = texture(u_image, processedUv).rgb;
    vec3 source = texture(u_source, uv).rgb;

    if (u_compareEnabled == 1 && u_compareSplit >= 0.0) {
        float lineWidth = max(1.5 / max(u_resolution.x, 1.0), 0.0015);
        float distToSplit = abs(screenUv.x - u_compareSplit);

        if (distToSplit <= lineWidth) {
            float core = step(distToSplit, lineWidth * 0.45);
            vec3 lineColor = mix(vec3(0.02), vec3(1.0), core);
            outColor = vec4(lineColor, 1.0);
            return;
        }

        if (screenUv.x < u_compareSplit) {
            outColor = vec4(source, 1.0);
            return;
        }
    }

    outColor = vec4(processed, 1.0);
}
