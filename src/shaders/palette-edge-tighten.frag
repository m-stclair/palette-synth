#version 300 es
precision highp float;
precision highp int;

// Source-resolution edge cleanup for paletted pixel-art output. The pass is
// intentionally conservative: it only replaces a weakly-supported centre pixel
// when neighboring art pixels form a clearer opposite-pair seam or 2x2 corner
// block. This is edge repair, not sharpening.

uniform sampler2D u_image;
uniform vec2 u_texelSize;
uniform float u_step;
uniform float u_tolerance;
uniform int u_strength;
uniform int u_ditherProtectionEnabled;
uniform int u_ditherKnown;
uniform int u_ditherPattern;
uniform float u_ditherScale;
uniform float u_ditherAngle;

out vec4 outColor;

bool colorsEqual(vec3 a, vec3 b, float tolerance) {
    vec3 d = a - b;
    return dot(d, d) <= tolerance * tolerance;
}

int same(vec3 a, vec3 b) {
    return colorsEqual(a, b, u_tolerance) ? 1 : 0;
}

const int DITHER_ORDERED_2 = 0;
const int DITHER_ORDERED_4 = 1;
const int DITHER_ORDERED_8 = 2;
const int DITHER_HASH = 3;
const int DITHER_LINES = 4;
const int DITHER_HALFTONE = 5;
const int DITHER_CROSSHATCH = 6;
const int DITHER_STIPPLE = 7;
const int DITHER_WEAVE = 8;
const int DITHER_CONTOUR = 9;

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

vec2 ditherResolution() {
    ivec2 size = textureSize(u_image, 0);
    return vec2(float(size.x), float(size.y));
}

vec2 ditherCoordForFrag() {
    float step = max(u_step, 1.0);
    return step > 1.0 ? floor(gl_FragCoord.xy / step) : gl_FragCoord.xy;
}

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
    float thresholds[4] = float[](0.0, 0.5, 0.75, 0.25);
    return thresholds[index];
}

float lineDither(vec2 fragCoord, float scale, float angle) {
    vec2 pivot = 0.5 * ditherResolution();
    vec2 p = rot2(angle) * (fragCoord - pivot);
    float period = max(scale, 1.0) * 4.0;
    float phase = fract(p.y / period);
    return abs(phase - 0.5) * 2.0;
}

float halftoneDither(vec2 fragCoord, float scale, float angle) {
    vec2 pivot = 0.5 * ditherResolution();
    vec2 p = rot2(angle) * (fragCoord - pivot);
    float cellSize = max(scale, 1.0) * 6.0;
    vec2 cell = floor(p / cellSize);
    vec2 local = p - (cell + 0.5) * cellSize;
    float maxR = 0.5 * cellSize;
    float r = length(local) / max(maxR, 1e-5);
    return clamp(r, 0.0, 1.0);
}

float crosshatchDither(vec2 fragCoord, float scale, float angle) {
    vec2 pivot = 0.5 * ditherResolution();
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
    vec2 dotCenter = vec2(hash12(cell + vec2(17.0, 43.0)), hash12(cell + vec2(71.0, 29.0)));
    float r = length(local - dotCenter) * 2.25;
    float paperGrain = (hash12(cell + vec2(11.0)) - 0.5) * 0.22;
    return clamp(r + paperGrain, 0.0, 1.0);
}

float weaveDither(vec2 fragCoord, float scale, float angle) {
    vec2 pivot = 0.5 * ditherResolution();
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
    vec2 pivot = 0.5 * ditherResolution();
    vec2 p = rot2(angle) * (fragCoord - pivot);
    float period = max(scale, 1.0) * 10.0;
    float wash = 0.5 + 0.5 * sin((length(p) + 0.22 * p.x - 0.14 * p.y) / period * 6.28318530718);
    float tide = 0.5 + 0.5 * sin((p.x * 0.33 + p.y * 0.21) / period * 6.28318530718);
    float grain = (hash12(floor(fragCoord / max(scale, 1.0))) - 0.5) * 0.16;
    return clamp(mix(wash, tide, 0.25) + grain, 0.0, 1.0);
}

float ditherThresholdAt(vec2 fragCoord) {
    if (u_ditherPattern == DITHER_ORDERED_2) return orderedDither2x2(fragCoord, u_ditherScale);
    if (u_ditherPattern == DITHER_ORDERED_8) return orderedDither8x8(fragCoord, u_ditherScale);
    if (u_ditherPattern == DITHER_HASH) return hash12(floor(fragCoord / max(u_ditherScale, 1.0)));
    if (u_ditherPattern == DITHER_LINES) return lineDither(fragCoord, u_ditherScale, u_ditherAngle);
    if (u_ditherPattern == DITHER_HALFTONE) return halftoneDither(fragCoord, u_ditherScale, u_ditherAngle);
    if (u_ditherPattern == DITHER_CROSSHATCH) return crosshatchDither(fragCoord, u_ditherScale, u_ditherAngle);
    if (u_ditherPattern == DITHER_STIPPLE) return stippleDither(fragCoord, u_ditherScale);
    if (u_ditherPattern == DITHER_WEAVE) return weaveDither(fragCoord, u_ditherScale, u_ditherAngle);
    if (u_ditherPattern == DITHER_CONTOUR) return contourDither(fragCoord, u_ditherScale, u_ditherAngle);
    return orderedDither4x4(fragCoord, u_ditherScale);
}

bool ditherThresholdIsLocalExtreme(vec2 artCoord) {
    float centre = ditherThresholdAt(artCoord);
    int lowerThanNeighbours = 0;
    int higherThanNeighbours = 0;
    for (int y = -1; y <= 1; ++y) {
        for (int x = -1; x <= 1; ++x) {
            if (x == 0 && y == 0) continue;
            float neighbour = ditherThresholdAt(artCoord + vec2(float(x), float(y)));
            if (centre < neighbour - 0.0001) lowerThanNeighbours += 1;
            if (centre > neighbour + 0.0001) higherThanNeighbours += 1;
        }
    }
    return lowerThanNeighbours >= 6 || higherThanNeighbours >= 6;
}

bool ditherProtectedSamples(vec3 samples[9], vec2 artCoord) {
    if (u_ditherProtectionEnabled == 0) return false;

    vec3 centre = samples[4];
    vec3 alternate = centre;
    bool hasAlternate = false;

    for (int i = 0; i < 9; ++i) {
        if (!colorsEqual(samples[i], centre, u_tolerance)) {
            if (!hasAlternate) {
                alternate = samples[i];
                hasAlternate = true;
            } else if (!colorsEqual(samples[i], alternate, u_tolerance)) {
                return false;
            }
        }
    }

    if (!hasAlternate) return false;

    int centreCount = 0;
    for (int i = 0; i < 9; ++i) {
        if (colorsEqual(samples[i], centre, u_tolerance)) centreCount += 1;
    }

    int centreCardinal = 0;
    if (colorsEqual(samples[1], centre, u_tolerance)) centreCardinal += 1;
    if (colorsEqual(samples[3], centre, u_tolerance)) centreCardinal += 1;
    if (colorsEqual(samples[5], centre, u_tolerance)) centreCardinal += 1;
    if (colorsEqual(samples[7], centre, u_tolerance)) centreCardinal += 1;

    int centreDiagonal = 0;
    if (colorsEqual(samples[0], centre, u_tolerance)) centreDiagonal += 1;
    if (colorsEqual(samples[2], centre, u_tolerance)) centreDiagonal += 1;
    if (colorsEqual(samples[6], centre, u_tolerance)) centreDiagonal += 1;
    if (colorsEqual(samples[8], centre, u_tolerance)) centreDiagonal += 1;

    bool checkerOrStripeEvidence =
        (centreDiagonal >= 2 && centreCardinal == 0) ||
        (centreCardinal >= 2 && centreDiagonal == 0 && centreCount <= 3);

    bool weakCentre = centreCount <= 3;
    bool knownPatternEvidence = u_ditherKnown == 1 && weakCentre && ditherThresholdIsLocalExtreme(artCoord);

    return checkerOrStripeEvidence || knownPatternEvidence;
}

int oppositePairs(vec3 x, vec3 n, vec3 w, vec3 e, vec3 s) {
    int pairs = 0;
    if (colorsEqual(x, w, u_tolerance) && colorsEqual(x, e, u_tolerance)) pairs += 1;
    if (colorsEqual(x, n, u_tolerance) && colorsEqual(x, s, u_tolerance)) pairs += 1;
    return pairs;
}

int cornerBlocks(vec3 x, vec3 nw, vec3 n, vec3 ne, vec3 w, vec3 e, vec3 sw, vec3 s, vec3 se) {
    int blocks = 0;
    if (colorsEqual(x, nw, u_tolerance) && colorsEqual(x, n, u_tolerance) && colorsEqual(x, w, u_tolerance)) blocks += 1;
    if (colorsEqual(x, ne, u_tolerance) && colorsEqual(x, n, u_tolerance) && colorsEqual(x, e, u_tolerance)) blocks += 1;
    if (colorsEqual(x, sw, u_tolerance) && colorsEqual(x, s, u_tolerance) && colorsEqual(x, w, u_tolerance)) blocks += 1;
    if (colorsEqual(x, se, u_tolerance) && colorsEqual(x, s, u_tolerance) && colorsEqual(x, e, u_tolerance)) blocks += 1;
    return blocks;
}

int scoreCandidate(vec3 x, vec3 nw, vec3 n, vec3 ne, vec3 w, vec3 e, vec3 sw, vec3 s, vec3 se) {
    int cardinal = same(x, n) + same(x, e) + same(x, s) + same(x, w);
    int diagonal = same(x, nw) + same(x, ne) + same(x, sw) + same(x, se);
    int pairs = oppositePairs(x, n, w, e, s);
    int blocks = cornerBlocks(x, nw, n, ne, w, e, sw, s, se);
    return cardinal * 2 + diagonal + pairs * 3 + blocks * 2;
}

void main() {
    vec2 uv = gl_FragCoord.xy * u_texelSize;
    vec2 off = u_texelSize * max(u_step, 1.0);

    vec3 nw = texture(u_image, clamp(uv + vec2(-1.0, -1.0) * off, vec2(0.0), vec2(1.0))).rgb;
    vec3 n  = texture(u_image, clamp(uv + vec2( 0.0, -1.0) * off, vec2(0.0), vec2(1.0))).rgb;
    vec3 ne = texture(u_image, clamp(uv + vec2( 1.0, -1.0) * off, vec2(0.0), vec2(1.0))).rgb;
    vec3 w  = texture(u_image, clamp(uv + vec2(-1.0,  0.0) * off, vec2(0.0), vec2(1.0))).rgb;
    vec3 c  = texture(u_image, uv).rgb;
    vec3 e  = texture(u_image, clamp(uv + vec2( 1.0,  0.0) * off, vec2(0.0), vec2(1.0))).rgb;
    vec3 sw = texture(u_image, clamp(uv + vec2(-1.0,  1.0) * off, vec2(0.0), vec2(1.0))).rgb;
    vec3 s  = texture(u_image, clamp(uv + vec2( 0.0,  1.0) * off, vec2(0.0), vec2(1.0))).rgb;
    vec3 se = texture(u_image, clamp(uv + vec2( 1.0,  1.0) * off, vec2(0.0), vec2(1.0))).rgb;

    vec3 samples[9] = vec3[9](nw, n, ne, w, c, e, sw, s, se);

    int centerCardinal = same(c, n) + same(c, e) + same(c, s) + same(c, w);
    int centerAll = same(c, nw) + same(c, n) + same(c, ne)
        + same(c, w) + same(c, e)
        + same(c, sw) + same(c, s) + same(c, se);

    bool centerProtected = centerCardinal >= 2 || centerAll >= 4 || ditherProtectedSamples(samples, ditherCoordForFrag());
    vec3 result = c;

    if (!centerProtected) {
        vec3 candidates[8] = vec3[8](nw, n, ne, w, e, sw, s, se);
        vec3 best = c;
        int bestScore = 0;
        int bestPairs = 0;
        int bestBlocks = 0;

        for (int i = 0; i < 8; ++i) {
            vec3 x = candidates[i];
            if (colorsEqual(x, c, u_tolerance)) continue;
            int candidateScore = scoreCandidate(x, nw, n, ne, w, e, sw, s, se);
            if (candidateScore > bestScore) {
                bestScore = candidateScore;
                bestPairs = oppositePairs(x, n, w, e, s);
                bestBlocks = cornerBlocks(x, nw, n, ne, w, e, sw, s, se);
                best = x;
            }
        }

        bool hasOppositePairEvidence = bestPairs > 0;
        bool hasCornerBlockEvidence = bestBlocks > 0;
        bool strengthOneReplace = hasOppositePairEvidence && bestScore >= 7;
        bool strengthTwoReplace = (hasOppositePairEvidence || hasCornerBlockEvidence) && bestScore >= 7;
        bool shouldReplace = (u_strength <= 1) ? strengthOneReplace : strengthTwoReplace;

        if (shouldReplace) {
            result = best;
        }
    }

    outColor = vec4(result, 1.0);
}
