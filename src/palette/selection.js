import {
  DEFAULT_HUE_SPREAD_BONUS,
  HIGHLIGHT_L_CUTOFF,
  NOVELTY_BONUS,
  OKLAB_CHROMA_REF,
  RANGE_EXPANSION_BONUS,
  SELECTION_NOISE_AMOUNT,
  SHADOW_L_CUTOFF,
  TONAL_CROWDING_PENALTY,
  TONAL_NEED_BONUS,
  TOP_BAND_ABS_WINDOW,
  TOP_BAND_RATIO
} from "../constants.js";
import {
  clamp,
  familyDistance,
  familyFootprint,
  hueInfoForSeedLab,
  labDistance,
  labToHex,
  nearestHueAnchorMatch,
  seededRandom
} from "../color-utils.js";

export function meanLab(samples) {
  const sum = [0, 0, 0];
  for (const [L, a, b] of samples) {
    sum[0] += L; sum[1] += a; sum[2] += b;
  }
  const n = samples.length || 1;
  return [sum[0] / n, sum[1] / n, sum[2] / n];
}

export function baseScoreBreakdown(lab, center, weights = {chroma: 1, outlier: 0.7, midtone: 0.25}, chromaCap = OKLAB_CHROMA_REF, outlierCap = 80) {
  const [L, a, b] = lab;
  const C = Math.hypot(a, b);
  const chromaRaw = clamp(C / chromaCap, 0, 1);
  const outlierDistance = labDistance(lab, center);
  const outlierRaw = clamp(outlierDistance / outlierCap, 0, 1);
  const midtoneRaw = clamp(1 - Math.abs(L - 50) / 50, 0, 1);
  const chromaContribution = (Number(weights.chroma) || 0) * chromaRaw;
  const outlierContribution = (Number(weights.outlier) || 0) * outlierRaw;
  const midtoneContribution = (Number(weights.midtone) || 0) * midtoneRaw;
  return {
    total: chromaContribution + outlierContribution + midtoneContribution,
    chromaRaw,
    chromaContribution,
    outlierRaw,
    outlierContribution,
    outlierDistance,
    midtoneRaw,
    midtoneContribution,
    chroma: C,
    L
  };
}

export function baseScore(lab, center, weights = {chroma: 1, outlier: 0.7, midtone: 0.25}, chromaCap = OKLAB_CHROMA_REF, outlierCap = 80) {
  return baseScoreBreakdown(lab, center, weights, chromaCap, outlierCap).total;
}

export function tonalBandIndex(L) {
  if (L < SHADOW_L_CUTOFF) return 0;
  if (L > HIGHLIGHT_L_CUTOFF) return 2;
  return 1;
}

export function targetBandCounts(N) {
  if (N <= 1) return [0, 1, 0];
  if (N === 2) return [1, 0, 1];
  return [1, N - 2, 1];
}

function weightedPick(entries, rng) {
  if (entries.length === 0) return null;
  let total = 0;
  const weights = entries.map(entry => {
    const weight = Math.max(entry.marginalScore - entry.bandThreshold, 0) + 1e-4;
    total += weight;
    return weight;
  });
  let draw = rng() * total;
  for (let i = 0; i < entries.length; i++) {
    draw -= weights[i];
    if (draw <= 0) return entries[i];
  }
  return entries[entries.length - 1];
}

export function selectionBandName(index) {
  return index === 0 ? "shadow" : (index === 2 ? "highlight" : "midtone");
}

function scoredCandidateSummary(entry, rank = null) {
  const family = entry.family || familyFootprint(entry.lab);
  const spacingRelaxed = !!entry.spacingRelaxed;
  const belowSpacingTarget = !!entry.blockedBySpacing;
  const blockedBySpacing = belowSpacingTarget && !spacingRelaxed;
  const reason = blockedBySpacing
    ? "blocked by family spacing"
    : (belowSpacingTarget && spacingRelaxed
      ? "eligible after spacing relaxation"
      : (entry.marginalScore >= entry.bandThreshold ? "inside weighted lottery band" : "below lottery band"));
  return {
    index: entry.index,
    rank,
    hex: labToHex(entry.lab),
    familyHexes: family.map(labToHex),
    band: selectionBandName(entry.band ?? tonalBandIndex(entry.lab[0])),
    baseScore: entry.baseScore,
    marginalScore: entry.marginalScore,
    nearestFamilyDistance: entry.nearestFamilyDistance,
    hueNearestDistanceDegrees: entry.hueNearestDistanceDegrees,
    hueSpread: entry.hueNovelty,
    blockedBySpacing,
    belowSpacingTarget,
    spacingRelaxed,
    reason
  };
}

function selectionTraceBadge(parts, spacing) {
  const badges = [];
  const strongestBase = [
    ["chroma", parts.chromaContribution],
    ["outlier", parts.outlierContribution],
    ["midtone", parts.midtoneContribution]
  ].sort((a, b) => b[1] - a[1])[0];
  if (strongestBase && strongestBase[1] > 0.08) badges.push(`${strongestBase[0]} led base appeal`);
  if (parts.tonalNeedContribution > 0.08) badges.push(`filled ${parts.band} target`);
  if (parts.rangeExpansionContribution > 0.06) badges.push("expanded lightness range");
  if (parts.hueSpreadContribution > 0.04) badges.push("expanded hue spread");
  if (parts.noveltyContribution > 0.06) badges.push("kept family footprint apart");
  if (spacing?.relaxed) badges.push("family spacing relaxed");
  if (parts.noiseContribution > SELECTION_NOISE_AMOUNT * 0.7) badges.push("seeded jitter helped");
  return badges.slice(0, 5);
}

function updateNearestFamilyMatches(entries, selectedFamily, selectedFamilyIndex, nearestFamilyByIndex) {
  for (const entry of entries) {
    const distance = familyDistance(entry.family, selectedFamily);
    const nearest = nearestFamilyByIndex[entry.index];
    if (distance < nearest.distance) {
      nearest.distance = distance;
      nearest.index = selectedFamilyIndex;
    }
  }
}

export function selectTopNScoredSwatches(candidates, weights, N, minDistance = 14, seed = 1, options = {}) {
  const center = meanLab(candidates);
  const footprintDeltaL = Number.isFinite(Number(options.deltaL)) ? Number(options.deltaL) : 10;
  const footprintChromaExp = Number.isFinite(Number(options.chromaExp)) ? Number(options.chromaExp) : 1.0;
  const baseScored = candidates.map((lab, index) => {
    const score = baseScoreBreakdown(lab, center, weights);
    return {
      lab,
      index,
      baseScore: score.total,
      baseParts: score,
      family: familyFootprint(lab, footprintDeltaL, footprintChromaExp),
      hueCandidate: hueInfoForSeedLab(lab)
    };
  });
  const rng = seededRandom(seed);
  const hueSpreadBonus = clamp(Number(options.hueSpread ?? DEFAULT_HUE_SPREAD_BONUS) || 0, 0, 0.5);
  const trace = Array.isArray(options.trace) ? options.trace : null;
  const initialSelected = Array.isArray(options.initialSelected)
    ? options.initialSelected.map(lab => [...lab]).slice(0, Math.max(0, N))
    : [];
  const selected = [...initialSelected];
  const selectedFamilies = selected.map(lab => familyFootprint(lab, footprintDeltaL, footprintChromaExp));
  const selectedHueAnchors = selected.map(hueInfoForSeedLab);
  const nearestFamilyByIndex = candidates.map(() => ({distance: Infinity, index: -1}));
  selectedFamilies.forEach((family, index) => {
    updateNearestFamilyMatches(baseScored, family, index, nearestFamilyByIndex);
  });
  const used = new Set();
  const bandCounts = [0, 0, 0];
  selected.forEach(([L]) => { bandCounts[tonalBandIndex(L)] += 1; });
  const desiredBandCounts = targetBandCounts(N);

  if (trace) {
    trace.length = 0;
    trace.push({
      type: "settings",
      baseCount: N,
      familySpacing: minDistance,
      candidateCount: candidates.length,
      centerLab: [...center],
      centerHex: labToHex(center),
      weights: {...weights},
      expansion: {deltaL: footprintDeltaL, chromaExp: footprintChromaExp},
      tonalTargets: desiredBandCounts.map((count, index) => ({band: selectionBandName(index), count})),
      constants: {
        tonalNeedBonus: TONAL_NEED_BONUS,
        tonalCrowdingPenalty: TONAL_CROWDING_PENALTY,
        rangeExpansionBonus: RANGE_EXPANSION_BONUS,
        noveltyBonus: NOVELTY_BONUS,
        hueSpreadBonus,
        hueReliabilityChromaLow: 6,
        hueReliabilityChromaHigh: 22,
        selectionNoiseAmount: SELECTION_NOISE_AMOUNT,
        topBandRatio: TOP_BAND_RATIO,
        topBandAbsWindow: TOP_BAND_ABS_WINDOW
      },
      rounds: []
    });
  }
  const traceRoot = trace ? trace[0] : null;

  for (let slot = selected.length; slot < N; slot++) {
    const remaining = baseScored.filter(entry => !used.has(entry.index));
    if (!remaining.length) break;
    const selectedFamilyHexes = selectedFamilies.map(family => family.map(labToHex));
    const bandCountsBefore = [...bandCounts];
    const remainingWithFamilies = remaining.map(entry => {
      const nearest = nearestFamilyByIndex[entry.index];
      const hueNearest = nearestHueAnchorMatch(entry.hueCandidate, selectedHueAnchors);
      return {
        ...entry,
        nearestFamilyDistance: nearest.distance,
        nearestFamilyIndex: nearest.index,
        hueNovelty: hueNearest.raw,
        hueNearestDistanceDegrees: hueNearest.distanceDegrees,
        hueNearestFamilyIndex: hueNearest.index,
        hueAnchorCount: hueNearest.anchorCount,
        hueReliableAnchorCount: hueNearest.reliableAnchorCount,
        hueCandidateChroma: hueNearest.candidateChroma,
        hueReliability: hueNearest.candidateReliability,
        hueAnchorReliability: hueNearest.anchorReliability,
        blockedBySpacing: selectedFamilies.length > 0 && nearest.distance < minDistance
      };
    });
    const farEnough = remainingWithFamilies.filter(entry => !entry.blockedBySpacing);
    const spacingRelaxed = selectedFamilies.length > 0 && farEnough.length === 0;
    const pool = spacingRelaxed ? remainingWithFamilies : farEnough;
    const bestAvailableSpacing = selectedFamilies.length
      ? Math.max(...remainingWithFamilies.map(entry => entry.nearestFamilyDistance).filter(Number.isFinite), 0)
      : Infinity;
    const currentLows = selected.map(([L]) => L);
    const minL = currentLows.length ? Math.min(...currentLows) : null;
    const maxL = currentLows.length ? Math.max(...currentLows) : null;
    const ranked = pool.map(entry => {
      const [L] = entry.lab;
      const band = tonalBandIndex(L);
      const bandTarget = desiredBandCounts[band];
      const bandCount = bandCounts[band];
      const bandNeed = bandTarget > 0 ? clamp((bandTarget - bandCount) / bandTarget, 0, 1) : 0;
      const crowding = bandTarget > 0 ? Math.max(0, bandCount - bandTarget + 1) / Math.max(1, N) : bandCount > 0 ? bandCount / Math.max(1, N) : 0;
      let rangeExpansion = 0;
      if (minL !== null && maxL !== null) {
        if (L < minL) rangeExpansion = clamp((minL - L) / 50, 0, 1);
        else if (L > maxL) rangeExpansion = clamp((L - maxL) / 50, 0, 1);
      }
      const novelty = selectedFamilies.length ? clamp(entry.nearestFamilyDistance / 40, 0, 1) : 0;
      const noiseContribution = rng() * SELECTION_NOISE_AMOUNT;
      const parts = {
        ...entry.baseParts,
        band: selectionBandName(band),
        bandNeed,
        crowding,
        rangeExpansion,
        novelty,
        hueSpread: entry.hueNovelty || 0,
        hueNearestDistanceDegrees: entry.hueNearestDistanceDegrees,
        hueCandidateChroma: entry.hueCandidateChroma,
        hueReliability: entry.hueReliability,
        hueAnchorReliability: entry.hueAnchorReliability,
        hueAnchorCount: entry.hueAnchorCount,
        hueReliableAnchorCount: entry.hueReliableAnchorCount,
        tonalNeedContribution: bandNeed * TONAL_NEED_BONUS,
        crowdingPenalty: crowding * TONAL_CROWDING_PENALTY,
        rangeExpansionContribution: rangeExpansion * RANGE_EXPANSION_BONUS,
        noveltyContribution: novelty * NOVELTY_BONUS,
        hueSpreadContribution: (entry.hueNovelty || 0) * hueSpreadBonus,
        noiseContribution
      };
      const marginalScore = entry.baseScore
        + parts.tonalNeedContribution
        - parts.crowdingPenalty
        + parts.rangeExpansionContribution
        + parts.noveltyContribution
        + parts.hueSpreadContribution
        + noiseContribution;
      return {...entry, band, marginalScore, parts, spacingRelaxed};
    }).sort((a, b) => (b.marginalScore - a.marginalScore) || (b.baseScore - a.baseScore) || (a.index - b.index));

    const crowdingPenalties = ranked.map(entry => entry.parts?.crowdingPenalty || 0);
    const crowdingStats = {
      penalizedCandidateCount: crowdingPenalties.filter(value => value > 0).length,
      maxPenalty: crowdingPenalties.length ? Math.max(...crowdingPenalties) : 0,
      averagePenalty: crowdingPenalties.length ? crowdingPenalties.reduce((sum, value) => sum + value, 0) / crowdingPenalties.length : 0,
      poolSize: ranked.length
    };
    const hueSpreadValues = ranked.map(entry => entry.parts?.hueSpreadContribution || 0);
    const hueStats = {
      reliableAnchorCount: selectedHueAnchors.filter(anchor => anchor.reliability > 0.08).length,
      reliableCandidateCount: ranked.filter(entry => (entry.hueReliability || 0) > 0.01).length,
      positiveCandidateCount: hueSpreadValues.filter(value => value > 0).length,
      maxContribution: hueSpreadValues.length ? Math.max(...hueSpreadValues) : 0,
      averageContribution: hueSpreadValues.length ? hueSpreadValues.reduce((sum, value) => sum + value, 0) / hueSpreadValues.length : 0,
      poolSize: ranked.length
    };

    const bestScore = ranked[0].marginalScore;
    const threshold = Math.max(bestScore * TOP_BAND_RATIO, bestScore - TOP_BAND_ABS_WINDOW);
    const topBand = ranked.filter(entry => entry.marginalScore >= threshold).map(entry => ({...entry, bandThreshold: threshold}));
    const picked = weightedPick(topBand, rng) ?? ranked[0];
    const pickedRank = ranked.findIndex(entry => entry.index === picked.index) + 1;
    const pickedWithThreshold = {...picked, bandThreshold: threshold};

    if (traceRoot) {
      const blocked = spacingRelaxed
        ? []
        : remainingWithFamilies
          .filter(entry => entry.blockedBySpacing)
          .sort((a, b) => a.nearestFamilyDistance - b.nearestFamilyDistance || a.index - b.index)
          .slice(0, 5)
          .map((entry, index) => scoredCandidateSummary({...entry, spacingRelaxed}, index + 1));
      const belowTargetCandidateCount = remainingWithFamilies.length - farEnough.length;
      traceRoot.rounds.push({
        slot,
        bandCountsBefore,
        desiredBandCounts: [...desiredBandCounts],
        selectedFamilyHexes,
        lightnessRangeBefore: minL === null ? null : {min: minL, max: maxL},
        spacing: {
          requested: minDistance,
          selectedFamilyCount: selectedFamilies.length,
          enforced: !spacingRelaxed,
          relaxed: spacingRelaxed,
          legalCandidateCount: farEnough.length,
          blockedCandidateCount: spacingRelaxed ? 0 : belowTargetCandidateCount,
          belowTargetCandidateCount,
          poolSize: pool.length,
          nearestAcceptedDistance: picked.nearestFamilyDistance,
          nearestAcceptedFamilyIndex: picked.nearestFamilyIndex,
          bestAvailableDistance: bestAvailableSpacing,
          pickedSatisfaction: selectedFamilies.length ? clamp(picked.nearestFamilyDistance / Math.max(minDistance, 1e-6), 0, 1) : 1
        },
        crowding: crowdingStats,
        hue: hueStats,
        lottery: {
          bestScore,
          threshold,
          topBandRatio: TOP_BAND_RATIO,
          topBandAbsWindow: TOP_BAND_ABS_WINDOW,
          topBandSize: topBand.length,
          pickedRank,
          pickedBest: pickedRank === 1,
          pickedByWeightedLottery: pickedRank !== 1
        },
        picked: {
          ...scoredCandidateSummary(pickedWithThreshold, pickedRank),
          lab: [...picked.lab],
          parts: {...picked.parts},
          badges: selectionTraceBadge(picked.parts, {relaxed: spacingRelaxed})
        },
        nearMisses: ranked.slice(0, 6).map((entry, index) => scoredCandidateSummary({...entry, bandThreshold: threshold}, index + 1)),
        blockedNearMisses: blocked
      });
    }

    selected.push(picked.lab);
    const pickedFamilyIndex = selectedFamilies.length;
    const pickedFamily = picked.family ?? familyFootprint(picked.lab, footprintDeltaL, footprintChromaExp);
    selectedFamilies.push(pickedFamily);
    selectedHueAnchors.push(hueInfoForSeedLab(picked.lab));
    used.add(picked.index);
    bandCounts[picked.band] += 1;
    if (selected.length < N) {
      updateNearestFamilyMatches(
        baseScored.filter(entry => !used.has(entry.index)),
        pickedFamily,
        pickedFamilyIndex,
        nearestFamilyByIndex
      );
    }
  }

  if (selected.length >= N) return selected;
  for (const entry of baseScored.sort((a, b) => b.baseScore - a.baseScore)) {
    if (selected.length >= N) break;
    if (used.has(entry.index)) continue;
    selected.push(entry.lab);
    selectedFamilies.push(familyFootprint(entry.lab, footprintDeltaL, footprintChromaExp));
    selectedHueAnchors.push(hueInfoForSeedLab(entry.lab));
    used.add(entry.index);
    if (traceRoot) {
      traceRoot.rounds.push({
        slot: selected.length - 1,
        fallbackFill: true,
        picked: {
          index: entry.index,
          rank: null,
          hex: labToHex(entry.lab),
          familyHexes: familyFootprint(entry.lab, footprintDeltaL, footprintChromaExp).map(labToHex),
          band: selectionBandName(tonalBandIndex(entry.lab[0])),
          baseScore: entry.baseScore,
          marginalScore: entry.baseScore,
          parts: {...entry.baseParts},
          badges: ["fallback base-score fill"]
        },
        nearMisses: [],
        blockedNearMisses: []
      });
    }
  }
  return selected.slice(0, N);
}
