#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform float u_threshold;
uniform float u_strength;
uniform float u_knee;

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

float softLightBlend(float base, float fx) {
    float safeBase = clamp(base, 0.0, 1.0);
    float safeFx = clamp(fx, 0.0, 1.0);
    float blended = mix(
        2.0 * safeBase * safeFx + safeBase * safeBase * (1.0 - 2.0 * safeFx),
        sqrt(max(safeBase, 0.0)) * (2.0 * safeFx - 1.0) + 2.0 * safeBase * (1.0 - safeFx),
        step(0.5, safeFx)
    );
    return clamp(blended, 0.0, 1.0);
}


float kernelWeight1D(int offset, int radius) {
    float x = float(abs(offset));

    // Treat radius <= 0 as a delta kernel.
    float r0 = max(float(radius), 0.0);
    float rz = 1.0 - step(0.5, r0); // 1 when radius == 0-ish
    float r  = max(r0, 1.0);

    float w = exp(-(x * x) / r);

    // Hard cap outside [-radius, radius], branchlessly.
    float inside = 1.0 - step(r0 + 0.5, x);
    w *= inside;

    // Approximate infinite-Gaussian normalization.
    // sigma^2 = r / 2
    // sqrt(2*pi*sigma^2) = sqrt(pi*r)
    w *= inversesqrt(3.141592653589793 * r);

    // radius == 0 -> only offset 0 has weight 1.
    float delta = 1.0 - step(0.5, x);

    return mix(w, delta, rz);
}

float oklabLightness(vec3 srgb) {
    return clamp(linearRgbToOklab(srgb2linear(clamp(srgb, 0.0, 1.0))).x, 0.0, 1.0);
}

float blurredLightness(vec2 uv) {
    vec2 texel = 1.0 / max(u_resolution, vec2(1.0));
    float accum = 0.0;
    float weightSum = 0.0;

    for (int y = -5; y <= 5; ++y) {
        for (int x = -5; x <= 5; ++x) {
            float weight = kernelWeight1D(x, 5) * kernelWeight1D(y, 5);
            vec2 sampleUv = clamp(uv + vec2(float(x), float(y)) * texel, vec2(0.0), vec2(1.0));
            accum += oklabLightness(texture(u_image, sampleUv).rgb) * weight;
            weightSum += weight;
        }
    }

    return weightSum > 0.0 ? accum / weightSum : oklabLightness(texture(u_image, uv).rgb);
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec4 pix = texture(u_image, clamp(uv, vec2(0.0), vec2(1.0)));
    float baseL = oklabLightness(pix.rgb);
    float localL = blurredLightness(uv);

    float lumaDiff = baseL - localL;
    float threshold = max(u_threshold, 0.0);
    float knee = max(u_knee, 0.0001);
    float thresh = smoothstep(threshold - knee, threshold + knee, abs(lumaDiff));
    float shaped = sign(lumaDiff) * thresh * tanh(abs(lumaDiff));
    float lumaSharp = clamp(baseL + max(u_strength, 0.0) * shaped, 0.0, 1.0);
    float sharpL = softLightBlend(baseL, lumaSharp);

    outColor = vec4(vec3(sharpL), pix.a);
}
