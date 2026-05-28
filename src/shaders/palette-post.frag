#version 300 es
precision highp float;
precision highp int;

// Source-resolution post-processor for the paletted image. The host invokes
// this shader once per despeckle iteration.
//
// u_step is the kernel step in source-texture texels. When the palette pass
// runs with pixelBlockSize > 1 the paletted texture has constant blocks, so
// the host sets u_step = pixelBlockSize so each kernel sample lands in a
// different art-pixel block.

uniform sampler2D u_image;
uniform vec2 u_texelSize;
uniform float u_step;
uniform float u_tolerance;

out vec4 outColor;

bool colorsEqual(vec3 a, vec3 b, float tolerance) {
    vec3 d = a - b;
    return dot(d, d) <= tolerance * tolerance;
}

const int minModeCount = 5;
const int maxCentreCount = 1;


// 3x3 mode filter. For each fragment we sample the 9 neighbors (including
// self), then for each neighbor count how many of the other neighbors match
// it (within tolerance). The neighbor with the highest count wins. If two
// neighbors tie, the centre pixel wins (preserving the original value
// whenever the mode is ambiguous).
void main() {
    vec2 uv = (gl_FragCoord.xy) * u_texelSize;
    vec2 off = u_texelSize * max(u_step, 1.0);

    vec3 samples[9];
    int idx = 0;
    for (int j = -1; j <= 1; ++j) {
        for (int i = -1; i <= 1; ++i) {
            vec2 sampleUv = clamp(uv + vec2(float(i), float(j)) * off, vec2(0.0), vec2(1.0));
            samples[idx] = texture(u_image, sampleUv).rgb;
            idx++;
        }
    }

    int bestCount = 0;
    vec3 bestColor = samples[4]; // centre by default
    for (int k = 0; k < 9; ++k) {
        int count = 0;
        for (int m = 0; m < 9; ++m) {
            if (colorsEqual(samples[k], samples[m], u_tolerance)) {
                count++;
            }
        }
        // Prefer the centre pixel on ties so non-speckled areas are stable.
        bool strictlyBetter = count > bestCount;
        bool tieFavoringCentre = (count == bestCount) && (k == 4);
        if (strictlyBetter || tieFavoringCentre) {
            bestCount = count;
            bestColor = samples[k];
        }
    }

    int centreCount = 0;
    for (int m = 0; m < 9; ++m) {
        if (colorsEqual(samples[4], samples[m], u_tolerance)) centreCount++;
    }

    bool centreIsIsolated = centreCount <= maxCentreCount;
    bool replacementIsDominant = bestCount >= minModeCount;

    vec3 result = (centreIsIsolated && replacementIsDominant)
        ? bestColor
        : samples[4];
    outColor = vec4(result, 1.0);
}
