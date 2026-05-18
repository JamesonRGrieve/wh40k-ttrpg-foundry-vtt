/**
 * Sanctic Daemonology psychic discipline (#130 — beyond.md L1813–2090,
 * §"SANCTIC DAEMONOLOGY").
 *
 * Sanctic Daemonology is the Ordo Malleus / Grey Knights anti-daemon
 * discipline — the holy mirror of Malefic Daemonology. The defining
 * mechanical contrast with Malefic is the corruption cost:
 *
 *   - **Malefic:** every successful manifestation grants Corruption
 *     points equal to the Psy Rating used (`malefic-corruption.ts`).
 *   - **Sanctic:** manifesting a Sanctic power inflicts **no** per-use
 *     Corruption — practising it is an act of faith, not damnation.
 *
 * This module is pure logic. It exposes:
 *
 *   - the canonical Sanctic powers registry (`SANCTIC_POWERS`), modelled
 *     exactly like the Malefic/Disorders registries so the discipline
 *     surfaces alongside Malefic for selectors and chat cards;
 *   - `DAEMONOLOGY_DISCIPLINES` — the two-entry registry that surfaces
 *     Sanctic *and* Malefic together (the issue's "registry surfaces
 *     Sanctic alongside Malefic" criterion);
 *   - `getSancticCorruptionCost(...)` — pinned to 0, the inverse of
 *     `getMaleficCorruptionCost`, so a regression that starts charging
 *     Sanctic corruption fails a test;
 *   - `resolveSancticManifestation(...)` — composes the shared
 *     Fettered / Unfettered / Push selector (`psychic-push.ts`) with
 *     the Sanctic corruption exemption and the Soul Binding / Sanctic
 *     Purity Phenomena-mitigation interactions (#86 Astropath, #131
 *     Emperor's Anathema).
 *
 * The discipline is content-agnostic primitive plumbing: the actual
 * psychic-power *items* live in the compendium with
 * `system.discipline === 'sanctic'`. This registry is the canonical
 * id/xp/PR shape the resolver and GM tooling validate against without
 * re-deriving it per game system; it does not duplicate compendium
 * content (no effect prose, no damage formulae — those stay on the
 * `PsychicPowerData` DataModel).
 *
 * Homologation: Sanctic Daemonology is a Beyond-supplement discipline,
 * so it is only *reachable* on DH2 actors that own Sanctic compendium
 * powers. The functions here are system-agnostic — they take primitive
 * inputs and never branch on game system — so the other six systems
 * neither gain Sanctic powers nor regress.
 */

import type { PsyDiscipline } from './malefic-corruption.ts';
import { resolvePsyMode, type PsyMode } from './psychic-push.ts';

/* -------------------------------------------- */
/*  Discipline registry                         */
/* -------------------------------------------- */

/** The two opposed Daemonology disciplines (beyond.md L1817). */
export type DaemonologyDisciplineId = 'sanctic' | 'malefic';

/** Single Daemonology-discipline registry entry. */
export interface DaemonologyDisciplineDef {
    /** Stable identifier; matches `PsychicPowerData.discipline`. */
    readonly id: DaemonologyDisciplineId;
    /** i18n key under `WH40K.SancticDaemonology.Discipline.<key>`. */
    readonly key: string;
    /** English fallback name. */
    readonly name: string;
    /**
     * Corruption gained per successful manifestation, expressed as a
     * multiplier on the effective Psy Rating. Malefic = 1×PR;
     * Sanctic = 0 (the defining contrast — beyond.md §"TO INVITE
     * CORRUPTION").
     */
    readonly corruptionPerPR: number;
    /** True for the holy discipline; false for the heretical one. */
    readonly isSanctified: boolean;
}

/**
 * The two opposed Daemonology disciplines, surfaced together so a
 * selector / chat card can present Sanctic alongside Malefic
 * (issue #130 acceptance criterion 2).
 */
export const DAEMONOLOGY_DISCIPLINES: ReadonlyArray<DaemonologyDisciplineDef> = Object.freeze([
    Object.freeze({
        id: 'sanctic',
        key: 'Sanctic',
        name: 'Sanctic Daemonology',
        corruptionPerPR: 0,
        isSanctified: true,
    }),
    Object.freeze({
        id: 'malefic',
        key: 'Malefic',
        name: 'Malefic Daemonology',
        corruptionPerPR: 1,
        isSanctified: false,
    }),
]);

/** Lookup a Daemonology discipline by id. Returns null when unknown. */
export function getDaemonologyDiscipline(id: DaemonologyDisciplineId): DaemonologyDisciplineDef | null {
    return DAEMONOLOGY_DISCIPLINES.find((d) => d.id === id) ?? null;
}

/* -------------------------------------------- */
/*  Sanctic powers registry                     */
/* -------------------------------------------- */

/** Stable identifiers for each canonical Sanctic power. */
export type SancticPowerId =
    | 'banishment'
    | 'cleansing-flame'
    | 'exorcism'
    | 'hammerhand'
    | 'holocaust'
    | 'psychic-communion'
    | 'purge-soul'
    | 'sanctuary'
    | 'word-of-the-emperor';

/** Single Sanctic-power registry entry (beyond.md L1827–2090). */
export interface SancticPowerDef {
    /** Stable identifier (chat cards, item creation, telemetry). */
    readonly id: SancticPowerId;
    /** i18n key suffix under `WH40K.SancticDaemonology.Powers.<key>.Name`. */
    readonly key: string;
    /** Display name (English fallback). */
    readonly name: string;
    /** XP value to learn the power. */
    readonly xp: number;
    /** Minimum Psy Rating prerequisite (0 = no PR gate). */
    readonly prMinimum: number;
    /** Is this an Attack-subtype power? */
    readonly isAttack: boolean;
}

/**
 * Canonical Sanctic Daemonology powers — nine entries spanning the
 * discipline (beyond.md §"SANCTIC DAEMONOLOGY", L1827–2090). XP and
 * Psy-Rating gates mirror the compendium documents; effect prose and
 * damage formulae stay on the `PsychicPowerData` DataModel (this is a
 * validation registry, not a content duplicate).
 */
export const SANCTIC_POWERS: ReadonlyArray<SancticPowerDef> = Object.freeze([
    Object.freeze({ id: 'banishment', key: 'Banishment', name: 'Banishment', xp: 300, prMinimum: 3, isAttack: true }),
    Object.freeze({ id: 'cleansing-flame', key: 'CleansingFlame', name: 'Cleansing Flame', xp: 300, prMinimum: 4, isAttack: true }),
    Object.freeze({ id: 'exorcism', key: 'Exorcism', name: 'Exorcism', xp: 200, prMinimum: 0, isAttack: true }),
    Object.freeze({ id: 'hammerhand', key: 'Hammerhand', name: 'Hammerhand', xp: 300, prMinimum: 3, isAttack: false }),
    Object.freeze({ id: 'holocaust', key: 'Holocaust', name: 'Holocaust', xp: 500, prMinimum: 5, isAttack: true }),
    Object.freeze({ id: 'psychic-communion', key: 'PsychicCommunion', name: 'Psychic Communion', xp: 100, prMinimum: 0, isAttack: false }),
    Object.freeze({ id: 'purge-soul', key: 'PurgeSoul', name: 'Purge Soul', xp: 200, prMinimum: 0, isAttack: true }),
    Object.freeze({ id: 'sanctuary', key: 'Sanctuary', name: 'Sanctuary', xp: 400, prMinimum: 0, isAttack: false }),
    Object.freeze({
        id: 'word-of-the-emperor',
        key: 'WordOfTheEmperor',
        name: 'Word of the Emperor',
        xp: 200,
        prMinimum: 0,
        isAttack: false,
    }),
]);

/** Lookup a Sanctic power by id. Returns null when the id is unknown. */
export function getSancticPower(id: SancticPowerId): SancticPowerDef | null {
    return SANCTIC_POWERS.find((p) => p.id === id) ?? null;
}

/** True when `discipline` is the Sanctic Daemonology tree. */
export function isSancticDiscipline(discipline: PsyDiscipline | string): boolean {
    return discipline === 'sanctic';
}

/* -------------------------------------------- */
/*  Corruption exemption                        */
/* -------------------------------------------- */

/**
 * Corruption gained by manifesting a Sanctic power. Pinned at **0**:
 * Sanctic Daemonology is an act of faith and never inflicts the
 * per-use Corruption that Malefic does (beyond.md §"TO INVITE
 * CORRUPTION" — the cost is explicitly Malefic-only).
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
export interface SancticMitigation {
    soulBinding?: boolean;
    emperorsAnathema?: boolean;
}

export interface SancticManifestInput {
    /** Power being manifested (validated against `SANCTIC_POWERS`). */
    powerId: SancticPowerId;
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
    /** The resolved power definition. */
    power: SancticPowerDef;
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
 * Binding / Sanctic Purity Phenomena interactions.
 *
 * Throws when `powerId` is not a known Sanctic power so a bad caller
 * fails loudly rather than silently mis-scaling.
 */
export function resolveSancticManifestation(input: SancticManifestInput): SancticManifestResult {
    const power = getSancticPower(input.powerId);
    if (power === null) {
        throw new Error(`Unknown Sanctic power: ${input.powerId}`);
    }

    const mode = resolvePsyMode({ mode: input.mode, basePR: input.basePR, pushLevel: input.pushLevel });

    // Sanctic never charges Corruption (beyond.md §"TO INVITE
    // CORRUPTION" — the per-use cost is explicitly Malefic-only). The
    // lock-step with the Malefic cost function is asserted in the unit
    // tests: `getMaleficCorruptionCost('sanctic', …)` must return 0 for
    // the same inputs, so a regression there fails a test rather than
    // needing an unreachable runtime guard here.
    const corruption = getSancticCorruptionCost(mode.effectivePR, input.success);

    const phenomenaFires = input.success && mode.forcePhenomena;
    const mit = input.mitigation ?? {};

    return {
        power,
        effectivePR: mode.effectivePR,
        focusModifier: mode.focusModifier,
        corruption: 0,
        phenomenaFires,
        phenomenaModifier: phenomenaFires ? mode.phenomenaModifier : 0,
        canSoulBindIgnore: phenomenaFires && mit.soulBinding === true,
        canFateNegate: phenomenaFires && mit.emperorsAnathema === true,
    };
}
