#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform sampler2D u_sharpPass;
uniform sampler2D u_sharpBlur;
uniform vec2 u_resolution;
uniform float u_intensity;
uniform float u_preserveTones;
uniform float u_kernelWeights[7];

out vec4 outColor;

vec3 srgb2linear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

vec3 linear2srgb(vec3 c) {
    vec3 lo = c * 12.92;
    vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    return mix(lo, hi, step(0.0031308, c));
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

vec3 oklabToLinearRgb(vec3 lab) {
    float l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
    float m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
    float s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;

    float l = l_ * l_ * l_;
    float m = m_ * m_ * m_;
    float s = s_ * s_ * s_;

    return vec3(
        +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
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

float verticallyBlurredSharpLightness(vec2 uv) {
    vec2 texel = 1.0 / max(u_resolution, vec2(1.0));
    float accum = 0.0;

    for (int y = -3; y <= 3; ++y) {
        vec2 sampleUv = clamp(uv + vec2(0.0, float(y)) * texel, vec2(0.0), vec2(1.0));
        accum += texture(u_sharpBlur, sampleUv).r * u_kernelWeights[y + 3];
    }

    return accum;
}

float tonePreserveMask(float luma, float preserve) {
    float shadowGate = smoothstep(0.08, 0.45, luma);
    float highlightGate = 1.0 - smoothstep(0.55, 0.88, luma);
    float midtoneMask = shadowGate * highlightGate;
    return mix(1.0, midtoneMask, clamp(preserve, 0.0, 1.0));
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec4 base = texture(u_image, clamp(uv, vec2(0.0), vec2(1.0)));
    vec3 lab = linearRgbToOklab(srgb2linear(clamp(base.rgb, 0.0, 1.0)));
    float baseL = clamp(lab.x, 0.0, 1.0);
    float sharpL = texture(u_sharpPass, clamp(uv, vec2(0.0), vec2(1.0))).r;
    float localSharpL = clamp(verticallyBlurredSharpLightness(uv), 0.0, 1.0);
    float clarityL = softLightBlend(sharpL, localSharpL);

    lab.x = clamp(clarityL, 0.0, 1.0);
    vec3 clarityRgb = clamp(linear2srgb(oklabToLinearRgb(lab)), 0.0, 1.0);
    float preserveMask = tonePreserveMask(baseL, u_preserveTones);
    float amount = clamp(u_intensity, 0.0, 1.0) * preserveMask;

    outColor = vec4(mix(base.rgb, clarityRgb, amount), base.a);
}
