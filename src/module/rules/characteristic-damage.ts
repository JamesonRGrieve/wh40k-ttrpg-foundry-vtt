/**
 * Characteristic damage at-zero effects (#115 — core.md L10679-10698).
 *
 * Some attacks / hazards / toxins damage a characteristic directly
 * (tracked on each characteristic's `.damage` slot — base-actor
 * already exposes `applyCharacteristicDamage(char, amount)`). When a
 * characteristic's effective value reaches 0 the actor suffers a
 * canonical secondary effect. Recovery: 1 point per hour of rest.
 *
 * This module exposes the mapping table + recovery math. The
 * status-effect application hook on threshold-cross is the engine
 * consumer's job (sheet update + ActiveEffect / status condition).
 */

import { nonNegInt } from './_num.ts';

type AtZeroEffect =
    /** Skill / talent tests using this characteristic auto-fail. */
    | 'cannot-test'
    /** Actor falls Unconscious. */
    | 'unconscious'
    /** Actor dies. */
    | 'death'
    /** Actor becomes Helpless (paralysed / catatonic). */
    | 'helpless'
    /** −30 on all tests EXCEPT Toughness bonus checks. */
    | 'global-penalty';

export interface AtZeroEntry {
    /** The status effect applied when this characteristic reaches 0. */
    effect: AtZeroEffect;
    /** Optional flat modifier when effect = 'global-penalty'. */
    globalPenalty?: number;
    /** Human-readable RAW description. */
    description: string;
}

/**
 * Canonical characteristic → at-zero effect mapping per RAW.
 *
 * Keys match the actor schema's `characteristics.<key>` slots
 * (weaponSkill, ballisticSkill, strength, toughness, agility,
 * intelligence, perception, willpower, fellowship).
 */
export const CHARACTERISTIC_AT_ZERO: Record<string, AtZeroEntry> = {
    weaponSkill: { effect: 'cannot-test', description: 'Cannot make Weapon Skill tests.' },
    ballisticSkill: { effect: 'cannot-test', description: 'Cannot make Ballistic Skill tests.' },
    strength: { effect: 'unconscious', description: 'Falls Unconscious.' },
    toughness: { effect: 'death', description: 'Dies.' },
    agility: { effect: 'helpless', description: 'Paralysed / Helpless.' },
    intelligence: { effect: 'helpless', description: 'Comatose / Helpless.' },
    perception: { effect: 'global-penalty', globalPenalty: -30, description: '−30 to all tests except Toughness Bonus checks.' },
    willpower: { effect: 'unconscious', description: 'Falls Unconscious.' },
    fellowship: { effect: 'helpless', description: 'Catatonic / Helpless.' },
};

/**
 * Resolve the at-zero effect for a characteristic. Returns `undefined`
 * for unknown keys (defensive — callers should pass canonical slugs).
 */
export function getAtZeroEffect(characteristicKey: string): AtZeroEntry | undefined {
    return CHARACTERISTIC_AT_ZERO[characteristicKey];
}

/**
 * Effective characteristic value = total − damage, floored at 0.
 */
export function getEffectiveCharacteristic(total: number, damage: number): number {
    const t = nonNegInt(total);
    const d = nonNegInt(damage);
    return Math.max(0, t - d);
}

/**
 * Recovery: 1 point per hour of rest. Returns how many points heal
 * after the given hours. Capped at the actor's accumulated damage so
 * the caller doesn't over-heal.
 */
export function getCharacteristicDamageHealed(damageSoFar: number, hoursOfRest: number): number {
    const damage = nonNegInt(damageSoFar);
    const hours = nonNegInt(hoursOfRest);
    return Math.min(damage, hours);
}
