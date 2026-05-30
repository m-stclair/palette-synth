#version 300 es
precision highp float;

uniform sampler2D u_image;
uniform sampler2D u_mask;
uniform int u_maskEnabled;
uniform int u_maskBehavior;
uniform vec2 u_resolution;
uniform vec2 u_viewportOrigin;
uniform vec2 u_viewCenter;
uniform vec2 u_viewSpan;

#define MAX_PALETTE_SIZE 64
#define MASK_BEHAVIOR_CYCLE_WITHIN 1
#define MASK_BEHAVIOR_FORBID_COLORS 2

uniform vec4 paletteFeatures[MAX_PALETTE_SIZE];

uniform vec4 paletteColors[MAX_PALETTE_SIZE];
uniform vec4 paletteBaseColors[MAX_PALETTE_SIZE];

uniform int paletteSourceIndices[MAX_PALETTE_SIZE];
uniform int u_maskForbiddenSourceFlags[MAX_PALETTE_SIZE];

uniform int u_paletteSize;
uniform int u_visiblePaletteSize;
uniform int u_cycleOffset;
uniform int u_manualCycleEnabled;
uniform int u_blendK;
uniform float u_softness;
uniform float u_lumaWeight;
uniform float u_chromaWeight;
uniform float u_hueWeight;
uniform float u_blendAmount;
uniform int u_maxDistanceEnabled;
uniform float u_maxDistance;
uniform float u_shadowCutoff;
uniform float u_highlightCutoff;
uniform float u_ditherAngle;
uniform float u_ditherLumaAmount;
uniform float u_ditherScale;
uniform int u_diagnosticOverlayMode;
uniform int u_diagnosticOverlaySwatch;
uniform float u_compareSplit;
uniform int u_compareEnabled;
uniform int u_pixelArtEnabled;
uniform float u_pixelBlockSize;
uniform vec2 u_sourceImageSize;
uniform int u_blockSampledInput;


out vec4 outColor;


const float OKLAB_SCALE = 100.0;
const float NEUTRAL_CHROMA_EPSILON = 2.0;
const float CLEAR_HUE_CHROMA = 6.0;
const float ENDPOINT_NEUTRAL_CHROMA_EPSILON = 8.0;
const float ENDPOINT_CLEAR_HUE_CHROMA = 14.0;
const float HUE_LIGHTNESS_HEADROOM_LOW = 8.0;
const float HUE_LIGHTNESS_HEADROOM_HIGH = 24.0;
const float HUE_DISTANCE_SCALE = 10.0;
const float NEUTRAL_CATEGORY_HUE_SEPARATION = 1.41421356237;

// OKLab is stored in the legacy palette slots as [L*100, a*100, b*100].
// That keeps existing lightness sliders, thresholds, and palette records on a 0–100-ish scale.
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

vec3 srgb2linear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

vec3 linear2srgb(vec3 c) {
    vec3 lo = c * 12.92;
    vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    return mix(lo, hi, step(0.0031308, c));
}

vec3 blendWithColorSpace(vec3 baseRGB, vec3 fxRGB, float blendAmount) {
    return clamp(mix(baseRGB, fxRGB, blendAmount), 0.0, 1.0);
}



#define ASSIGN_NEAREST 0
#define ASSIGN_BLEND 1
#define ASSIGN_DITHER 2

#define OUTPUT_FULL_REPLACE 0
#define OUTPUT_PRESERVE_LUMA 1
#define OUTPUT_PRESERVE_CHROMA 2
#define OUTPUT_HUE_WASH 3
#define OUTPUT_SHADOW_HIGHLIGHT 4

#define CYCLE_GLOBAL 0
#define CYCLE_AXIS_THIRDS 1
#define CYCLE_AXIS_MIDDLE 2
#define CYCLE_AXIS_HIGH 3
#define CYCLE_AXIS_LOW 4

#ifndef CYCLE_MODE
#define CYCLE_MODE CYCLE_GLOBAL
#endif

#ifndef OUTPUT_MODE
#define OUTPUT_MODE OUTPUT_FULL_REPLACE
#endif

#define DITHER_ORDERED_2 0
#define DITHER_ORDERED_4 1
#define DITHER_ORDERED_8 2
#define DITHER_HASH       3
#define DITHER_LINES      4
#define DITHER_HALFTONE   5
#define DITHER_CROSSHATCH 6
#define DITHER_STIPPLE    7
#define DITHER_WEAVE      8
#define DITHER_CONTOUR    9

#ifndef DITHER_PATTERN
#define DITHER_PATTERN DITHER_ORDERED_4
#endif

#ifndef NEUTRAL_IS_CATEGORY
#define NEUTRAL_IS_CATEGORY 0
#endif

#ifndef FIDELITY_GUARD
#define FIDELITY_GUARD 0
#endif

bool is_finite(float x) {
    return abs(x) < 1e20;
}

int positiveMod(int x, int m) {
    int r = x % m;
    return (r < 0) ? r + m : r;
}

float lightnessHeadroom(float L) {
    float safeL = clamp(L, 0.0, 100.0);
    return min(safeL, 100.0 - safeL);
}

float hueEndpointFactorForLightness(float L) {
    return 1.0 - smoothstep(
        HUE_LIGHTNESS_HEADROOM_LOW,
        HUE_LIGHTNESS_HEADROOM_HIGH,
        lightnessHeadroom(L)
    );
}

float neutralChromaEpsilonForLightness(float L) {
    return mix(NEUTRAL_CHROMA_EPSILON, ENDPOINT_NEUTRAL_CHROMA_EPSILON, hueEndpointFactorForLightness(L));
}

float clearHueChromaForLightness(float L) {
    return mix(CLEAR_HUE_CHROMA, ENDPOINT_CLEAR_HUE_CHROMA, hueEndpointFactorForLightness(L));
}

float hueReliabilityForLab(float L, float chroma) {
    return smoothstep(neutralChromaEpsilonForLightness(L), clearHueChromaForLightness(L), chroma);
}

bool labHasReliableHue(float L, float chroma) {
    return chroma >= neutralChromaEpsilonForLightness(L);
}

float hueGateForPair(float aL, float aC, float bL, float bC) {
    return min(hueReliabilityForLab(aL, aC), hueReliabilityForLab(bL, bC));
}

mat2 rot2(float degrees) {
    float a = radians(degrees);
    float s = sin(a);
    float c = cos(a);
    return mat2(c, -s, s, c);
}

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// Palette order (which may be luminance, hue clusters, tint/shade groups, etc.)
// is selected on the CPU. Non-global cycle modes treat array thirds
// as low/middle/high bands along that ordering axis.

int cyclePaletteIndex(int idx, int cycleOffset) {
    if (u_paletteSize <= 1) {
        return 0;
    }

#if (CYCLE_MODE != CYCLE_GLOBAL)
    int n = u_paletteSize;

    int lowEnd = n / 3;
    int highStart = (2 * n) / 3;

    #if CYCLE_MODE == CYCLE_AXIS_MIDDLE
        if (idx < lowEnd || idx >= highStart) {
            return idx;
        }
        int lo = lowEnd;
        int hi = highStart;
    #elif CYCLE_MODE == CYCLE_AXIS_HIGH
        if (idx < highStart) {
            return idx;
        }
        int lo = highStart;
        int hi = n;
    #elif CYCLE_MODE == CYCLE_AXIS_LOW
        if (idx >= lowEnd) {
            return idx;
        }
        int lo = 0;
        int hi = lowEnd;
    #else
        int lo = 0;
        int hi = n;

        if (idx < lowEnd) {
            // Low band
            lo = 0;
            hi = lowEnd;
        } else if (idx < highStart) {
            // Middle band
            lo = lowEnd;
            hi = highStart;
        } else {
            // High band
            lo = highStart;
            hi = n;
        }
    #endif

    int len = hi - lo;

    if (len <= 1) {
        return idx;
    }

    return lo + positiveMod((idx - lo) + cycleOffset, len);
#else
    return positiveMod(idx + cycleOffset, u_paletteSize);
#endif
}

int clampedSourceIndexForPaletteIndex(int paletteIndex) {
    if (paletteIndex < 0 || paletteIndex >= MAX_PALETTE_SIZE) {
        return 0;
    }
    return clamp(paletteSourceIndices[paletteIndex], 0, MAX_PALETTE_SIZE - 1);
}

bool paletteEntryAllowedByMask(int sourceIndex, bool maskActive) {
    if (!maskActive || u_maskBehavior != MASK_BEHAVIOR_FORBID_COLORS) {
        return true;
    }
    return u_maskForbiddenSourceFlags[clamp(sourceIndex, 0, MAX_PALETTE_SIZE - 1)] == 0;
}

bool assignmentCandidateAllowed(int inputIndex, int cycleOffset, bool maskActive) {
    if (!maskActive || u_maskBehavior != MASK_BEHAVIOR_FORBID_COLORS) {
        return true;
    }
    int outputIndex = cyclePaletteIndex(inputIndex, cycleOffset);
    int outputSourceIndex = clampedSourceIndexForPaletteIndex(outputIndex);
    return paletteEntryAllowedByMask(outputSourceIndex, maskActive);
}

vec3 paletteOutputColor(int inputIndex, int cycleOffset, bool cycleMuted) {
    int safeInputIndex = clamp(inputIndex, 0, MAX_PALETTE_SIZE - 1);
    if (u_manualCycleEnabled == 1 && cycleMuted) {
        return paletteBaseColors[safeInputIndex].rgb;
    }
    return paletteColors[cyclePaletteIndex(safeInputIndex, cycleOffset)].rgb;
}

float deltaE_bias_fast(float labL, float labC, vec2 labHue, vec4 q) {
    float L = q.x;
    float C = q.y;
    vec2 hue = q.zw;

    float dL = labL - L;
    float dC = labC - C;

    // In continuous mode, hue is undefined for neutral / near-neutral colors,
    // so either side being neutral suppresses hue pressure. In categorical
    // neutral mode, the achromatic axis is lifted off the hue plane: a neutral
    // matched against a colored point has a real, fixed hue/category distance.
    float hueBias = 0.0;
    bool labHasHue = labHasReliableHue(labL, labC);
    bool candidateHasHue = labHasReliableHue(L, C);
    if (labHasHue && candidateHasHue) {
        float theta = clamp(dot(labHue, hue), -1.0, 1.0);
        float hueGate = hueGateForPair(labL, labC, L, C);
        float hueSeparation = sqrt(max(0.0, 2.0 - 2.0 * theta));
        hueBias = HUE_DISTANCE_SCALE * hueGate * hueSeparation;
    }
#if NEUTRAL_IS_CATEGORY
    else if (labHasHue != candidateHasHue) {
        float hueGate = labHasHue ? hueReliabilityForLab(labL, labC) : hueReliabilityForLab(L, C);
        hueBias = HUE_DISTANCE_SCALE * hueGate * NEUTRAL_CATEGORY_HUE_SEPARATION;
    }
#endif

    return (
        u_lumaWeight   * abs(dL) +
        u_chromaWeight * abs(dC) +
        u_hueWeight    * abs(hueBias)
    );
}

bool maxDistanceRejects(float distance) {
    return u_maxDistanceEnabled == 1 && distance > u_maxDistance;
}

bool paletteEntryMatchesDiagnosticSwatch(int entryIndex, int selectedSwatch) {
    if (selectedSwatch < 0 || entryIndex < 0 || entryIndex >= MAX_PALETTE_SIZE) {
        return false;
    }
    return paletteSourceIndices[entryIndex] == selectedSwatch;
}

vec2 safeHueUnit(float L, vec2 ab, vec2 fallback) {
    float c = length(ab);
    return labHasReliableHue(L, c) ? ab / c : fallback;
}

float meaningfulChroma(float L, float chroma) {
    return labHasReliableHue(L, chroma) ? chroma : 0.0;
}

vec3 applyOutputMode(vec3 sourceLab, vec3 paletteLab) {
#if OUTPUT_MODE == OUTPUT_PRESERVE_LUMA
    return vec3(sourceLab.x, paletteLab.yz);
#elif OUTPUT_MODE == OUTPUT_PRESERVE_CHROMA
    float sourceChroma = meaningfulChroma(sourceLab.x, length(sourceLab.yz));
    vec2 sourceHue = safeHueUnit(sourceLab.x, sourceLab.yz, vec2(1.0, 0.0));
    vec2 paletteHue = safeHueUnit(paletteLab.x, paletteLab.yz, sourceHue);
    return vec3(paletteLab.x, paletteHue * sourceChroma);
#elif OUTPUT_MODE == OUTPUT_HUE_WASH
    float sourceChroma = meaningfulChroma(sourceLab.x, length(sourceLab.yz));
    float paletteChroma = length(paletteLab.yz);
#if NEUTRAL_IS_CATEGORY
    if (!labHasReliableHue(paletteLab.x, paletteChroma)) {
        return vec3(sourceLab.x, vec2(0.0));
    }
#endif
    vec2 sourceHue = safeHueUnit(sourceLab.x, sourceLab.yz, vec2(1.0, 0.0));
    vec2 paletteHue = safeHueUnit(paletteLab.x, paletteLab.yz, sourceHue);
    return vec3(sourceLab.x, paletteHue * sourceChroma);
#elif OUTPUT_MODE == OUTPUT_SHADOW_HIGHLIGHT
    float lo = min(u_shadowCutoff, u_highlightCutoff);
    float hi = max(u_shadowCutoff, u_highlightCutoff);
    float inBand = max(step(sourceLab.x, lo), step(hi, sourceLab.x));
    return mix(sourceLab, paletteLab, inBand);
#else
    return paletteLab;
#endif
}

float assignmentDistanceBetweenLabs(vec3 sourceLab, vec3 candidateLab) {
    float sourceC = length(sourceLab.yz);
    vec2 sourceHue = (sourceC > 1e-6) ? sourceLab.yz / sourceC : vec2(1.0, 0.0);
    float candidateC = length(candidateLab.yz);
    vec2 candidateHue = (candidateC > 1e-6) ? candidateLab.yz / candidateC : vec2(1.0, 0.0);
    return deltaE_bias_fast(
        sourceLab.x,
        sourceC,
        sourceHue,
        vec4(candidateLab.x, candidateC, candidateHue)
    );
}

#if FIDELITY_GUARD
const float FIDELITY_GUARD_EPSILON = 1e-4;

float guardedOutputDistance(vec3 sourceLab, vec3 candidateLab) {
    return assignmentDistanceBetweenLabs(sourceLab, applyOutputMode(sourceLab, candidateLab));
}

bool monotoneOutputGuardRejects(vec3 sourceLab, vec3 candidateOutputLab, vec3 nearestOutputLab) {
    return assignmentDistanceBetweenLabs(sourceLab, candidateOutputLab) > assignmentDistanceBetweenLabs(sourceLab, nearestOutputLab) + FIDELITY_GUARD_EPSILON;
}

bool monotoneGuardRejects(vec3 sourceLab, vec3 candidateLab, vec3 nearestLab) {
    return guardedOutputDistance(sourceLab, candidateLab) > guardedOutputDistance(sourceLab, nearestLab) + FIDELITY_GUARD_EPSILON;
}
#endif

#if ASSIGNMODE == ASSIGN_BLEND

    void insertTop5(
        float d,
        int idx,

        inout float d0,
        inout float d1,
        inout float d2,
        inout float d3,
        inout float d4,

        inout int i0,
        inout int i1,
        inout int i2,
        inout int i3,
        inout int i4
    ) {
        if (d >= d4) {
            return;
        }

        if (d < d0) {
            d4 = d3; i4 = i3;
            d3 = d2; i3 = i2;
            d2 = d1; i2 = i1;
            d1 = d0; i1 = i0;
            d0 = d;  i0 = idx;
        } else if (d < d1) {
            d4 = d3; i4 = i3;
            d3 = d2; i3 = i2;
            d2 = d1; i2 = i1;
            d1 = d;  i1 = idx;
        } else if (d < d2) {
            d4 = d3; i4 = i3;
            d3 = d2; i3 = i2;
            d2 = d;  i2 = idx;
        } else if (d < d3) {
            d4 = d3; i4 = i3;
            d3 = d;  i3 = idx;
        } else {
            d4 = d;  i4 = idx;
        }
    }

    vec3 softAssign(vec3 labColor, int cycleOffset, bool maskActive, bool cycleMuted) {
        if (u_paletteSize <= 0) {
            return labColor;
        }

        float labC = length(labColor.yz);
        vec2 labHue = (labC > 1e-6) ? labColor.yz / labC : vec2(1.0, 0.0);

        float d0 = 1e20;
        float d1 = 1e20;
        float d2 = 1e20;
        float d3 = 1e20;
        float d4 = 1e20;

        int i0 = 0;
        int i1 = 0;
        int i2 = 0;
        int i3 = 0;
        int i4 = 0;
        int acceptedCount = 0;

        for (int i = 0; i < MAX_PALETTE_SIZE; ++i) {
            if (i >= u_paletteSize) break;
            if (!assignmentCandidateAllowed(i, cycleOffset, maskActive)) continue;
            acceptedCount += 1;

            float d = deltaE_bias_fast(
                labColor.x,
                labC,
                labHue,
                paletteFeatures[i]
            );

            insertTop5(
                d,
                i,
                d0, d1, d2, d3, d4,
                i0, i1, i2, i3, i4
            );
        }

        if (acceptedCount <= 0 || maxDistanceRejects(d0)) {
            return labColor;
        }

        int k = min(min(max(u_blendK, 1), acceptedCount), 5);

        vec3 result = vec3(0.0);
        float totalWeight = 0.0;

        if (k >= 1) {
            float w = 1.0 / pow(d0 + 1e-5, u_softness);
            result += w * paletteOutputColor(i0, cycleOffset, cycleMuted);
            totalWeight += w;
        }

        if (k >= 2) {
            float w = 1.0 / pow(d1 + 1e-5, u_softness);
            result += w * paletteOutputColor(i1, cycleOffset, cycleMuted);
            totalWeight += w;
        }

        if (k >= 3) {
            float w = 1.0 / pow(d2 + 1e-5, u_softness);
            result += w * paletteOutputColor(i2, cycleOffset, cycleMuted);
            totalWeight += w;
        }

        if (k >= 4) {
            float w = 1.0 / pow(d3 + 1e-5, u_softness);
            result += w * paletteOutputColor(i3, cycleOffset, cycleMuted);
            totalWeight += w;
        }

        if (k >= 5) {
            float w = 1.0 / pow(d4 + 1e-5, u_softness);
            result += w * paletteOutputColor(i4, cycleOffset, cycleMuted);
            totalWeight += w;
        }

        vec3 mapped = result / max(totalWeight, 1e-5);
#if FIDELITY_GUARD
        vec3 nearest = paletteOutputColor(i0, cycleOffset, cycleMuted);
        if (monotoneGuardRejects(labColor, mapped, nearest)) {
            return nearest;
        }
#endif
        return mapped;
    }

    float selectedBlendWeight(vec3 labColor, int selectedSwatch) {
        if (u_paletteSize <= 0 || selectedSwatch < 0) {
            return 0.0;
        }

        float labC = length(labColor.yz);
        vec2 labHue = (labC > 1e-6) ? labColor.yz / labC : vec2(1.0, 0.0);

        float d0 = 1e20;
        float d1 = 1e20;
        float d2 = 1e20;
        float d3 = 1e20;
        float d4 = 1e20;

        int i0 = 0;
        int i1 = 0;
        int i2 = 0;
        int i3 = 0;
        int i4 = 0;

        for (int i = 0; i < MAX_PALETTE_SIZE; ++i) {
            if (i >= u_paletteSize) break;

            float d = deltaE_bias_fast(
                labColor.x,
                labC,
                labHue,
                paletteFeatures[i]
            );

            insertTop5(
                d,
                i,
                d0, d1, d2, d3, d4,
                i0, i1, i2, i3, i4
            );
        }

        if (maxDistanceRejects(d0)) {
            return 0.0;
        }

        int k = min(min(max(u_blendK, 1), u_paletteSize), 5);
        float totalWeight = 0.0;
        float selectedWeight = 0.0;
#if FIDELITY_GUARD
        vec3 mapped = vec3(0.0);
#endif

        if (k >= 1) {
            float w = 1.0 / pow(d0 + 1e-5, u_softness);
            totalWeight += w;
#if FIDELITY_GUARD
            mapped += w * paletteColors[i0].rgb;
#endif
            if (paletteEntryMatchesDiagnosticSwatch(i0, selectedSwatch)) selectedWeight += w;
        }

        if (k >= 2) {
            float w = 1.0 / pow(d1 + 1e-5, u_softness);
            totalWeight += w;
#if FIDELITY_GUARD
            mapped += w * paletteColors[i1].rgb;
#endif
            if (paletteEntryMatchesDiagnosticSwatch(i1, selectedSwatch)) selectedWeight += w;
        }

        if (k >= 3) {
            float w = 1.0 / pow(d2 + 1e-5, u_softness);
            totalWeight += w;
#if FIDELITY_GUARD
            mapped += w * paletteColors[i2].rgb;
#endif
            if (paletteEntryMatchesDiagnosticSwatch(i2, selectedSwatch)) selectedWeight += w;
        }

        if (k >= 4) {
            float w = 1.0 / pow(d3 + 1e-5, u_softness);
            totalWeight += w;
#if FIDELITY_GUARD
            mapped += w * paletteColors[i3].rgb;
#endif
            if (paletteEntryMatchesDiagnosticSwatch(i3, selectedSwatch)) selectedWeight += w;
        }

        if (k >= 5) {
            float w = 1.0 / pow(d4 + 1e-5, u_softness);
            totalWeight += w;
#if FIDELITY_GUARD
            mapped += w * paletteColors[i4].rgb;
#endif
            if (paletteEntryMatchesDiagnosticSwatch(i4, selectedSwatch)) selectedWeight += w;
        }

#if FIDELITY_GUARD
        mapped /= max(totalWeight, 1e-5);
        if (monotoneGuardRejects(labColor, mapped, paletteColors[i0].rgb)) {
            return paletteEntryMatchesDiagnosticSwatch(i0, selectedSwatch) ? 1.0 : 0.0;
        }
#endif
        return selectedWeight / max(totalWeight, 1e-5);
    }
#endif

#if ASSIGNMODE == ASSIGN_NEAREST
    vec3 matchNearest(vec3 lab, int cycleOffset, bool maskActive, bool cycleMuted) {
        if (u_paletteSize <= 0) {
            return lab;
        }

        float labC = length(lab.yz);
        vec2 labHue = (labC > 1e-6) ? lab.yz / labC : vec2(1.0, 0.0);

        float minDist = 1e20;
        int best_i = 0;
        int acceptedCount = 0;

        for (int i = 0; i < MAX_PALETTE_SIZE; ++i) {
            if (i >= u_paletteSize) break;
            if (!assignmentCandidateAllowed(i, cycleOffset, maskActive)) continue;
            acceptedCount += 1;

            float d = deltaE_bias_fast(
                lab.x,
                labC,
                labHue,
                paletteFeatures[i]
            );

            if (d < minDist) {
                minDist = d;
                best_i = i;
            }
        }

        if (acceptedCount <= 0 || maxDistanceRejects(minDist)) {
            return lab;
        }

        return paletteOutputColor(best_i, cycleOffset, cycleMuted);
    }

    float selectedNearestWeight(vec3 lab, int selectedSwatch) {
        if (u_paletteSize <= 0 || selectedSwatch < 0) {
            return 0.0;
        }

        float labC = length(lab.yz);
        vec2 labHue = (labC > 1e-6) ? lab.yz / labC : vec2(1.0, 0.0);

        float minDist = 1e20;
        int best_i = 0;

        for (int i = 0; i < MAX_PALETTE_SIZE; ++i) {
            if (i >= u_paletteSize) break;

            float d = deltaE_bias_fast(
                lab.x,
                labC,
                labHue,
                paletteFeatures[i]
            );

            if (d < minDist) {
                minDist = d;
                best_i = i;
            }
        }

        if (maxDistanceRejects(minDist)) {
            return 0.0;
        }

        return paletteEntryMatchesDiagnosticSwatch(best_i, selectedSwatch) ? 1.0 : 0.0;
    }
#endif


#if ASSIGNMODE == ASSIGN_DITHER

    float orderedDither8x8(vec2 fragCoord, float scale) {
        vec2 cell = floor(fragCoord / max(scale, 1.0));
        int x = int(mod(cell.x, 8.0));
        int y = int(mod(cell.y, 8.0));
        int index = y * 8 + x;

        float thresholds[64] = float[](
             0.0/64.0, 32.0/64.0,  8.0/64.0, 40.0/64.0,  2.0/64.0, 34.0/64.0, 10.0/64.0, 42.0/64.0,
            48.0/64.0, 16.0/64.0, 56.0/64.0, 24.0/64.0, 50.0/64.0, 18.0/64.0, 58.0/64.0, 26.0/64.0,
            12.0/64.0, 44.0/64.0,  4.0/64.0, 36.0/64.0, 14.0/64.0, 46.0/64.0,  6.0/64.0, 38.0/64.0,
            60.0/64.0, 28.0/64.0, 52.0/64.0, 20.0/64.0, 62.0/64.0, 30.0/64.0, 54.0/64.0, 22.0/64.0,
             3.0/64.0, 35.0/64.0, 11.0/64.0, 43.0/64.0,  1.0/64.0, 33.0/64.0,  9.0/64.0, 41.0/64.0,
            51.0/64.0, 19.0/64.0, 59.0/64.0, 27.0/64.0, 49.0/64.0, 17.0/64.0, 57.0/64.0, 25.0/64.0,
            15.0/64.0, 47.0/64.0,  7.0/64.0, 39.0/64.0, 13.0/64.0, 45.0/64.0,  5.0/64.0, 37.0/64.0,
            63.0/64.0, 31.0/64.0, 55.0/64.0, 23.0/64.0, 61.0/64.0, 29.0/64.0, 53.0/64.0, 21.0/64.0
        );

        return thresholds[index];
    }

    float orderedDither4x4(vec2 fragCoord, float scale) {
        vec2 cell = floor(fragCoord / max(scale, 1.0));
        int x = int(mod(cell.x, 4.0));
        int y = int(mod(cell.y, 4.0));
        int index = y * 4 + x;
        float thresholds[16] = float[](
            0.0,  0.5,    0.125,  0.625,
            0.75, 0.25,   0.875,  0.375,
            0.1875, 0.6875, 0.0625, 0.5625,
            0.9375, 0.4375, 0.8125, 0.3125
        );
        return thresholds[index];
    }

    float orderedDither2x2(vec2 fragCoord, float scale) {
        vec2 cell = floor(fragCoord / max(scale, 1.0));
        int x = int(mod(cell.x, 2.0));
        int y = int(mod(cell.y, 2.0));
        int index = y * 2 + x;

        float thresholds[4] = float[](
            0.0, 0.5,
            0.75, 0.25
        );

        return thresholds[index];
    }

    float hashDither(vec2 fragCoord, float scale) {
        vec2 cell = floor(fragCoord / max(scale, 1.0));
        return hash12(cell);
    }

    float lineDither(vec2 fragCoord, float scale, float angle) {
        vec2 pivot = 0.5 * u_resolution;
        vec2 p = rot2(angle) * (fragCoord - pivot);

        float period = max(scale, 1.0) * 4.0;
        float phase = fract(p.y / period);

        // triangle wave: 0 at stripe center, 1 at gap center
        return abs(phase - 0.5) * 2.0;
    }

    float halftoneDither(vec2 fragCoord, float scale, float angle) {
        vec2 pivot = 0.5 * u_resolution;
        vec2 p = rot2(angle) * (fragCoord - pivot);

        float cellSize = max(scale, 1.0) * 6.0;
        vec2 cell = floor(p / cellSize);
        vec2 local = p - (cell + 0.5) * cellSize;

        float maxR = 0.5 * cellSize;
        float r = length(local) / max(maxR, 1e-5);

        // 0 in dot center, 1 outside/near corners.
        return clamp(r, 0.0, 1.0);
    }

    float crosshatchDither(vec2 fragCoord, float scale, float angle) {
        vec2 pivot = 0.5 * u_resolution;
        vec2 p0 = fragCoord - pivot;
        float period = max(scale, 1.0) * 5.0;

        vec2 a = rot2(angle) * p0;
        vec2 b = rot2(angle + 58.0) * p0;
        vec2 c = rot2(angle - 47.0) * p0;

        float lineA = abs(fract(a.y / period) - 0.5) * 2.0;
        float lineB = abs(fract(b.y / (period * 1.35)) - 0.5) * 2.0;
        float lineC = abs(fract(c.y / (period * 1.9)) - 0.5) * 2.0;

        float ink = min(lineA, min(lineB + 0.12, lineC + 0.28));
        float tooth = (hash12(floor(fragCoord / max(scale, 1.0))) - 0.5) * 0.18;
        return clamp(ink + tooth, 0.0, 1.0);
    }

    float stippleDither(vec2 fragCoord, float scale) {
        float cellSize = max(scale, 1.0) * 5.0;
        vec2 p = fragCoord / cellSize;
        vec2 cell = floor(p);
        vec2 local = fract(p);

        vec2 dotCenter = vec2(
            hash12(cell + vec2(17.0, 43.0)),
            hash12(cell + vec2(71.0, 29.0))
        );

        float r = length(local - dotCenter) * 2.25;
        float paperGrain = (hash12(cell + vec2(11.0)) - 0.5) * 0.22;
        return clamp(r + paperGrain, 0.0, 1.0);
    }

    float weaveDither(vec2 fragCoord, float scale, float angle) {
        vec2 pivot = 0.5 * u_resolution;
        vec2 p = rot2(angle) * (fragCoord - pivot);
        float period = max(scale, 1.0) * 6.0;

        float warp = abs(fract(p.x / period) - 0.5) * 2.0;
        float weft = abs(fract(p.y / period) - 0.5) * 2.0;
        float thread = min(warp, weft);

        vec2 loomCell = floor(p / period);
        float overUnder = mod(loomCell.x + loomCell.y, 2.0) * 0.18;
        float fiber = 0.09 * sin((p.x + p.y) / max(scale, 1.0));
        return clamp(thread + overUnder + fiber, 0.0, 1.0);
    }

    float contourDither(vec2 fragCoord, float scale, float angle) {
        vec2 pivot = 0.5 * u_resolution;
        vec2 p = rot2(angle) * (fragCoord - pivot);
        float period = max(scale, 1.0) * 10.0;

        float wash = 0.5 + 0.5 * sin((length(p) + 0.22 * p.x - 0.14 * p.y) / period * 6.28318530718);
        float tide = 0.5 + 0.5 * sin((p.x * 0.33 + p.y * 0.21) / period * 6.28318530718);
        float grain = (hash12(floor(fragCoord / max(scale, 1.0))) - 0.5) * 0.16;
        return clamp(mix(wash, tide, 0.25) + grain, 0.0, 1.0);
    }

    float applyLumaDitherFalloff(float chooseSecond, float labL) {
        float luma01 = clamp(labL / 100.0, 0.0, 1.0);

        // 0 at black/white, 1 in midtones.
        float midtone = 1.0 - abs(luma01 * 2.0 - 1.0);

        float scale = mix(1.0, midtone, clamp(u_ditherLumaAmount, 0.0, 1.0));
        return chooseSecond * scale;
    }

    float ditherThreshold(vec2 fragCoord, float scale) {
    #if DITHER_PATTERN == DITHER_ORDERED_2
        return orderedDither2x2(fragCoord, scale);
    #elif DITHER_PATTERN == DITHER_ORDERED_8
        return orderedDither8x8(fragCoord, scale);
    #elif DITHER_PATTERN == DITHER_HASH
        return hashDither(fragCoord, scale);
    #elif DITHER_PATTERN == DITHER_LINES
        return lineDither(fragCoord, scale, u_ditherAngle);
    #elif DITHER_PATTERN == DITHER_HALFTONE
        return halftoneDither(fragCoord, scale, u_ditherAngle);
    #elif DITHER_PATTERN == DITHER_CROSSHATCH
        return crosshatchDither(fragCoord, scale, u_ditherAngle);
    #elif DITHER_PATTERN == DITHER_STIPPLE
        return stippleDither(fragCoord, scale);
    #elif DITHER_PATTERN == DITHER_WEAVE
        return weaveDither(fragCoord, scale, u_ditherAngle);
    #elif DITHER_PATTERN == DITHER_CONTOUR
        return contourDither(fragCoord, scale, u_ditherAngle);
    #else
        return orderedDither4x4(fragCoord, scale);
    #endif
    }

    vec3 ditherAssign(vec3 lab, int cycleOffset, vec2 fragCoord, bool maskActive, bool cycleMuted) {
        if (u_paletteSize <= 0) {
            return lab;
        }

        float labC = length(lab.yz);
        vec2 labHue = (labC > 1e-6) ? lab.yz / labC : vec2(1.0, 0.0);

        float bestDist = 1e20;
        float secondDist = 1e20;

        int bestIndex = 0;
        int secondIndex = 0;
        int acceptedCount = 0;

        for (int i = 0; i < MAX_PALETTE_SIZE; ++i) {
            if (i >= u_paletteSize) break;
            if (!assignmentCandidateAllowed(i, cycleOffset, maskActive)) continue;
            acceptedCount += 1;

            float d = deltaE_bias_fast(
                lab.x,
                labC,
                labHue,
                paletteFeatures[i]
            );

            if (d < bestDist) {
                secondDist = bestDist;
                secondIndex = bestIndex;

                bestDist = d;
                bestIndex = i;
            } else if (d < secondDist) {
                secondDist = d;
                secondIndex = i;
            }
        }

        if (acceptedCount <= 0 || maxDistanceRejects(bestDist)) {
            return lab;
        }

        if (acceptedCount <= 1 || u_blendK <= 1) {
            return paletteOutputColor(bestIndex, cycleOffset, cycleMuted);
        }

        float bestWeight = 1.0 / pow(bestDist + 1e-5, u_softness);
        float secondWeight = 1.0 / pow(secondDist + 1e-5, u_softness);

        float chooseSecond = secondWeight / max(bestWeight + secondWeight, 1e-5);
        chooseSecond = applyLumaDitherFalloff(chooseSecond, lab.x);

#if FIDELITY_GUARD
        if (chooseSecond >= 0.0625) {
            vec3 nearest = paletteOutputColor(bestIndex, cycleOffset, cycleMuted);
            vec3 second = paletteOutputColor(secondIndex, cycleOffset, cycleMuted);
            vec3 nearestOutput = applyOutputMode(lab, nearest);
            vec3 secondOutput = applyOutputMode(lab, second);
            vec3 averageOutput = mix(nearestOutput, secondOutput, chooseSecond);
            if (monotoneOutputGuardRejects(lab, averageOutput, nearestOutput)) {
                chooseSecond = 0.0;
            }
        }
#endif

        float threshold = ditherThreshold(fragCoord, u_ditherScale);

        int chosenIndex = bestIndex;

        if (chooseSecond >= 0.0625 && threshold < chooseSecond) {
            chosenIndex = secondIndex;
        }

        return paletteOutputColor(chosenIndex, cycleOffset, cycleMuted);
    }

    float selectedDitherWeight(vec3 lab, int selectedSwatch, vec2 fragCoord) {
        if (u_paletteSize <= 0 || selectedSwatch < 0) {
            return 0.0;
        }

        float labC = length(lab.yz);
        vec2 labHue = (labC > 1e-6) ? lab.yz / labC : vec2(1.0, 0.0);

        float bestDist = 1e20;
        float secondDist = 1e20;

        int bestIndex = 0;
        int secondIndex = 0;

        for (int i = 0; i < MAX_PALETTE_SIZE; ++i) {
            if (i >= u_paletteSize) break;

            float d = deltaE_bias_fast(
                lab.x,
                labC,
                labHue,
                paletteFeatures[i]
            );

            if (d < bestDist) {
                secondDist = bestDist;
                secondIndex = bestIndex;

                bestDist = d;
                bestIndex = i;
            } else if (d < secondDist) {
                secondDist = d;
                secondIndex = i;
            }
        }

        if (maxDistanceRejects(bestDist)) {
            return 0.0;
        }

        int chosenIndex = bestIndex;

        if (u_paletteSize > 1 && u_blendK > 1) {
            float bestWeight = 1.0 / pow(bestDist + 1e-5, u_softness);
            float secondWeight = 1.0 / pow(secondDist + 1e-5, u_softness);
            float chooseSecond = secondWeight / max(bestWeight + secondWeight, 1e-5);
            chooseSecond = applyLumaDitherFalloff(chooseSecond, lab.x);

#if FIDELITY_GUARD
            if (chooseSecond >= 0.0625) {
                vec3 nearestOutput = applyOutputMode(lab, paletteColors[bestIndex].rgb);
                vec3 secondOutput = applyOutputMode(lab, paletteColors[secondIndex].rgb);
                vec3 averageOutput = mix(nearestOutput, secondOutput, chooseSecond);
                if (monotoneOutputGuardRejects(lab, averageOutput, nearestOutput)) {
                    chooseSecond = 0.0;
                }
            }
#endif

            float threshold = ditherThreshold(fragCoord, u_ditherScale);
            if (chooseSecond >= 0.0625 && threshold < chooseSecond) {
                chosenIndex = secondIndex;
            }
        }

        return paletteEntryMatchesDiagnosticSwatch(chosenIndex, selectedSwatch) ? 1.0 : 0.0;
    }
#endif

struct SourceSample {
    vec2 uv;
    vec2 blockCoord;
};

float pixelBlockSize() {
    return max(1.0, floor(u_pixelBlockSize + 0.5));
}

vec2 sourceImageSize() {
    ivec2 fallbackSize = textureSize(u_image, 0);
    return max(u_sourceImageSize, vec2(float(fallbackSize.x), float(fallbackSize.y)));
}

SourceSample sourceSampleForUv(vec2 uv) {
    float blockSize = pixelBlockSize();
    vec2 sourceSize = sourceImageSize();
    vec2 sourcePixel = clamp(floor(uv * sourceSize), vec2(0.0), sourceSize - vec2(1.0));

    if (u_pixelArtEnabled != 1) {
        return SourceSample(uv, sourcePixel);
    }

    vec2 blockCoord = floor(sourcePixel / blockSize);

    if (u_blockSampledInput == 1) {
        ivec2 sampledSize = textureSize(u_image, 0);
        vec2 sampledTexSize = vec2(float(sampledSize.x), float(sampledSize.y));
        vec2 sampledPixel = clamp(blockCoord, vec2(0.0), sampledTexSize - vec2(1.0));
        return SourceSample((sampledPixel + vec2(0.5)) / sampledTexSize, blockCoord);
    }

    vec2 blockOrigin = blockCoord * blockSize;
    vec2 centerPixel = min(blockOrigin + floor(blockSize * 0.5), sourceSize - vec2(1.0));
    return SourceSample((centerPixel + vec2(0.5)) / sourceSize, blockCoord);
}

void main() {
    vec2 localFragCoord = gl_FragCoord.xy - u_viewportOrigin;
    vec2 screenUv = vec2(localFragCoord.x / u_resolution.x, 1.0 - (localFragCoord.y / u_resolution.y));

    vec2 uv = clamp(u_viewCenter + (screenUv - 0.5) * u_viewSpan, vec2(0.0), vec2(1.0));
    SourceSample sample_ = sourceSampleForUv(uv);
    vec2 ditherCoord = u_pixelArtEnabled == 1 ? sample_.blockCoord : localFragCoord;

    vec3 color = texture(u_image, sample_.uv).rgb;
    vec3 lab = rgb2lab(srgb2linear(color));

    bool maskPaintedHere = u_maskEnabled == 1 && texture(u_mask, uv).a > 0.01;
    bool cycleMutedHere = u_maskEnabled == 1 && u_maskBehavior == MASK_BEHAVIOR_CYCLE_WITHIN && !maskPaintedHere;
    int effectiveCycleOffset = cycleMutedHere ? 0 : u_cycleOffset;
    bool maskActiveHere = maskPaintedHere && u_maskBehavior == MASK_BEHAVIOR_FORBID_COLORS;

#if ASSIGNMODE == ASSIGN_BLEND
    vec3 labMapped = softAssign(lab, effectiveCycleOffset, maskActiveHere, cycleMutedHere);
#elif ASSIGNMODE == ASSIGN_DITHER
    vec3 labMapped = ditherAssign(lab, effectiveCycleOffset, ditherCoord, maskActiveHere, cycleMutedHere);
#else
    vec3 labMapped = matchNearest(lab, effectiveCycleOffset, maskActiveHere, cycleMutedHere);
#endif

    labMapped = applyOutputMode(lab, labMapped);

    vec3 srgbOut = linear2srgb(lab2rgb(labMapped));
    srgbOut = clamp(srgbOut, 0.0, 1.0);

    vec3 finalColor = blendWithColorSpace(color, srgbOut, u_blendAmount);

    if (u_diagnosticOverlayMode == 1) {
        float swatchSignal = 0.0;
    #if ASSIGNMODE == ASSIGN_BLEND
        swatchSignal = selectedBlendWeight(lab, u_diagnosticOverlaySwatch);
    #elif ASSIGNMODE == ASSIGN_DITHER
        swatchSignal = selectedDitherWeight(lab, u_diagnosticOverlaySwatch, ditherCoord);
    #else
        swatchSignal = selectedNearestWeight(lab, u_diagnosticOverlaySwatch);
    #endif
        outColor = vec4(vec3(clamp(swatchSignal, 0.0, 1.0)), 1.0);
        return;
    }

    if (u_diagnosticOverlayMode == 2) {
        vec3 finalLab = rgb2lab(srgb2linear(finalColor));
        float diffAmount = clamp(length(finalLab - lab) / OKLAB_SCALE, 0.0, 1.0);
        outColor = vec4(vec3(diffAmount), 1.0);
        return;
    }


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
            outColor = vec4(color, 1.0);
            return;
        }
    }

    outColor = vec4(finalColor, 1.0);
}
