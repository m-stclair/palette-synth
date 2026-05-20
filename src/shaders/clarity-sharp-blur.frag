#version 300 es
precision highp float;

uniform sampler2D u_sharpPass;
uniform vec2 u_resolution;
uniform float u_kernelWeights[7];

out vec4 outColor;

float horizontalBlurredSharpLightness(vec2 uv) {
    vec2 texel = 1.0 / max(u_resolution, vec2(1.0));
    float accum = 0.0;

    for (int x = -3; x <= 3; ++x) {
        vec2 sampleUv = clamp(uv + vec2(float(x), 0.0) * texel, vec2(0.0), vec2(1.0));
        accum += texture(u_sharpPass, sampleUv).r * u_kernelWeights[x + 3];
    }

    return accum;
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float sharpLightness = clamp(horizontalBlurredSharpLightness(uv), 0.0, 1.0);
    outColor = vec4(vec3(sharpLightness), 1.0);
}
