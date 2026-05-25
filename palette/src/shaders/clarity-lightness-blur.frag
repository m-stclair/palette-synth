#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform float u_kernelWeights[13];

out vec4 outColor;

vec3 srgb2linear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

vec3 linearRgbToOklab(vec3 rgb) {
    float l = 0.4122214708 * rgb.r + 0.5363325363 * rgb.g + 0.0514459929 * rgb.b;
    float m = 0.2119034982 * rgb.r + 0.6806995451 * rgb.g + 0.1073969566 * rgb.b;
    float s = 0.0883024619 * rgb.r + 0.2817188376 * rgb.g + 0.6299787005 * rgb.b;

    float l_ = pow(max(l, 0.0), 1.0 / 3.0);
    float m_ = pow(max(m, 0.0), 1.0 / 3.0);
    float s_ = pow(max(s, 0.0), 1.0 / 3.0);

    return vec3(
        0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    );
}

float oklabLightness(vec3 srgb) {
    return clamp(linearRgbToOklab(srgb2linear(clamp(srgb, 0.0, 1.0))).x, 0.0, 1.0);
}

float horizontalBlurredLightness(vec2 uv) {
    vec2 texel = 1.0 / max(u_resolution, vec2(1.0));
    float accum = 0.0;

    for (int x = -6; x <= 6; ++x) {
        vec2 sampleUv = clamp(uv + vec2(float(x), 0.0) * texel, vec2(0.0), vec2(1.0));
        accum += oklabLightness(texture(u_image, sampleUv).rgb) * u_kernelWeights[x + 6];
    }

    return accum;
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float lightness = clamp(horizontalBlurredLightness(uv), 0.0, 1.0);
    outColor = vec4(vec3(lightness), 1.0);
}
