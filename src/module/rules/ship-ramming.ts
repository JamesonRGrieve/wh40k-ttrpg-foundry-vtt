/**
 * Ramming resolver — Rogue Trader (#188 — RT Core p.215 §Ramming and
 * Boarding Actions).
 *
 * RAW shape:
 *   - A ship that ends its Manoeuvre Action within one VU of an enemy, bow
 *     facing it, may give up its Shooting Action to ram. The helmsman makes a
 *     **Hard (−20) Pilot (Space Craft) + Manoeuvrability Test** — an ordinary
 *     test, not an opposed one.
 *   - On a success the rammer deals a die set by its hull size **plus its prow
 *     armour**, ignoring void shields. The defender's armour does not reduce
 *     it.
 *   - The rammer then takes **the defending ship's Armour + 1d5**, also
 *     ignoring void shields.
 *
 * The hull-size die table and the rebound die are content: they are authored
 * on the compendium Ramming Speed order (`system.ramming`) and passed in here,
 * never hardcoded. Component and talent bonuses (a power ram's +1d10, a Ram
 * Ship's +20 to the test, …) arrive as GM-entered modifiers.
 *
 * Pure module: no RNG, no Foundry. The caller rolls the dice.
 */

import {
    composePilotManoeuvrabilityTest,
    HARD_DIFFICULTY_KEY,
    sumComponents,
    type ShipAssaultShip,
    type ShipTestComponent,
    type ShipTestDerivation,
    type SituationalModifier,
} from './ship-assault.ts';

/** Printed difficulty of the ramming test — Hard (−20). */
export const RAMMING_DIFFICULTY = -20;

/** Langpack keys for the ramming components. */
export const RAMMING_KEYS = {
    difficulty: HARD_DIFFICULTY_KEY,
    damageDie: 'WH40K.Voidcraft.Ramming.Component.DamageDie',
    prowArmour: 'WH40K.Voidcraft.Ramming.Component.ProwArmour',
    bonus: 'WH40K.Voidcraft.Ramming.Component.Bonus',
    defenderArmour: 'WH40K.Voidcraft.Ramming.Component.DefenderArmour',
    reboundDie: 'WH40K.Voidcraft.Ramming.Component.ReboundDie',
} as const;

/** One row of the hull-size damage table authored on the Ramming Speed order. */
export interface RamDamageRow {
    readonly hullType: string;
    readonly formula: string;
}

/** The ramming content the compendium Ramming Speed order carries. */
export interface RammingProfile {
    readonly damage: readonly RamDamageRow[];
    readonly reboundDamage: string;
}

/** The damage formula for a hull type, or null when the table has no row for it. */
export function ramDamageFormula(profile: RammingProfile, hullType: string): string | null {
    return profile.damage.find((row) => row.hullType === hullType)?.formula ?? null;
}

/** Inputs to the ramming test. */
export interface RammingTestInput {
    readonly pilotSkill: number;
    readonly ship: ShipAssaultShip;
    readonly situational?: SituationalModifier;
}

/** Compose the Hard (−20) Pilot (Space Craft) + Manoeuvrability ramming test. */
export function composeRammingTest(input: RammingTestInput): ShipTestDerivation {
    return composePilotManoeuvrabilityTest({
        pilotSkill: input.pilotSkill,
        ship: input.ship,
        difficulty: RAMMING_DIFFICULTY,
        difficultyKey: RAMMING_KEYS.difficulty,
        ...(input.situational === undefined ? {} : { situational: input.situational }),
    });
}

/** A rolled dice formula. */
export interface RolledFormula {
    readonly formula: string;
    readonly total: number;
}

/** A rolled GM-entered bonus (power ram, Good an' Ard, …). */
export interface RolledBonus extends RolledFormula {
    readonly label: string;
}

/** Inputs to the collision damage after a successful ram. */
export interface RammingDamageInput {
    readonly attacker: ShipAssaultShip;
    readonly defender: ShipAssaultShip;
    /** The hull-size damage die, rolled. */
    readonly damage: RolledFormula;
    /** The rebound die, rolled. */
    readonly rebound: RolledFormula;
    /** Extra ram damage from components or talents, rolled. */
    readonly bonus?: RolledBonus;
}

/** One ship's side of the collision: its damage terms and their total. */
export interface RammingDamageSide {
    readonly components: readonly ShipTestComponent[];
    readonly total: number;
}

/** Both sides of a successful ram. Neither is reduced by void shields. */
export interface RammingDamageResolution {
    /** Dealt to the rammed ship: die + rammer's prow armour (+ bonus). */
    readonly defender: RammingDamageSide;
    /** Dealt back to the rammer: defender's Armour + rebound die. */
    readonly attacker: RammingDamageSide;
}

function side(components: ShipTestComponent[]): RammingDamageSide {
    return { components, total: Math.max(0, sumComponents(components)) };
}

/** Compute both sides' Hull Integrity damage for a successful ram. */
export function computeRammingDamage(input: RammingDamageInput): RammingDamageResolution {
    const dealt: ShipTestComponent[] = [
        { labelKey: RAMMING_KEYS.damageDie, value: input.damage.total, data: { formula: input.damage.formula, hull: input.attacker.hullType } },
        { labelKey: RAMMING_KEYS.prowArmour, value: input.attacker.armour, data: { ship: input.attacker.name } },
    ];
    if (input.bonus !== undefined && input.bonus.total !== 0) {
        dealt.push({ labelKey: RAMMING_KEYS.bonus, value: input.bonus.total, data: { formula: input.bonus.formula, label: input.bonus.label } });
    }
    return {
        defender: side(dealt),
        attacker: side([
            { labelKey: RAMMING_KEYS.defenderArmour, value: input.defender.armour, data: { ship: input.defender.name } },
            { labelKey: RAMMING_KEYS.reboundDie, value: input.rebound.total, data: { formula: input.rebound.formula } },
        ]),
    };
}
