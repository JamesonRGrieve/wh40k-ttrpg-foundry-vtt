/**
 * Crippled and destroyed starships — Rogue Trader (#187 — RT core rules with
 * the 1.4 errata, "Crippled Ships", "Destroying Ships" and the Critical Hit chart).
 *
 * "When a ship reaches 0 Hull Integrity, it becomes Crippled. Apply a -10
 * penalty to its Manoeuvrability and Detection, and reduce its Speed to half.
 * In addition, reduce the strength of all weapon Components by half (round
 * up). A ship will remain Crippled … until it has regained at least 1 Hull
 * Integrity. When a Crippled ship takes damage past its Armour, it takes a
 * Critical Hit. Compare the value of the damage that exceeded the Armour to
 * the Critical Hit chart."
 *
 * 0 Hull Integrity never destroys a Rogue Trader ship: "Most of the Critical
 * Hit results will not destroy a ship outright". A ship is destroyed
 * only by a Critical Hit result the chart marks as destroying it (the chart's
 * Catastrophic Damage: hulked, or a plasma or warp drive explosion). Which
 * result does that is content — authored on the compendium table result as
 * `flags['wh40k-rpg'].destroysShip` and carried onto the ship's recorded
 * status — never a name or roll matched here. The book's optional simplified
 * rule for NPC vessels is not offered (operator ruling).
 *
 * Every Crippled effect is gated on the Rogue Trader line explicitly: the
 * other lines' voidcraft and every other vehicle keep their own rules.
 *
 * Pure module: no Foundry, no RNG.
 */

import { CRIPPLED_MANOEUVRABILITY_KEY, type ShipTestComponent } from './ship-assault.ts';
import { isCrippled } from './ship-crew-morale.ts';

/** The line whose starship-combat rules define Crippled ships. */
const CRIPPLED_RULES_GAME_SYSTEM = 'rt';

/** Whether a voidcraft of this line follows the Crippled / destroyed rules above. */
export function followsCrippledRules(gameSystem: string): boolean {
    return gameSystem === CRIPPLED_RULES_GAME_SYSTEM;
}

/** The hull state the rules read. */
interface HullState {
    readonly gameSystem: string;
    readonly hullIntegrity: { readonly value: number; readonly max: number };
}

/** Whether the Crippled effects apply to this ship right now: an RT ship at 0 Hull. */
export function suffersCrippledEffects(ship: HullState): boolean {
    return followsCrippledRules(ship.gameSystem) && isCrippled(ship.hullIntegrity);
}

/** Manoeuvrability and Detection penalty of a Crippled ship. */
export const CRIPPLED_STAT_PENALTY = -10;

/** The ship stats the Crippled rule changes. */
export type CrippledStat = 'manoeuvrability' | 'detection' | 'speed';

/**
 * The signed change the Crippled rule makes to each stat, given the stat
 * values it applies to. Speed is halved; the book gives no rounding for it,
 * so it rounds up like the weapon Strength in the same paragraph, which also
 * keeps a Speed 1 ship moving (a ship may never stand still). All zero
 * when the effects do not apply.
 */
export function crippledStatChanges(ship: HullState, speed: number): Record<CrippledStat, number> {
    if (!suffersCrippledEffects(ship)) return { manoeuvrability: 0, detection: 0, speed: 0 };
    return { manoeuvrability: CRIPPLED_STAT_PENALTY, detection: CRIPPLED_STAT_PENALTY, speed: Math.ceil(speed / 2) - speed };
}

/** Langpack keys of the Crippled provenance rows on a test. */
const CRIPPLED_STAT_KEYS: Readonly<Record<Exclude<CrippledStat, 'speed'>, string>> = {
    manoeuvrability: CRIPPLED_MANOEUVRABILITY_KEY,
    detection: 'WH40K.Voidcraft.Crippled.Component.Detection',
};

/**
 * The provenance row a test that adds the ship's Manoeuvrability or Detection
 * shows for the Crippled penalty, or nothing when it does not apply.
 */
export function crippledStatComponents(ship: HullState, stat: 'manoeuvrability' | 'detection'): ShipTestComponent[] {
    const change = crippledStatChanges(ship, 0)[stat];
    return change === 0 ? [] : [{ labelKey: CRIPPLED_STAT_KEYS[stat], value: change }];
}

/**
 * The Critical Hit rolls a Crippled target takes from one resolved shot: one
 * per application of damage past its Armour, valued at that damage. A
 * macrobattery (or salvo) applies its total once; a lance applies each hit
 * separately ("Each damage total is resolved against the target's defences
 * separately"). A value above the chart lands on its last result (the table
 * roller clamps an out-of-range roll to the nearest row).
 */
export function crippledCriticalRolls(target: HullState, damagePastArmour: readonly number[]): number[] {
    if (!suffersCrippledEffects(target)) return [];
    return damagePastArmour.filter((damage) => damage > 0);
}

/**
 * The langpack key naming how a recorded Critical Hit was rolled: a weapon's
 * 1d5, or a Crippled ship's damage past its Armour read on the chart.
 */
export function criticalRollLabelKey(pastArmour: boolean): 'WH40K.Voidcraft.Critical.RollLabel' | 'WH40K.Voidcraft.Critical.CrippledRollLabel' {
    return pastArmour ? 'WH40K.Voidcraft.Critical.CrippledRollLabel' : 'WH40K.Voidcraft.Critical.RollLabel';
}

/** A recorded Critical Hit status, as far as destruction is concerned. */
interface ShipStatusView {
    readonly destroysShip: boolean;
}

/**
 * Is the ship destroyed? A Rogue Trader ship only by a Critical Hit result
 * whose table entry destroys it; 0 Hull Integrity only Cripples it. Every
 * other line keeps its 0-Hull reading.
 */
export function isShipDestroyed(ship: HullState & { readonly statuses: readonly ShipStatusView[] }): boolean {
    if (followsCrippledRules(ship.gameSystem)) return ship.statuses.some((status) => status.destroysShip);
    return ship.hullIntegrity.value <= 0;
}

/**
 * The condition the voidcraft sheet shows under Hull Integrity: Crippled or
 * destroyed. Rogue Trader only — another line's sheet shows neither, exactly
 * as before.
 */
export function shipConditionView(ship: HullState & { readonly statuses: readonly ShipStatusView[] }): { crippled: boolean; destroyed: boolean } {
    if (!followsCrippledRules(ship.gameSystem)) return { crippled: false, destroyed: false };
    return { crippled: suffersCrippledEffects(ship), destroyed: isShipDestroyed(ship) };
}
