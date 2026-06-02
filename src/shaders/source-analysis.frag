#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_image;
uniform ivec2 u_sourceSize;

out vec4 outColor;

const float OKLAB_SCALE = 100.0;
const float EDGE_ENERGY_NORMALIZER = 360.0;
const float VARIANCE_NORMALIZER = 32.0;

vec3 srgb2linear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
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

ivec2 clampSourcePixel(ivec2 pixel) {
    return clamp(pixel, ivec2(0), max(u_sourceSize - ivec2(1), ivec2(0)));
}

vec3 sampleSourceLab(ivec2 pixel) {
    vec3 srgb = texelFetch(u_image, clampSourcePixel(pixel), 0).rgb;
    return rgb2lab(srgb2linear(srgb));
}

void main() {
    ivec2 center = clampSourcePixel(ivec2(gl_FragCoord.xy));

    vec3 lab00 = sampleSourceLab(center + ivec2(-1, -1));
    vec3 lab10 = sampleSourceLab(center + ivec2( 0, -1));
    vec3 lab20 = sampleSourceLab(center + ivec2( 1, -1));
    vec3 lab01 = sampleSourceLab(center + ivec2(-1,  0));
    vec3 lab11 = sampleSourceLab(center);
    vec3 lab21 = sampleSourceLab(center + ivec2( 1,  0));
    vec3 lab02 = sampleSourceLab(center + ivec2(-1,  1));
    vec3 lab12 = sampleSourceLab(center + ivec2( 0,  1));
    vec3 lab22 = sampleSourceLab(center + ivec2( 1,  1));

    vec3 gx = -lab00 + lab20 - 2.0 * lab01 + 2.0 * lab21 - lab02 + lab22;
    vec3 gy = -lab00 - 2.0 * lab10 - lab20 + lab02 + 2.0 * lab12 + lab22;

    float edgeRaw = sqrt(dot(gx, gx) + dot(gy, gy));
    float edgeEnergy = clamp(edgeRaw / EDGE_ENERGY_NORMALIZER, 0.0, 1.0);

    float Jxx = dot(gx, gx);
    float Jyy = dot(gy, gy);
    float Jxy = dot(gx, gy);
    float trace = Jxx + Jyy;
    float anisotropy = trace > 1e-5
        ? sqrt((Jxx - Jyy) * (Jxx - Jyy) + 4.0 * Jxy * Jxy) / trace
        : 0.0;
    anisotropy = clamp(anisotropy, 0.0, 1.0);

    vec3 meanLab = (lab00 + lab10 + lab20 + lab01 + lab11 + lab21 + lab02 + lab12 + lab22) / 9.0;
    float varianceRaw = (
        dot(lab00 - meanLab, lab00 - meanLab) +
        dot(lab10 - meanLab, lab10 - meanLab) +
        dot(lab20 - meanLab, lab20 - meanLab) +
        dot(lab01 - meanLab, lab01 - meanLab) +
        dot(lab11 - meanLab, lab11 - meanLab) +
        dot(lab21 - meanLab, lab21 - meanLab) +
        dot(lab02 - meanLab, lab02 - meanLab) +
        dot(lab12 - meanLab, lab12 - meanLab) +
        dot(lab22 - meanLab, lab22 - meanLab)
    ) / 9.0;
    float varianceEnergy = clamp(sqrt(max(varianceRaw, 0.0)) / VARIANCE_NORMALIZER, 0.0, 1.0);
    float textureEnergy = clamp(max(edgeEnergy * (1.0 - anisotropy), varianceEnergy * (1.0 - anisotropy * 0.5)), 0.0, 1.0);

    // R: edge energy, G: isotropic texture/noise energy, B: edge coherence, A: local variance.
    outColor = vec4(edgeEnergy, textureEnergy, anisotropy, varianceEnergy);
}
