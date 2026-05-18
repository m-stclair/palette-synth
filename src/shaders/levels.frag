#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform float u_levelsExposure;
uniform float u_levelsGamma;
uniform float u_levelsShoulder;
uniform float u_levelsCenter;
uniform float u_levelsCurveAmount;

out vec4 outColor;

const float OKLAB_SCALE = 100.0;

vec3 srgb2linear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

vec3 linear2srgb(vec3 c) {
    vec3 lo = c * 12.92;
    vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    return mix(lo, hi, step(0.0031308, c));
}

vec3 rgb2lab(vec3 rgb) {
    float l = 0.4122214708 * rgb.r + 0.5363325363 * rgb.g + 0.0514459929 * rgb.b;
    float m = 0.2119034982 * rgb.r + 0.6806995451 * rgb.g + 0.1073969566 * rgb.b;
    float s = 0.0883024619 * rgb.r + 0.2817188376 * rgb.g + 0.6299787005 * rgb.b;

    float l_ = pow(max(l, 0.0), 1.0 / 3.0);
    float m_ = pow(max(m, 0.0), 1.0 / 3.0);
    float s_ = pow(max(s, 0.0), 1.0 / 3.0);

    float L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
    float a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
    float b = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

    return OKLAB_SCALE * vec3(L, a, b);
}

vec3 lab2rgb(vec3 lab) {
    vec3 oklab = lab / OKLAB_SCALE;

    float l_ = oklab.x + 0.3963377774 * oklab.y + 0.2158037573 * oklab.z;
    float m_ = oklab.x - 0.1055613458 * oklab.y - 0.0638541728 * oklab.z;
    float s_ = oklab.x - 0.0894841775 * oklab.y - 1.2914855480 * oklab.z;

    float l = l_ * l_ * l_;
    float m = m_ * m_ * m_;
    float s = s_ * s_ * s_;

    float r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    float g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    float b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

    return clamp(vec3(r, g, b), 0.0, 1.0);
}

float applyLevelsGamma(float x, float gammaValue) {
    return pow(max(x, 0.0), 1.0 / max(gammaValue, 1e-4));
}

float applyLevelsExposure(float x, float exposureValue) {
    return x * exp2(exposureValue);
}

float applyLevelsCurve(float x, float shoulder, float center) {
    float logX = log2(max(x, 1e-6));
    return 1.0 / (1.0 + exp(-shoulder * (logX - center)));
}

vec3 applyLevelsToSrgb(vec3 srgb) {
    vec3 lab = rgb2lab(srgb2linear(srgb));
    float lightness = clamp(lab.x / OKLAB_SCALE, 0.0, 1.0);
    lightness = applyLevelsGamma(applyLevelsExposure(lightness, u_levelsExposure), u_levelsGamma);
    lightness = mix(lightness, applyLevelsCurve(lightness, u_levelsShoulder, u_levelsCenter), clamp(u_levelsCurveAmount, 0.0, 1.0));
    lab.x = clamp(lightness, 0.0, 1.0) * OKLAB_SCALE;
    return clamp(linear2srgb(lab2rgb(lab)), 0.0, 1.0);
}

void main() {
    vec2 uv = vec2(gl_FragCoord.x / u_resolution.x, 1.0 - (gl_FragCoord.y / u_resolution.y));
    vec4 pix = texture(u_image, clamp(uv, vec2(0.0), vec2(1.0)));
    outColor = vec4(applyLevelsToSrgb(pix.rgb), pix.a);
}
