const contextUniformCaches = new WeakMap();
const fallbackContextCache = {objectPrograms: new WeakMap(), primitivePrograms: new Map()};

function isObjectKey(value) {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function contextCacheFor(gl) {
  if (!isObjectKey(gl)) return fallbackContextCache;
  let cache = contextUniformCaches.get(gl);
  if (!cache) {
    cache = {objectPrograms: new WeakMap(), primitivePrograms: new Map()};
    contextUniformCaches.set(gl, cache);
  }
  return cache;
}

function programUniformCacheFor(gl, program) {
  const contextCache = contextCacheFor(gl);
  const programCaches = isObjectKey(program)
    ? contextCache.objectPrograms
    : contextCache.primitivePrograms;
  let uniformCache = programCaches.get(program);
  if (!uniformCache) {
    uniformCache = new Map();
    programCaches.set(program, uniformCache);
  }
  return uniformCache;
}

export function uniformLocation(gl, program, name) {
  const uniformCache = programUniformCacheFor(gl, program);
  if (!uniformCache.has(name)) {
    uniformCache.set(name, gl.getUniformLocation(program, name));
  }
  return uniformCache.get(name);
}

export function uniformArrayLocation(gl, program, name) {
  return uniformLocation(gl, program, name) ?? uniformLocation(gl, program, `${name}[0]`);
}
