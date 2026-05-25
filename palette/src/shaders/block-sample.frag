#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_image;
uniform ivec2 u_sourceSize;
uniform int u_blockSize;
uniform int u_sampleMode;

out vec4 outColor;

#define SAMPLE_CENTER 0
#define SAMPLE_MEAN 1
#define SAMPLE_REPRESENTATIVE 2
#define MAX_BLOCK_SIZE 16

vec3 srgb2linear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

vec3 linear2srgb(vec3 c) {
    vec3 lo = c * 12.92;
    vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    return mix(lo, hi, step(0.0031308, c));
}

ivec2 clampSourcePixel(ivec2 pixel) {
    return clamp(pixel, ivec2(0), max(u_sourceSize - ivec2(1), ivec2(0)));
}

vec4 sampleBlockCenter(ivec2 blockOrigin, int blockSize) {
    ivec2 centerOffset = ivec2(blockSize / 2);
    return texelFetch(u_image, clampSourcePixel(blockOrigin + centerOffset), 0);
}

vec4 sampleBlockMean(ivec2 blockOrigin, int blockSize) {
    vec3 weightedLinear = vec3(0.0);
    float alphaWeight = 0.0;
    float alphaSum = 0.0;
    float sampleCount = 0.0;

    for (int y = 0; y < MAX_BLOCK_SIZE; ++y) {
        if (y >= blockSize) break;
        int sourceY = blockOrigin.y + y;
        if (sourceY >= u_sourceSize.y) break;

        for (int x = 0; x < MAX_BLOCK_SIZE; ++x) {
            if (x >= blockSize) break;
            int sourceX = blockOrigin.x + x;
            if (sourceX >= u_sourceSize.x) break;

            vec4 c = texelFetch(u_image, ivec2(sourceX, sourceY), 0);
            float w = c.a;
            weightedLinear += srgb2linear(c.rgb) * w;
            alphaWeight += w;
            alphaSum += c.a;
            sampleCount += 1.0;
        }
    }

    vec3 rgb = alphaWeight > 0.0001 ? linear2srgb(weightedLinear / alphaWeight) : vec3(0.0);
    float alpha = sampleCount > 0.0 ? alphaSum / sampleCount : 0.0;
    return vec4(clamp(rgb, 0.0, 1.0), clamp(alpha, 0.0, 1.0));
}


vec4 sampleBlockRepresentative(ivec2 blockOrigin, int blockSize) {
    vec3 weightedLinear = vec3(0.0);
    float alphaWeight = 0.0;
    float alphaSum = 0.0;
    float sampleCount = 0.0;

    for (int y = 0; y < MAX_BLOCK_SIZE; ++y) {
        if (y >= blockSize) break;
        int sourceY = blockOrigin.y + y;
        if (sourceY >= u_sourceSize.y) break;

        for (int x = 0; x < MAX_BLOCK_SIZE; ++x) {
            if (x >= blockSize) break;
            int sourceX = blockOrigin.x + x;
            if (sourceX >= u_sourceSize.x) break;

            vec4 c = texelFetch(u_image, ivec2(sourceX, sourceY), 0);
            float w = c.a;
            weightedLinear += srgb2linear(c.rgb) * w;
            alphaWeight += w;
            alphaSum += c.a;
            sampleCount += 1.0;
        }
    }

    if (sampleCount <= 0.0) {
        return sampleBlockCenter(blockOrigin, blockSize);
    }

    float targetAlpha = alphaSum / sampleCount;
    vec3 targetPremultiplied = weightedLinear / sampleCount;
    if (alphaWeight <= 0.0001) {
        targetPremultiplied = vec3(0.0);
    }

    vec4 bestColor = sampleBlockCenter(blockOrigin, blockSize);
    float bestDistance = 1.0e20;

    for (int y = 0; y < MAX_BLOCK_SIZE; ++y) {
        if (y >= blockSize) break;
        int sourceY = blockOrigin.y + y;
        if (sourceY >= u_sourceSize.y) break;

        for (int x = 0; x < MAX_BLOCK_SIZE; ++x) {
            if (x >= blockSize) break;
            int sourceX = blockOrigin.x + x;
            if (sourceX >= u_sourceSize.x) break;

            vec4 c = texelFetch(u_image, ivec2(sourceX, sourceY), 0);
            vec3 premultiplied = srgb2linear(c.rgb) * c.a;
            vec3 colorDelta = premultiplied - targetPremultiplied;
            float alphaDelta = c.a - targetAlpha;
            float distance = dot(colorDelta, colorDelta) + alphaDelta * alphaDelta;
            if (distance < bestDistance) {
                bestDistance = distance;
                bestColor = c;
            }
        }
    }

    return bestColor;
}

void main() {
    int blockSize = clamp(u_blockSize, 1, MAX_BLOCK_SIZE);
    ivec2 tile = ivec2(gl_FragCoord.xy);
    ivec2 blockOrigin = tile * blockSize;

    if (u_sampleMode == SAMPLE_MEAN) {
        outColor = sampleBlockMean(blockOrigin, blockSize);
    } else if (u_sampleMode == SAMPLE_REPRESENTATIVE) {
        outColor = sampleBlockRepresentative(blockOrigin, blockSize);
    } else {
        outColor = sampleBlockCenter(blockOrigin, blockSize);
    }
}
