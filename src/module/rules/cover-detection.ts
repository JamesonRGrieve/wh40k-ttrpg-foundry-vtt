/**
 * Line-of-sight + full/half cover DETECTION from attacker→target geometry (#406).
 *
 * Distinct from `cover.ts` (#110), which models the AP a placed cover grants and
 * its degradation. This module holds the PURE decision logic for *auto-detecting*
 * cover: given how many of the sample rays cast from the attacker to points across
 * the target's footprint are blocked (by walls / intervening tokens), it
 * classifies line of sight and cover (none / half / full) and maps a level to the
 * existing cover situational key (`attack-options.ts`: `coverMedium` +6 AP for
 * half, `coverHeavy` for full).
 *
 * The Foundry-coupled ray-casting that produces the blocked/total counts lives at
 * the dialog boundary — it can't be unit-tested and needs live/e2e verification;
 * isolating the thresholds + mapping here keeps the tunable, checkable part
 * testable. Content-agnostic system mechanics, not compendium content (#7).
 */

/** Cover classification derived from the blocked-ray fraction. */
export type DetectedCoverLevel = 'none' | 'half' | 'full';

/** At/above this blocked fraction the target is in full cover. */
export const FULL_COVER_THRESHOLD = 0.75;
/** At/above this blocked fraction (but below full) the target is in half cover. */
export const HALF_COVER_THRESHOLD = 0.25;

/**
 * Classify cover from the fraction (0–1) of attacker→target sample rays blocked
 * by walls/tokens: `>= 0.75` full, `>= 0.25` half, otherwise none. Pure.
 */
export function coverLevelFromBlockedFraction(blockedFraction: number): DetectedCoverLevel {
    if (blockedFraction >= FULL_COVER_THRESHOLD) return 'full';
    if (blockedFraction >= HALF_COVER_THRESHOLD) return 'half';
    return 'none';
}

/**
 * The cover situational-modifier key for a detected level: half → `coverMedium`
 * (+6 AP), full → `coverHeavy`; `none` → null. The AP value lives on the
 * situational registry, never here.
 */
export function coverSituationalKey(level: DetectedCoverLevel): 'coverMedium' | 'coverHeavy' | null {
    if (level === 'full') return 'coverHeavy';
    if (level === 'half') return 'coverMedium';
    return null;
}

/**
 * Line of sight: the target is visible when at least one sample ray reaches it
 * unobstructed (not every ray is blocked). Pure.
 */
export function hasLineOfSight(blockedRays: number, totalRays: number): boolean {
    return totalRays > 0 && blockedRays < totalRays;
}

/** Combined LoS + cover result for a target, derived from the ray counts. */
export interface TargetVisibility {
    hasLineOfSight: boolean;
    cover: DetectedCoverLevel;
    coverKey: 'coverMedium' | 'coverHeavy' | null;
}

/**
 * Resolve line of sight + cover from the sample-ray counts. `coveredRays` are
 * rays no wall stops but that pass low cover near the target (a table, a pew,
 * rubble a scene marks as cover): they count toward cover, never against line
 * of sight. When every ray is blocked there is no line of sight and cover
 * reports `full` (the caller decides whether to block the shot or treat it as
 * firing blind). Pure.
 */
export function resolveTargetVisibility(blockedRays: number, totalRays: number, coveredRays = 0): TargetVisibility {
    const los = hasLineOfSight(blockedRays, totalRays);
    const fraction = totalRays > 0 ? Math.min(totalRays, blockedRays + coveredRays) / totalRays : 0;
    const cover = coverLevelFromBlockedFraction(fraction);
    return { hasLineOfSight: los, cover, coverKey: coverSituationalKey(cover) };
}

/** A point on the canvas, in scene pixels. */
export interface CoverPoint {
    x: number;
    y: number;
}

/** An edge of low cover a scene marks, with its grade (0 none to 1 full). */
export interface CoverEdge {
    a: CoverPoint;
    b: CoverPoint;
    grade: number;
}

/** The least grade of marked cover that shields a target at all: half cover. */
export const LEAST_COVER_GRADE = 0.5;

/** Where segment `p→q` crosses segment `a→b`, or null where it does not (parallel, or apart). Pure. */
export function segmentCrossing(p: CoverPoint, q: CoverPoint, a: CoverPoint, b: CoverPoint): CoverPoint | null {
    const r = { x: q.x - p.x, y: q.y - p.y };
    const s = { x: b.x - a.x, y: b.y - a.y };
    const denominator = r.x * s.y - r.y * s.x;
    if (denominator === 0) return null;
    const t = ((a.x - p.x) * s.y - (a.y - p.y) * s.x) / denominator;
    const u = ((a.x - p.x) * r.y - (a.y - p.y) * r.x) / denominator;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return { x: p.x + t * r.x, y: p.y + t * r.y };
}

/**
 * Whether the ray from `origin` to `dest` passes low cover shielding the
 * target: an edge of at least half cover crossed within `reach` scene pixels
 * of `dest`. Cover by the attacker's own feet (a table they crouch behind)
 * shields them, not the target, so a crossing far from the target counts for
 * nothing. Pure.
 */
export function rayPassesCover(origin: CoverPoint, dest: CoverPoint, edges: readonly CoverEdge[], reach: number): boolean {
    return edges.some((edge) => {
        if (edge.grade < LEAST_COVER_GRADE) return false;
        const crossing = segmentCrossing(origin, dest, edge.a, edge.b);
        return crossing !== null && Math.hypot(crossing.x - dest.x, crossing.y - dest.y) <= reach;
    });
}
