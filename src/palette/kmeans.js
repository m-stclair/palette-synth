import { seededRandom } from "../color-utils.js";

function validLab(lab) {
  if (!Array.isArray(lab) || lab.length < 3) return null;
  const L = Number(lab[0]);
  const a = Number(lab[1]);
  const b = Number(lab[2]);
  return Number.isFinite(L) && Number.isFinite(a) && Number.isFinite(b) ? [L, a, b] : null;
}

function squaredLabDistance(a, b) {
  const dL = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return dL * dL + da * da + db * db;
}

function nearestCenterIndex(sample, centers) {
  let bestIndex = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < centers.length; i++) {
    const distance = squaredLabDistance(sample, centers[i]);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return {index: bestIndex, distance: bestDistance};
}

function farthestSampleFromCenters(samples, centers, usedSampleIndexes = new Set(), rng = null) {
  if (!samples.length) return {sample: null, index: -1, distance: 0};
  const hasCenters = centers.length > 0;
  let bestIndex = -1;
  let bestDistance = -1;
  let bestJitter = -1;
  for (let i = 0; i < samples.length; i++) {
    if (usedSampleIndexes.has(i)) continue;
    const distance = hasCenters ? nearestCenterIndex(samples[i], centers).distance : Infinity;
    const jitter = typeof rng === "function" ? rng() : 0;
    if (distance > bestDistance || (distance === bestDistance && jitter > bestJitter)) {
      bestDistance = distance;
      bestJitter = jitter;
      bestIndex = i;
    }
  }
  if (bestIndex < 0) bestIndex = Math.floor((typeof rng === "function" ? rng() : 0) * samples.length) % samples.length;
  return {sample: [...samples[bestIndex]], index: bestIndex, distance: bestDistance};
}

function snapCenterToSample(center, samples, preferredIndexes = []) {
  if (!samples.length) return [...center];
  const indexes = preferredIndexes.length ? preferredIndexes : samples.map((_, index) => index);
  let bestIndex = indexes[0] ?? 0;
  let bestDistance = Infinity;
  for (const index of indexes) {
    const sample = samples[index];
    if (!sample) continue;
    const distance = squaredLabDistance(center, sample);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return [...samples[bestIndex]];
}

/**
 * Runs k-means where fixed centers participate in assignment but never move.
 * Returned movable centers preserve the order of the supplied movable centers.
 *
 * @param {Array<Array<number>>} samples
 * @param {Object} options
 * @param {Array<Array<number>>} [options.fixedCenters]
 * @param {Array<Array<number>>} [options.movableCenters]
 * @param {number} [options.movableCount]
 * @param {number} [options.seed]
 * @param {number} [options.maxIterations]
 * @param {number} [options.epsilon]
 * @param {boolean} [options.snapToSamples]
 * @returns {{fixedCenters:Array<Array<number>>, movableCenters:Array<Array<number>>, rawMovableCenters:Array<Array<number>>, assignments:Int32Array, movableAssignmentIndexes:Array<Array<number>>, iterations:number, changed:boolean}}
 */
export function constrainedKMeansLabs(samples, options = {}) {
  const cleanSamples = (Array.isArray(samples) ? samples : []).map(validLab).filter(Boolean);
  const fixedCenters = (Array.isArray(options.fixedCenters) ? options.fixedCenters : []).map(validLab).filter(Boolean);
  const suppliedMovable = (Array.isArray(options.movableCenters) ? options.movableCenters : []).map(validLab).filter(Boolean);
  const requestedMovableCount = Math.max(0, Math.round(Number(options.movableCount ?? suppliedMovable.length) || 0));
  const targetMovableCount = Math.max(requestedMovableCount, suppliedMovable.length);
  const rng = seededRandom(Number(options.seed) || 1);
  const maxIterations = Math.max(1, Math.round(Number(options.maxIterations) || 28));
  const epsilon = Number.isFinite(Number(options.epsilon)) ? Math.max(0, Number(options.epsilon)) : 0.01;
  const snapToSamples = options.snapToSamples !== false;

  if (!targetMovableCount || !cleanSamples.length) {
    return {
      fixedCenters,
      movableCenters: [],
      rawMovableCenters: [],
      assignments: new Int32Array(cleanSamples.length).fill(-1),
      movableAssignmentIndexes: [],
      iterations: 0,
      changed: false
    };
  }

  const movableCenters = suppliedMovable.slice(0, targetMovableCount).map(lab => [...lab]);
  const usedSeedSamples = new Set();
  while (movableCenters.length < targetMovableCount) {
    const seeded = farthestSampleFromCenters(cleanSamples, fixedCenters.concat(movableCenters), usedSeedSamples, rng);
    if (!seeded.sample) break;
    usedSeedSamples.add(seeded.index);
    movableCenters.push(seeded.sample);
  }

  while (movableCenters.length < targetMovableCount) movableCenters.push([...cleanSamples[0]]);

  let assignments = new Int32Array(cleanSamples.length).fill(-1);
  let movableAssignmentIndexes = Array.from({length: movableCenters.length}, () => []);
  let changed = false;
  let iterations = 0;

  for (iterations = 0; iterations < maxIterations; iterations++) {
    const allCenters = fixedCenters.concat(movableCenters);
    const sums = movableCenters.map(() => [0, 0, 0]);
    const counts = new Array(movableCenters.length).fill(0);
    movableAssignmentIndexes = Array.from({length: movableCenters.length}, () => []);

    for (let sampleIndex = 0; sampleIndex < cleanSamples.length; sampleIndex++) {
      const nearest = nearestCenterIndex(cleanSamples[sampleIndex], allCenters);
      const movableIndex = nearest.index - fixedCenters.length;
      assignments[sampleIndex] = movableIndex >= 0 ? movableIndex : -1;
      if (movableIndex < 0) continue;
      const sum = sums[movableIndex];
      const sample = cleanSamples[sampleIndex];
      sum[0] += sample[0];
      sum[1] += sample[1];
      sum[2] += sample[2];
      counts[movableIndex] += 1;
      movableAssignmentIndexes[movableIndex].push(sampleIndex);
    }

    let maxMove = 0;
    const emptySeedIndexes = new Set();
    for (let centerIndex = 0; centerIndex < movableCenters.length; centerIndex++) {
      let next;
      if (counts[centerIndex] > 0) {
        next = [
          sums[centerIndex][0] / counts[centerIndex],
          sums[centerIndex][1] / counts[centerIndex],
          sums[centerIndex][2] / counts[centerIndex]
        ];
      } else {
        const seeded = farthestSampleFromCenters(cleanSamples, fixedCenters.concat(movableCenters), emptySeedIndexes, rng);
        next = seeded.sample || [...movableCenters[centerIndex]];
        if (seeded.index >= 0) emptySeedIndexes.add(seeded.index);
      }
      const move = squaredLabDistance(movableCenters[centerIndex], next);
      if (move > maxMove) maxMove = move;
      if (move > 0) changed = true;
      movableCenters[centerIndex] = next;
    }

    if (maxMove <= epsilon * epsilon) break;
  }

  const rawMovableCenters = movableCenters.map(lab => [...lab]);
  const snappedMovableCenters = snapToSamples
    ? rawMovableCenters.map((lab, index) => snapCenterToSample(lab, cleanSamples, movableAssignmentIndexes[index]))
    : rawMovableCenters.map(lab => [...lab]);

  return {
    fixedCenters,
    movableCenters: snappedMovableCenters,
    rawMovableCenters,
    assignments,
    movableAssignmentIndexes,
    iterations: Math.min(iterations + 1, maxIterations),
    changed
  };
}
