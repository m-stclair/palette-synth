const SPACING_RELAXATION_RATIO = 0.9;

import {
  DEFAULT_HUE_SPREAD_BONUS,
  HIGHLIGHT_L_CUTOFF,
  NOVELTY_BONUS,
  OKLAB_CHROMA_REF,
  RANGE_EXPANSION_BONUS,
  SELECTION_NOISE_AMOUNT,
  SELECTION_TIE_BREAK_MARGIN,
  SHADOW_L_CUTOFF,
  TONAL_CROWDING_PENALTY,
  TONAL_NEED_BONUS
} from "../constants.js";
import {
  clamp,
  familyDistance,
  familyFootprint,
  hueInfoForSeedLab,
  labDistance,
  labToHex,
  nearestHueAnchorMatchPrepared,
  reliableHueAnchors,
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

export function targetBandCounts(N, options = {}) {
  const directColorTargets = options && typeof options === "object" && options.directColorTargets === true;
  const targetBoost = options && typeof options === "object"
    ? Math.max(0, Math.round(Number(options.boost) || 0))
    : Math.max(0, Math.round(Number(options) || 0));
  const directEndpointCount = directColorTargets && N >= 3
    ? Math.max(1, Math.floor((N - 1) / 6) + 1)
    : 0;
  const counts = directEndpointCount
    ? [directEndpointCount, Math.min(N - directEndpointCount * 2, directEndpointCount * 2), directEndpointCount]
    : (N <= 1
      ? [0, 1, 0]
      : (N === 2 ? [1, 0, 1] : [1, N - 2, 1]));
  return targetBoost ? counts.map(count => count + targetBoost) : counts;
}

export function selectionBandName(index) {
  return index === 0 ? "shadow" : (index === 2 ? "highlight" : "midtone");
}

function scoredCandidateSummary(entry, rank = null) {
  const familySpacing = entry.familySpacing !== false;
  const family = entry.family || (familySpacing ? familyFootprint(entry.lab) : [entry.lab]);
  const spacingLabel = familySpacing ? "family" : "color";
  const spacingRelaxed = !!entry.spacingRelaxed;
  const belowSpacingTarget = !!entry.blockedBySpacing;
  const blockedBySpacing = belowSpacingTarget && !spacingRelaxed;
  const reason = blockedBySpacing
    ? `blocked by ${spacingLabel} spacing`
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
  const spacingLabel = spacing?.familySpacing === false ? "color" : "family";
  if (parts.noveltyContribution > 0.06) badges.push(spacing?.familySpacing === false ? "kept colors apart" : "kept family footprint apart");
  if (spacing?.relaxed) badges.push(`${spacingLabel} spacing relaxed`);
  if (parts.noiseContribution > SELECTION_NOISE_AMOUNT * 0.7) badges.push("seeded jitter helped");
  return badges.slice(0, 5);
}

function compareRankedCandidates(a, b) {
  return (b.marginalScore - a.marginalScore) || (b.baseScore - a.baseScore) || (a.index - b.index);
}

function updateNearestFamilyMatches(entries, selectedFamily, selectedFamilyIndex, nearestFamilyByIndex, usedFlags = null) {
  for (const entry of entries) {
    if (usedFlags?.[entry.index]) continue;
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
  const familySpacing = options.familySpacing !== false;
  const spacingFootprint = lab => familySpacing ? familyFootprint(lab, footprintDeltaL, footprintChromaExp) : [lab];
  const baseScored = candidates.map((lab, index) => {
    const score = baseScoreBreakdown(lab, center, weights);
    return {
      lab,
      index,
      baseScore: score.total,
      baseParts: score,
      family: spacingFootprint(lab),
      familySpacing,
      hueCandidate: hueInfoForSeedLab(lab)
    };
  });
  const rng = seededRandom(seed);
  const hueSpreadBonus = clamp(Number(options.hueSpread ?? DEFAULT_HUE_SPREAD_BONUS) || 0, 0, 0.5);
  const rawTonalZoneWeight = Number(options.tonalZoneWeight ?? options.tonalNeedBonusWeight ?? 1);
  const tonalZoneWeight = clamp(Number.isFinite(rawTonalZoneWeight) ? rawTonalZoneWeight : 1, 0, 2);
  const tonalNeedBonus = TONAL_NEED_BONUS * tonalZoneWeight;
  const tonalCrowdingPenalty = TONAL_CROWDING_PENALTY * tonalZoneWeight;
  const rawWidthBonus = Number(options.widthBonus ?? 1);
  const widthBonus = clamp(Number.isFinite(rawWidthBonus) ? rawWidthBonus : 1, 0, 2);
  const rangeExpansionBonus = RANGE_EXPANSION_BONUS * widthBonus;
  const noveltyBonus = NOVELTY_BONUS * widthBonus;
  const trace = Array.isArray(options.trace) ? options.trace : null;
  const initialSelected = Array.isArray(options.initialSelected)
    ? options.initialSelected.map(lab => [...lab]).slice(0, Math.max(0, N))
    : [];
  const selected = [...initialSelected];
  const selectedFamilies = selected.map(spacingFootprint);
  const selectedHueAnchors = selected.map(hueInfoForSeedLab);
  const nearestFamilyByIndex = candidates.map(() => ({distance: Infinity, index: -1}));
  selectedFamilies.forEach((family, index) => {
    updateNearestFamilyMatches(baseScored, family, index, nearestFamilyByIndex);
  });
  const usedFlags = new Uint8Array(candidates.length);
  const bandCounts = [0, 0, 0];
  selected.forEach(([L]) => { bandCounts[tonalBandIndex(L)] += 1; });
  const directColorTargets = options.directColorTargets === true;
  const tonalTargetBoost = Math.max(0, Math.round(Number(options.tonalTargetBoost) || 0));
  const desiredBandCounts = targetBandCounts(N, {directColorTargets, boost: tonalTargetBoost});

  if (trace) {
    trace.length = 0;
    trace.push({
      type: "settings",
      baseCount: N,
      spacingMode: familySpacing ? "family" : "color",
      familySpacing: minDistance,
      colorSpacing: familySpacing ? null : minDistance,
      candidateCount: candidates.length,
      centerLab: [...center],
      centerHex: labToHex(center),
      weights: {...weights},
      expansion: familySpacing ? {deltaL: footprintDeltaL, chromaExp: footprintChromaExp} : null,
      tonalTargets: desiredBandCounts.map((count, index) => ({band: selectionBandName(index), count})),
      tonalTargetMode: directColorTargets ? "direct-colors" : "family-seeds",
      tonalTargetBoost,
      constants: {
        tonalZoneWeight,
        tonalNeedBonus,
        tonalNeedBonusBase: TONAL_NEED_BONUS,
        tonalCrowdingPenalty,
        tonalCrowdingPenaltyBase: TONAL_CROWDING_PENALTY,
        widthBonus,
        rangeExpansionBonus,
        rangeExpansionBonusBase: RANGE_EXPANSION_BONUS,
        noveltyBonus,
        noveltyBonusBase: NOVELTY_BONUS,
        hueSpreadBonus,
        hueReliabilityChromaLow: 6,
        hueReliabilityChromaHigh: 22,
        selectionNoiseAmount: SELECTION_NOISE_AMOUNT,
        selectionTieBreakMargin: SELECTION_TIE_BREAK_MARGIN
      },
      rounds: []
    });
  }
  const traceRoot = trace ? trace[0] : null;

  for (let slot = selected.length; slot < N; slot++) {
    const remainingWithFamilies = [];
    const farEnough = [];
    let bestAvailableSpacing = selectedFamilies.length ? 0 : Infinity;
    let finiteSpacingCount = 0;

    for (const entry of baseScored) {
      if (usedFlags[entry.index]) continue;
      const nearest = nearestFamilyByIndex[entry.index];
      const nearestFamilyDistance = nearest.distance;
      const blockedBySpacing = selectedFamilies.length > 0 && nearestFamilyDistance < minDistance;
      const spacingEntry = {
        ...entry,
        nearestFamilyDistance,
        nearestFamilyIndex: nearest.index,
        blockedBySpacing
      };
      remainingWithFamilies.push(spacingEntry);
      if (Number.isFinite(nearestFamilyDistance)) {
        finiteSpacingCount += 1;
        if (nearestFamilyDistance > bestAvailableSpacing) bestAvailableSpacing = nearestFamilyDistance;
      }
      if (!blockedBySpacing) farEnough.push(spacingEntry);
    }

    if (!remainingWithFamilies.length) break;
    if (!selectedFamilies.length || !finiteSpacingCount) bestAvailableSpacing = Infinity;

    const spacingRelaxed = selectedFamilies.length > 0 && farEnough.length === 0;
    const effectiveSpacingTarget = spacingRelaxed && Number.isFinite(bestAvailableSpacing)
      ? bestAvailableSpacing * SPACING_RELAXATION_RATIO
      : minDistance;
    const poolBase = spacingRelaxed
      ? remainingWithFamilies.filter(entry => entry.nearestFamilyDistance >= effectiveSpacingTarget)
      : farEnough;
    if (!poolBase.length) break;

    const currentLows = selected.map(([L]) => L);
    const minL = currentLows.length ? Math.min(...currentLows) : null;
    const maxL = currentLows.length ? Math.max(...currentLows) : null;
    const preparedHueAnchors = reliableHueAnchors(selectedHueAnchors);
    const hueAnchorCount = selectedHueAnchors.length;
    const scored = [];

    for (const entry of poolBase) {
      const hueNearest = nearestHueAnchorMatchPrepared(entry.hueCandidate, hueAnchorCount, preparedHueAnchors);
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
      const hueNovelty = hueNearest.raw;
      const noiseContribution = rng() * SELECTION_NOISE_AMOUNT;
      const parts = {
        ...entry.baseParts,
        band: selectionBandName(band),
        bandNeed,
        crowding,
        rangeExpansion,
        novelty,
        hueSpread: hueNovelty,
        hueNearestDistanceDegrees: hueNearest.distanceDegrees,
        hueCandidateChroma: hueNearest.candidateChroma,
        hueReliability: hueNearest.candidateReliability,
        hueAnchorReliability: hueNearest.anchorReliability,
        hueAnchorCount: hueNearest.anchorCount,
        hueReliableAnchorCount: hueNearest.reliableAnchorCount,
        tonalNeedContribution: bandNeed * tonalNeedBonus,
        crowdingPenalty: crowding * tonalCrowdingPenalty,
        rangeExpansionContribution: rangeExpansion * rangeExpansionBonus,
        noveltyContribution: novelty * noveltyBonus,
        hueSpreadContribution: hueNovelty * hueSpreadBonus,
        noiseContribution
      };
      const featureScore = entry.baseScore
        + parts.tonalNeedContribution
        - parts.crowdingPenalty
        + parts.rangeExpansionContribution
        + parts.noveltyContribution
        + parts.hueSpreadContribution;
      scored.push({
        ...entry,
        band,
        featureScore,
        marginalScore: featureScore,
        parts,
        spacingRelaxed,
        hueNovelty,
        hueNearestDistanceDegrees: hueNearest.distanceDegrees,
        hueNearestFamilyIndex: hueNearest.index,
        hueAnchorCount: hueNearest.anchorCount,
        hueReliableAnchorCount: hueNearest.reliableAnchorCount,
        hueCandidateChroma: hueNearest.candidateChroma,
        hueReliability: hueNearest.candidateReliability,
        hueAnchorReliability: hueNearest.anchorReliability
      });
    }

    let best = scored[0];
    for (let i = 1; i < scored.length; i++) {
      if (compareRankedCandidates(scored[i], best) < 0) best = scored[i];
    }
    const bestScore = best.featureScore;
    const threshold = bestScore - SELECTION_TIE_BREAK_MARGIN;
    const topBand = scored
      .filter(entry => entry.featureScore >= threshold)
      .map(entry => ({...entry, bandThreshold: threshold}))
      .sort(compareRankedCandidates);
    const picked = topBand.slice().sort((a, b) =>
      (b.parts.noiseContribution - a.parts.noiseContribution)
      || compareRankedCandidates(a, b)
    )[0] ?? {...best, bandThreshold: threshold};
    rng();

    if (traceRoot) {
      const ranked = [...scored].sort(compareRankedCandidates);
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
      const effectiveBlocked = selectedFamilies.length
        ? remainingWithFamilies.filter(entry => entry.nearestFamilyDistance < effectiveSpacingTarget)
        : [];
      const blockedSource = spacingRelaxed ? effectiveBlocked : remainingWithFamilies.filter(entry => entry.blockedBySpacing);
      const blocked = blockedSource
        .map(entry => {
          const hueNearest = nearestHueAnchorMatchPrepared(entry.hueCandidate, hueAnchorCount, preparedHueAnchors);
          return {
            ...entry,
            hueNovelty: hueNearest.raw,
            hueNearestDistanceDegrees: hueNearest.distanceDegrees,
            hueNearestFamilyIndex: hueNearest.index,
            hueAnchorCount: hueNearest.anchorCount,
            hueReliableAnchorCount: hueNearest.reliableAnchorCount,
            hueCandidateChroma: hueNearest.candidateChroma,
            hueReliability: hueNearest.candidateReliability,
            hueAnchorReliability: hueNearest.anchorReliability
          };
        })
        .sort((a, b) => a.nearestFamilyDistance - b.nearestFamilyDistance || a.index - b.index)
        .slice(0, 5)
        .map((entry, index) => scoredCandidateSummary({...entry, spacingRelaxed: false}, index + 1));
      const belowTargetCandidateCount = remainingWithFamilies.length - farEnough.length;
      const blockedCandidateCount = spacingRelaxed ? effectiveBlocked.length : belowTargetCandidateCount;
      const pickedRank = ranked.findIndex(entry => entry.index === picked.index) + 1;
      const pickedWithThreshold = {...picked, bandThreshold: threshold};
      traceRoot.rounds.push({
        slot,
        bandCountsBefore: [...bandCounts],
        desiredBandCounts: [...desiredBandCounts],
        selectedFamilyHexes: selectedFamilies.map(family => family.map(labToHex)),
        lightnessRangeBefore: minL === null ? null : {min: minL, max: maxL},
        spacing: {
          requested: minDistance,
          effectiveTarget: effectiveSpacingTarget,
          relaxationRatio: spacingRelaxed ? SPACING_RELAXATION_RATIO : 1,
          selectedFamilyCount: selectedFamilies.length,
          enforced: !spacingRelaxed,
          relaxed: spacingRelaxed,
          legalCandidateCount: poolBase.length,
          blockedCandidateCount,
          belowTargetCandidateCount,
          belowEffectiveTargetCandidateCount: effectiveBlocked.length,
          poolSize: poolBase.length,
          nearestAcceptedDistance: picked.nearestFamilyDistance,
          nearestAcceptedFamilyIndex: picked.nearestFamilyIndex,
          bestAvailableDistance: bestAvailableSpacing,
          pickedSatisfaction: selectedFamilies.length ? clamp(picked.nearestFamilyDistance / Math.max(effectiveSpacingTarget, 1e-6), 0, 1) : 1,
          pickedRequestedSatisfaction: selectedFamilies.length ? clamp(picked.nearestFamilyDistance / Math.max(minDistance, 1e-6), 0, 1) : 1
        },
        crowding: crowdingStats,
        hue: hueStats,
        lottery: {
          bestScore,
          threshold,
          topBandSize: topBand.length,
          pickedRank,
          pickedBest: pickedRank === 1,
          pickedByWeightedLottery: false,
          pickedBySeedTieBreak: pickedRank !== 1,
          tieBreakMargin: SELECTION_TIE_BREAK_MARGIN,
          tieBreakMode: "near-tie seeded jitter"
        },
        picked: {
          ...scoredCandidateSummary(pickedWithThreshold, pickedRank),
          lab: [...picked.lab],
          parts: {...picked.parts},
          badges: selectionTraceBadge(picked.parts, {relaxed: spacingRelaxed, familySpacing})
        },
        nearMisses: ranked.slice(0, 6).map((entry, index) => scoredCandidateSummary({...entry, bandThreshold: threshold}, index + 1)),
        blockedNearMisses: blocked
      });
    }

    selected.push(picked.lab);
    const pickedFamilyIndex = selectedFamilies.length;
    const pickedFamily = picked.family ?? spacingFootprint(picked.lab);
    selectedFamilies.push(pickedFamily);
    selectedHueAnchors.push(hueInfoForSeedLab(picked.lab));
    usedFlags[picked.index] = 1;
    bandCounts[picked.band] += 1;
    if (selected.length < N) {
      updateNearestFamilyMatches(
        baseScored,
        pickedFamily,
        pickedFamilyIndex,
        nearestFamilyByIndex,
        usedFlags
      );
    }
  }

  if (selected.length >= N) return selected;
  for (const entry of [...baseScored].sort((a, b) => b.baseScore - a.baseScore)) {
    if (selected.length >= N) break;
    if (usedFlags[entry.index]) continue;
    selected.push(entry.lab);
    selectedFamilies.push(entry.family ?? spacingFootprint(entry.lab));
    selectedHueAnchors.push(hueInfoForSeedLab(entry.lab));
    usedFlags[entry.index] = 1;
    if (traceRoot) {
      const family = entry.family ?? spacingFootprint(entry.lab);
      traceRoot.rounds.push({
        slot: selected.length - 1,
        fallbackFill: true,
        picked: {
          index: entry.index,
          rank: null,
          hex: labToHex(entry.lab),
          familyHexes: family.map(labToHex),
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
