/**
 * @file Corruption / Insanity degree ladders — one implementation, two registries.
 *
 * The runtime Handlebars registry (`handlebars-helpers.ts`) and the Storybook
 * one (`stories/template-support.ts`) each register their own helper set, and
 * the story registry hand-reimplements what it needs. That divergence is only
 * visible when a story renders a template the story registry has not covered:
 * the Combat tab's Vitals body reaches `corruptionDegree`, which the story
 * registry never had, so the panel could not be rendered in a story at all —
 * which is why the surface had no visual coverage when #494 reworked it twice.
 *
 * The ladders live here so both registries call the same code. The tier
 * names resolve through `game.i18n` (a runtime global the Storybook sheet
 * mocks provide); the threshold and class ladders are otherwise pure.
 */

/** A first-match threshold ladder: the first tier whose inclusive max is >= points. */
type Ladder = ReadonlyArray<readonly [max: number, result: string]>;

/**
 * A score as a template hands it over: a number, a numeric string, or nothing.
 * This is the genuine boundary shape — Handlebars passes whatever the template
 * author wrote — so it is enumerated rather than left as `unknown`.
 */
export type DegreeScore = number | string | null | undefined;

/** Coerce a template-author value to a finite number, else 0. */
function numberOr0(value: DegreeScore): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Resolve a threshold ladder.
 * @param {number} points  The score.
 * @param {Ladder} tiers  Tiers in ascending order of `max`.
 * @param {string} fallback  Result when no tier matches.
 * @returns {string}  The matching tier's result.
 */
export function thresholdLadder(points: number, tiers: Ladder, fallback: string): string {
    for (const [max, result] of tiers) {
        if (points <= max) return result;
    }
    return fallback;
}

/** Langpack keys of PURE (0), TAINTED (1–30), SOILED (31–60), DEBASED (61–90), PROFANE (91–99); DAMNED (100) is the fallback. */
const CORRUPTION_DEGREES: Ladder = [
    [0, 'WH40K.Status.Corruption.Degree.Pure.Label'],
    [30, 'WH40K.Status.Corruption.Degree.Tainted.Label'],
    [60, 'WH40K.Status.Corruption.Degree.Soiled.Label'],
    [90, 'WH40K.Status.Corruption.Degree.Debased.Label'],
    [99, 'WH40K.Status.Corruption.Degree.Profane.Label'],
];
const CORRUPTION_DAMNED_LABEL_KEY = 'WH40K.Status.Corruption.Degree.Damned.Label';

const CORRUPTION_CLASSES: Ladder = [
    [0, 'wh40k-degree-pure'],
    [30, 'wh40k-degree-tainted'],
    [60, 'wh40k-degree-soiled'],
    [90, 'wh40k-degree-debased'],
    [99, 'wh40k-degree-profane'],
];

/** Langpack keys of STABLE (0–9), UNSETTLED (10–39), DISTURBED (40–59), UNHINGED (60–79), DERANGED (80–99); TERMINALLY INSANE (100) is the fallback. */
const INSANITY_DEGREES: Ladder = [
    [9, 'WH40K.Status.Insanity.Degree.Stable.Label'],
    [39, 'WH40K.Status.Insanity.Degree.Unsettled.Label'],
    [59, 'WH40K.Status.Insanity.Degree.Disturbed.Label'],
    [79, 'WH40K.Status.Insanity.Degree.Unhinged.Label'],
    [99, 'WH40K.Status.Insanity.Degree.Deranged.Label'],
];
const INSANITY_TERMINAL_LABEL_KEY = 'WH40K.Status.Insanity.Degree.Terminal.Label';

const INSANITY_CLASSES: Ladder = [
    [9, 'wh40k-degree-stable'],
    [39, 'wh40k-degree-unsettled'],
    [59, 'wh40k-degree-disturbed'],
    [79, 'wh40k-degree-unhinged'],
    [99, 'wh40k-degree-deranged'],
];

/** Localized corruption degree label for a corruption score. */
export function corruptionDegree(corruption: DegreeScore): string {
    return game.i18n.localize(thresholdLadder(numberOr0(corruption), CORRUPTION_DEGREES, CORRUPTION_DAMNED_LABEL_KEY));
}

/** CSS class for a corruption score's degree. */
export function corruptionDegreeClass(corruption: DegreeScore): string {
    return thresholdLadder(numberOr0(corruption), CORRUPTION_CLASSES, 'wh40k-degree-damned');
}

/** Localized insanity degree label for an insanity score. */
export function insanityDegree(insanity: DegreeScore): string {
    return game.i18n.localize(thresholdLadder(numberOr0(insanity), INSANITY_DEGREES, INSANITY_TERMINAL_LABEL_KEY));
}

/** CSS class for an insanity score's degree. */
export function insanityDegreeClass(insanity: DegreeScore): string {
    return thresholdLadder(numberOr0(insanity), INSANITY_CLASSES, 'wh40k-degree-terminally');
}
