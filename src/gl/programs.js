export function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "unknown shader error";
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

export function linkProgram(gl, vertexSource, fragmentSource, linkErrorMessage = "unknown program link error") {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || linkErrorMessage;
    gl.deleteProgram(program);
    throw new Error(log);
  }
  return program;
}

export function injectDefines(fragmentSource, defineLines = []) {
  if (!defineLines.length) return fragmentSource;
  return fragmentSource.replace("#version 300 es", `#version 300 es\n${defineLines.join("\n")}`);
}

export function buildCachedProgram(gl, cache, {
  vertexSource,
  fragmentSource,
  defineLines = [],
  linkErrorMessage = "unknown program link error"
}) {
  const key = defineLines.join(";");
  if (cache.program && cache.programKey === key) return cache.program;

  if (cache.program) gl.deleteProgram(cache.program);
  const source = injectDefines(fragmentSource, defineLines);
  const program = linkProgram(gl, vertexSource, source, linkErrorMessage);
  cache.program = program;
  cache.programKey = key;
  return program;
}

export function buildStaticProgram(gl, cache, {
  vertexSource,
  fragmentSource,
  linkErrorMessage = "unknown program link error"
}) {
  if (cache.program) return cache.program;
  cache.program = linkProgram(gl, vertexSource, fragmentSource, linkErrorMessage);
  return cache.program;
}

export function disposeCachedProgram(gl, cache) {
  if (!cache?.program) return;
  gl.deleteProgram(cache.program);
  cache.program = null;
  cache.programKey = "";
}
