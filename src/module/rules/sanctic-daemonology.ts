/**
 * Sanctic Daemonology manifestation mechanics (#130).
 *
 * Sanctic Daemonology is the Ordo Malleus / Grey Knights anti-daemon
 * discipline — the holy mirror of Malefic Daemonology. This module is
 * **pure, content-agnostic plumbing**: it composes the shared Psy-Rating
 * mode selector (`psychic-push.ts`) with the discipline's two defining
 * mechanical facts and the Phenomena-mitigation interactions.
 *
 *   - **Corruption exemption.** Malefic grants Corruption equal to the
 *     Psy Rating used (`malefic-corruption.ts`); Sanctic inflicts
 *     **none** — manifesting it is an act of faith, not damnation. That
 *     contrast is pinned by `getSancticCorruptionCost(...)`, the inverse
 *     of `getMaleficCorruptionCost`, so a regression that starts
 *     charging Sanctic corruption fails a unit test.
 *   - **Manifestation composition.** `resolveSancticManifestation(...)`
 *     folds the Fettered / Unfettered / Push selector into the corruption
 *     exemption and the Soul Binding (#86 Astropath) / Sanctic Purity
 *     (#131 Emperor's Anathema) Phenomena interactions.
 *
 * The Sanctic **powers themselves** — their names, XP costs, Psy-Rating
 * gates, and effect prose — are compendium content, NOT duplicated here.
 * They live as `psychicPower` items in
 * `dh2-beyond-items-psychic-powers` with `system.discipline` set to
 * "Sanctic Daemonology" (per-system on Sanctuary). A caller identifies a
 * power by its opaque `powerId` / UUID and resolves the display name from
 * the compendium at render time (`uuidNameCache.getName(uuid)` in a sync
 * getter, `fromUuid(uuid)` in an async dialog / chat emission) — this
 * module never carries the power's content.
 *
 * Homologation: Sanctic Daemonology is a Beyond-supplement discipline,
 * so it is only *reachable* on actors that own the compendium's Sanctic
 * powers. The functions here take primitive inputs and never branch on
 * game system, so the other six systems neither gain Sanctic powers nor
 * regress.
 */

import { resolvePsyMode, type PsyMode } from './psychic-push.ts';

/* -------------------------------------------- */
/*  Discipline predicate                        */
/* -------------------------------------------- */

/** True when `discipline` is the Sanctic Daemonology tree. */
export function isSancticDiscipline(discipline: string): boolean {
    return discipline === 'sanctic';
}

/* -------------------------------------------- */
/*  Corruption exemption                        */
/* -------------------------------------------- */

/**
 * Corruption gained by manifesting a Sanctic power. Pinned at **0**:
 * Sanctic Daemonology is an act of faith and never inflicts the
 * per-use Corruption that Malefic does — the cost is explicitly
 * Malefic-only.
 *
 * This is the inverse of `getMaleficCorruptionCost`. It exists as a
 * named function (rather than a literal `0`) so a regression that
 * starts charging Sanctic corruption fails a unit test instead of
 * silently shipping.
 */
export function getSancticCorruptionCost(_effectivePR: number, _success: boolean): 0 {
    return 0;
}

/* -------------------------------------------- */
/*  Manifestation resolver                      */
/* -------------------------------------------- */

/**
 * Phenomena-mitigation an actor can apply to a Sanctic manifestation.
 *
 *  - `soulBinding`: the Astropath elite advance grants "Bound to the
 *    Highest Power" — ignore one Psychic Phenomena roll per session
 *    (#86 / elite-advances.ts). When `true` and a Phenomena would
 *    fire, the resolver reports the roll *can* be skipped (the
 *    once-per-session bookkeeping is the caller's responsibility).
 *  - `emperorsAnathema`: the Sanctic Purity / Emperor's Anathema
 *    Fate-spend negation (#131 / sanctic-purity.ts). When `true` and
 *    a Phenomena would fire, the resolver reports a Fate point may be
 *    spent to negate it.
 */
interface SancticMitigation {
    soulBinding?: boolean;
    emperorsAnathema?: boolean;
}

export interface SancticManifestInput {
    /**
     * Opaque identifier of the power being manifested (a slug or a
     * compendium UUID). The resolver echoes it back untouched; the
     * caller resolves the display name from the compendium.
     */
    powerId: string;
    /** Psy Rating mode for this manifestation. */
    mode: PsyMode;
    /** Base Psy Rating before mode scaling. */
    basePR: number;
    /** Push level (positive integer). Ignored when `mode !== 'push'`. */
    pushLevel?: number;
    /** Did the Focus Power test succeed? */
    success: boolean;
    /** Available Phenomena-mitigation. */
    mitigation?: SancticMitigation;
}

export interface SancticManifestResult {
    /** The power identifier passed in, echoed for the caller. */
    powerId: string;
    /** Effective Psy Rating after Fettered/Unfettered/Push scaling. */
    effectivePR: number;
    /** Focus Power test target modifier from the chosen mode. */
    focusModifier: number;
    /** Corruption gained — always 0 for Sanctic (the contrast). */
    corruption: 0;
    /** True when a Psychic Phenomena draw fires (Push always forces it). */
    phenomenaFires: boolean;
    /** Modifier added to the Phenomena roll when it fires. */
    phenomenaModifier: number;
    /** Astropath Soul Binding can ignore this Phenomena (once/session). */
    canSoulBindIgnore: boolean;
    /** Emperor's Anathema can Fate-negate this Phenomena. */
    canFateNegate: boolean;
}

/**
 * Resolve a Sanctic manifestation: compose the shared psychic-push
 * mode selector with the Sanctic corruption exemption and the Soul
 * Binding / Sanctic Purity Phenomena interactions. Content-agnostic —
 * it never looks up power content; `powerId` is opaque and echoed back.
 */
export function resolveSancticManifestation(input: SancticManifestInput): SancticManifestResult {
    const mode = resolvePsyMode({
        mode: input.mode,
        basePR: input.basePR,
        ...(input.pushLevel !== undefined ? { pushLevel: input.pushLevel } : {}),
    });

    // Sanctic never charges Corruption. The lock-step with the Malefic
    // cost function is asserted in the unit tests: `getMaleficCorruptionCost`
    // must return 0 for 'sanctic', so a regression there fails a test rather
    // than needing an unreachable runtime guard here.
    const corruption = getSancticCorruptionCost(mode.effectivePR, input.success);

    const phenomenaFires = input.success && mode.forcePhenomena;
    const mit = input.mitigation ?? {};

    return {
        powerId: input.powerId,
        effectivePR: mode.effectivePR,
        focusModifier: mode.focusModifier,
        corruption,
        phenomenaFires,
        phenomenaModifier: phenomenaFires ? mode.phenomenaModifier : 0,
        canSoulBindIgnore: phenomenaFires && mit.soulBinding === true,
        canFateNegate: phenomenaFires && mit.emperorsAnathema === true,
    };
}
