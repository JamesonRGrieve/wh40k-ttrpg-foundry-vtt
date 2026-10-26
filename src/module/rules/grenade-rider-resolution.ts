/**
 * @file Resolving a grenade's rider against the creatures it caught (#623).
 *
 * Every creature the rider touches tests the rider's characteristic with the rider's
 * modifier (and a psyker's extra modifier, where the rider prints one). A failure — or,
 * for a rider with no test, being caught at all — applies the rider's condition for its
 * duration: base rounds plus one per degree of failure, a rolled number of rounds, or the
 * encounter. Everything is read from the rider data (Direction #7): no grenade is named.
 *
 * Pure: the caller rolls the d100 and any duration dice and passes the results in.
 */

import { aggregateRollTarget } from '../rolls/aggregate-target.ts';
import { degreesOfFailure, isD100Success } from './_dice.ts';
import { type GrenadeRiderData, type RiderDurationKind, riderDealsCharacteristicDamage, riderHasTest } from './grenade-rider.ts';

/** A creature the rider's area caught, as the resolver reads it. */
export interface RiderCreature {
    tokenId: string;
    /** The creature's actor UUID, so its condition can be applied to it. */
    actorUuid: string;
    name: string;
    /** Whether the creature has a psy rating. */
    isPsyker: boolean;
    /** The creature's total in the rider's test characteristic (0 when the rider has no test). */
    characteristic: number;
    /** The damage the creature suffered from the grenade's own hit, after soak (#698); 0 when it took none or the grenade deals none. */
    damageSuffered: number;
}

/** Where a test modifier came from, for the card's provenance rows. */
export type RiderComponentSource = 'grenade' | 'psyker' | 'damage';

/** One provenance-bearing modifier on a rider test. */
export interface RiderTestComponent {
    source: RiderComponentSource;
    value: number;
    /** For the `damage` row, the points of damage suffered it scales with. */
    damageSuffered?: number;
}

/** A creature's rolled rider test. */
export interface RiderTestResult {
    /** The characteristic total before modifiers. */
    base: number;
    /** The final target after the ±60-capped modifiers. */
    target: number;
    /** The d100 result. */
    roll: number;
    components: RiderTestComponent[];
    passed: boolean;
    /** Degrees of failure; 0 on a pass. */
    degreesOfFailure: number;
}

/** What the rider did to one creature caught. */
export interface RiderTargetResult {
    tokenId: string;
    actorUuid: string;
    name: string;
    /** False when the rider does not touch this creature (a non-psyker in a Psyk-out cloud). */
    affected: boolean;
    /** The test it rolled; null when the rider has no test or does not touch it. */
    test: RiderTestResult | null;
    /** Whether the rider's effect lands on it: a failed test, or caught by a rider with no test. */
    suffers: boolean;
    /** The condition registry id the effect applies; '' for none (the effect prose is the GM's). */
    condition: string;
    /** How many rounds the effect lasts; null for no round count (the encounter, or none printed). */
    rounds: number | null;
    /** Whether the effect lasts until the end of the encounter. */
    untilEncounterEnd: boolean;
    /** The step added to the effect's table roll (a Psychotroke's +1 per degree of failure); 0 for none. */
    effectRollShift: number;
    /** The characteristic damage the effect deals (a Rad grenade's Toughness damage); null for none. */
    characteristicDamage: RiderCharacteristicDamage | null;
}

/** Characteristic damage a rider deals one creature. */
export interface RiderCharacteristicDamage {
    /** The characteristic key (`toughness`). */
    characteristic: string;
    amount: number;
}

/** Inputs for one creature's rider result. */
export interface RiderResolutionInput {
    rider: GrenadeRiderData;
    creature: RiderCreature;
    /** The creature's d100, or null when the rider has no test or does not touch it. */
    roll: number | null;
    /** The rider's rolled duration in rounds (a `roll` duration), or null when there is none. */
    rolledRounds: number | null;
    /** The rider's rolled characteristic-damage formula, or null when it deals none or was not rolled. */
    rolledDamage: number | null;
}

/** A damage card's hit, as the rider reads the damage a creature suffered from it. */
export interface RiderHitView {
    /** The actor an area hit landed on; '' for a hit on the card's own target. */
    targetUuid: string;
    /** Whether the hit's damage after soak was worked out against its target. */
    hasEffective: boolean;
    /** The hit's damage after the target's armour and Toughness Bonus. */
    effectiveDamage: number;
}

/**
 * The damage a creature suffered from the grenade's hits (#698): the after-soak damage of
 * every hit that landed on it — an area hit on its actor, or, when it is the card's own
 * target, every hit that names no other actor.
 */
export function riderDamageSuffered(hits: readonly RiderHitView[], actorUuid: string, isCardTarget: boolean): number {
    return hits
        .filter((hit) => hit.hasEffective && (hit.targetUuid === '' ? isCardTarget : hit.targetUuid === actorUuid))
        .reduce((sum, hit) => sum + hit.effectiveDamage, 0);
}

/** Whether the rider touches the creature at all. */
export function riderAffectsCreature(rider: GrenadeRiderData, creature: Pick<RiderCreature, 'isPsyker'>): boolean {
    return rider.affects === '' || creature.isPsyker;
}

/**
 * The modifiers on the creature's test, each with its provenance; only the ones that
 * change the target (a +0 test adds no row, #616). The damage row (#698) is the rider's
 * penalty per point of damage the creature suffered from the grenade's hit.
 */
export function riderTestComponents(rider: GrenadeRiderData, creature: Pick<RiderCreature, 'isPsyker' | 'damageSuffered'>): RiderTestComponent[] {
    const { modifier, psykerModifier, damagePenalty } = rider.test;
    const components: RiderTestComponent[] = [
        { source: 'grenade', value: modifier },
        { source: 'psyker', value: creature.isPsyker ? psykerModifier : 0 },
        { source: 'damage', value: damagePenalty * creature.damageSuffered, damageSuffered: creature.damageSuffered },
    ];
    return components.filter((component) => component.value !== 0);
}

/** Whether resolving the rider rolls its duration (a `roll` duration with a condition to time). */
export function riderRollsDuration(rider: GrenadeRiderData): boolean {
    return rider.duration.kind === 'roll' && rider.duration.formula !== '';
}

/** Each printed duration kind's round count: base + degrees, the rolled rounds, or none. */
const DURATION_ROUNDS: Readonly<Record<Exclude<RiderDurationKind, ''>, (base: number, degrees: number, rolledRounds: number | null) => number | null>> = {
    degreesOfFailure: (base, degrees) => base + degrees,
    roll: (_base, _degrees, rolledRounds) => rolledRounds,
    encounter: () => null,
};

/**
 * How many rounds the effect lasts on a creature that failed by `degrees` (0 for a rider
 * with no test): base plus one per degree, the rolled rounds, or null for the encounter or
 * no printed duration.
 */
export function riderDurationRounds(rider: GrenadeRiderData, degrees: number, rolledRounds: number | null): number | null {
    const { kind, base } = rider.duration;
    return kind === '' ? null : DURATION_ROUNDS[kind](base, degrees, rolledRounds);
}

/** The step a failure adds to the effect's table roll: `perDegree` per degree of failure, capped at `max`. */
export function riderEffectRollShift(rider: GrenadeRiderData, degrees: number): number {
    const { perDegree, max } = rider.effectRollShift;
    return Math.min(perDegree * degrees, max);
}

/**
 * The characteristic damage a failure by `degrees` deals: the rolled formula plus
 * `perDegree` per degree of failure; null when the rider deals none or its formula was
 * not rolled.
 */
export function riderCharacteristicDamage(rider: GrenadeRiderData, degrees: number, rolledDamage: number | null): RiderCharacteristicDamage | null {
    if (!riderDealsCharacteristicDamage(rider) || rolledDamage === null) return null;
    const { characteristic, perDegree } = rider.characteristicDamage;
    return { characteristic, amount: rolledDamage + perDegree * degrees };
}

/** Score one creature's test against the rider: base + the capped modifiers, roll-under, degrees of failure. */
function scoreTest(rider: GrenadeRiderData, creature: RiderCreature, roll: number): RiderTestResult {
    const components = riderTestComponents(rider, creature);
    const modifiers: Record<string, number> = {};
    for (const component of components) modifiers[component.source] = component.value;
    const target = aggregateRollTarget(creature.characteristic, modifiers);
    const passed = isD100Success(roll, target);
    // A natural 01 passes above the target and a natural 100 fails at or under it; the
    // failure still counts at least one degree.
    const degrees = passed ? 0 : Math.max(1, degreesOfFailure(roll, target));
    return { base: creature.characteristic, target, roll, components, passed, degreesOfFailure: degrees };
}

/** What the rider does to one creature caught. */
export function resolveRiderCreature(input: RiderResolutionInput): RiderTargetResult {
    const { rider, creature } = input;
    const base = { tokenId: creature.tokenId, actorUuid: creature.actorUuid, name: creature.name, condition: rider.condition };
    if (!riderAffectsCreature(rider, creature)) {
        return { ...base, affected: false, test: null, suffers: false, rounds: null, untilEncounterEnd: false, effectRollShift: 0, characteristicDamage: null };
    }
    const test = riderHasTest(rider) && input.roll !== null ? scoreTest(rider, creature, input.roll) : null;
    const suffers = test === null ? !riderHasTest(rider) : !test.passed;
    const degrees = test?.degreesOfFailure ?? 0;
    return {
        ...base,
        affected: true,
        test,
        suffers,
        rounds: suffers ? riderDurationRounds(rider, degrees, input.rolledRounds) : null,
        untilEncounterEnd: suffers && rider.duration.kind === 'encounter',
        effectRollShift: suffers ? riderEffectRollShift(rider, degrees) : 0,
        characteristicDamage: suffers ? riderCharacteristicDamage(rider, degrees, input.rolledDamage) : null,
    };
}
