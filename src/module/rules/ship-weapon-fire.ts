/**
 * Rogue Trader ship weapon fire (#184 — RT rules with the 1.4 errata,
 * "Starship Weapons" and "Damage and Defences").
 *
 * The gunner's Ballistic Skill Test, then the shot resolved against the
 * target ship:
 *
 * - **Hits.** A macrobattery scores one hit plus one per Degree of Success; a
 *   lance one hit plus one per three degrees. Either is capped at the weapon's
 *   Strength ("the maximum number of hits a macrobattery or lance can land").
 * - **Void shields** cancel one incoming hit each, macrobattery or lance, then
 *   overload: the spent shields are down for the rest of this ship's fire.
 * - **Damage.** Each remaining hit rolls the weapon's Damage. A macrobattery's
 *   hits are added together and the target's Armour is subtracted from the
 *   total; a lance's hits are resolved one by one and ignore Armour.
 * - **Critical Hit.** Degrees of Success equal to the Crit Rating cause one; a
 *   shot that dealt no Hull Integrity damage then inflicts 1 automatic point.
 * - **Range.** Within half the weapon's range +10; beyond it (out to twice the
 *   range) −10.
 *
 * Degrees of Success follow RT's count: one per full 10 the roll beat the
 * target by, so a bare success is 0 degrees and one hit (the book's example:
 * BS 58, roll 29 → two degrees, three macrobattery hits).
 *
 * Every term reaches the card as a named component (labelled by langpack key)
 * so the derivation is printed in full. Pure module: no Foundry, no RNG —
 * callers roll the dice and pass the totals in.
 */

import {
    deriveTarget,
    resolveShipTest,
    situationalComponents,
    sumComponents,
    type ShipTestComponent,
    type ShipTestDerivation,
    type ShipTestResult,
    type SituationalModifier,
} from './ship-assault.ts';

/** The weapon classes the core rules give firing rules for. */
export type ShipWeaponClass = 'macrobattery' | 'lance';

/** The firing rule a Weapon Component's `weaponType` follows, or null when the core rules give none. */
export function shipWeaponClass(weaponType: string): ShipWeaponClass | null {
    return weaponType === 'macrobattery' || weaponType === 'lance' ? weaponType : null;
}

/** How far the target is, relative to the weapon's range. */
export type ShipRangeBand = 'close' | 'standard' | 'long';

/** The range bands in the order a dialog offers them. */
export const SHIP_RANGE_BANDS: readonly ShipRangeBand[] = ['close', 'standard', 'long'];

/** Ballistic Skill modifier per range band. */
const RANGE_BAND_MODIFIER: Record<ShipRangeBand, number> = { close: 10, standard: 0, long: -10 };

/** Langpack key of each non-zero range band's test row. */
const RANGE_BAND_COMPONENT_KEY: Record<ShipRangeBand, string> = {
    close: 'WH40K.Voidcraft.Fire.Component.RangeClose',
    standard: '',
    long: 'WH40K.Voidcraft.Fire.Component.RangeLong',
};

/** How many times the weapon's range each band reaches out to. */
const RANGE_BAND_REACH: Record<ShipRangeBand, number> = { close: 0.5, standard: 1, long: 2 };

/** The farthest a target in this band can be, in VUs. */
export function rangeBandReach(band: ShipRangeBand, range: number): number {
    return range * RANGE_BAND_REACH[band];
}

/** Narrow a form value to a range band, defaulting to standard range. */
export function toRangeBand(value: string): ShipRangeBand {
    return SHIP_RANGE_BANDS.find((band) => band === value) ?? 'standard';
}

/** Langpack key of the gunner's Ballistic Skill base row. */
export const GUNNER_SKILL_KEY = 'WH40K.Voidcraft.Fire.Component.GunnerSkill';

/** Inputs to the gunner's Ballistic Skill Test. */
export interface GunneryTestInput {
    /** The Ballistic Skill of the character directing the fire. */
    readonly ballisticSkill: number;
    /** Ship-action modifiers on this weapon's test (Lock on Target, Evasive Manoeuvres, …). */
    readonly shipModifiers: readonly ShipTestComponent[];
    readonly band: ShipRangeBand;
    /** The weapon's range in VUs, named on the range row. */
    readonly range: number;
    readonly situational?: SituationalModifier;
}

/** Compose the gunner's Ballistic Skill Test: base ± ship actions ± range ± situational. */
export function composeGunneryTest(input: GunneryTestInput): ShipTestDerivation {
    const rangeValue = RANGE_BAND_MODIFIER[input.band];
    const range: ShipTestComponent[] =
        rangeValue === 0 ? [] : [{ labelKey: RANGE_BAND_COMPONENT_KEY[input.band], value: rangeValue, data: { range: input.range } }];
    return deriveTarget({ labelKey: GUNNER_SKILL_KEY, value: input.ballisticSkill }, [
        ...input.shipModifiers,
        ...range,
        ...situationalComponents(input.situational),
    ]);
}

/**
 * Resolve the rolled test with RT's degrees: one per full 10 of margin, so a
 * bare success or failure is 0 degrees. Natural 01 passes and 100 fails. The
 * hit counts ("one hit, plus an additional hit for each degree of success")
 * are written against that count, so it is pinned rather than following the
 * `degreesMode` override.
 */
export function resolveGunneryTest(derivation: ShipTestDerivation, roll: number): ShipTestResult {
    return resolveShipTest(derivation, roll, 'gen1');
}

/** Hits scored by a shot, with the terms that produced them. */
export interface ScoredHits {
    readonly components: readonly ShipTestComponent[];
    readonly hits: number;
}

/** Degrees of Success a lance needs per extra hit. */
const LANCE_DEGREES_PER_HIT = 3;

/**
 * A Crippled ship's weapon Strength: "reduce the strength of all weapon
 * Components by half (round up)" (RT 1.4 errata, "Crippled Ships").
 */
export function crippledStrength(strength: number): number {
    return Math.ceil(strength / 2);
}

/**
 * The hits a resolved test scores: one for the success plus the class's extra
 * hits for its degrees, capped at the weapon's Strength. A miss scores none.
 *
 * When the firing ship is Crippled its weapons fire at half Strength (round
 * up). That cap is its own row, so the card shows the Crippled state as the
 * reason hits were lost — even when it cost nothing this shot (a 0 row).
 */
export function scoreHits(weaponClass: ShipWeaponClass, strength: number, shot: ShipTestResult, crippled: boolean): ScoredHits {
    if (!shot.success || strength <= 0) return { components: [], hits: 0 };
    const extra = weaponClass === 'lance' ? Math.floor(shot.dos / LANCE_DEGREES_PER_HIT) : shot.dos;
    const components: ShipTestComponent[] = [{ labelKey: 'WH40K.Voidcraft.Fire.Component.BaseHit', value: 1 }];
    if (extra > 0) {
        const key = weaponClass === 'lance' ? 'WH40K.Voidcraft.Fire.Component.LanceDegreeHits' : 'WH40K.Voidcraft.Fire.Component.DegreeHits';
        components.push({ labelKey: key, value: extra, data: { dos: shot.dos } });
    }
    const raw = 1 + extra;
    const capped = Math.min(raw, strength);
    if (raw > strength) components.push({ labelKey: 'WH40K.Voidcraft.Fire.Component.StrengthCap', value: strength - raw, data: { strength } });
    if (!crippled) return { components, hits: capped };
    const halved = crippledStrength(strength);
    components.push({ labelKey: 'WH40K.Voidcraft.Fire.Component.CrippledStrength', value: Math.min(0, halved - capped), data: { strength, halved } });
    return { components, hits: Math.min(capped, halved) };
}

/** Hits after the target's void shields. */
export interface ShieldedHits {
    /** Hits the shields cancelled — and the shields that overloaded doing it. */
    readonly cancelled: number;
    readonly remaining: number;
}

/** Each raised void shield cancels one incoming hit, then overloads. */
export function applyVoidShields(hits: number, shieldsUp: number): ShieldedHits {
    const cancelled = Math.max(0, Math.min(hits, shieldsUp));
    return { cancelled, remaining: hits - cancelled };
}

/** The void-shield row of the hit derivation, or nothing when no shield was up to cancel a hit. */
export function voidShieldComponents(shielded: ShieldedHits, target: { readonly name: string; readonly shieldsUp: number }): ShipTestComponent[] {
    if (shielded.cancelled === 0) return [];
    return [{ labelKey: 'WH40K.Voidcraft.Fire.Component.VoidShields', value: -shielded.cancelled, data: { ship: target.name, shields: target.shieldsUp } }];
}

/** Whether the shot causes a Critical Hit: a hit whose degrees reach the Crit Rating. */
export function isShipCriticalHit(shot: ShipTestResult, critRating: number): boolean {
    return shot.success && critRating > 0 && shot.dos >= critRating;
}

/** One rolled damage die-roll for a hit that got through the shields. */
export interface HitDamageRoll {
    readonly total: number;
    readonly formula: string;
    /** The macrobattery that scored the hit, named on the row when hits from several are combined in a salvo. */
    readonly weapon?: string;
}

/** The target's defences a shot's damage meets. */
export interface ShipDamageTarget {
    readonly name: string;
    readonly armour: number;
}

/** The Hull Integrity a shot takes off its target, with every term. */
export interface ShipHullDamage {
    readonly components: readonly ShipTestComponent[];
    readonly hullLoss: number;
}

/**
 * The Hull Integrity damage of the hits that got through. A macrobattery sums
 * its hits and subtracts Armour once (a total at or under Armour does nothing);
 * a lance ignores Armour, so each hit lands in full. A Critical Hit on a shot
 * that dealt no hull damage adds 1 automatic point.
 */
export function resolveHullDamage(weaponClass: ShipWeaponClass, damage: readonly HitDamageRoll[], target: ShipDamageTarget, critical: boolean): ShipHullDamage {
    const components: ShipTestComponent[] = damage.map(
        (roll, index): ShipTestComponent =>
            roll.weapon === undefined
                ? { labelKey: 'WH40K.Voidcraft.Fire.Component.HitDamage', value: roll.total, data: { hit: index + 1, formula: roll.formula } }
                : {
                      labelKey: 'WH40K.Voidcraft.Fire.Component.SalvoHitDamage',
                      value: roll.total,
                      data: { hit: index + 1, formula: roll.formula, weapon: roll.weapon },
                  },
    );
    const rolled = sumComponents(components);
    if (damage.length > 0) {
        if (weaponClass === 'lance') {
            components.push({ labelKey: 'WH40K.Voidcraft.Fire.Component.ArmourIgnored', value: 0, data: { ship: target.name, armour: target.armour } });
        } else {
            components.push({
                labelKey: 'WH40K.Voidcraft.Fire.Component.Armour',
                value: -Math.min(target.armour, rolled),
                data: { ship: target.name, armour: target.armour },
            });
        }
    }
    if (critical && sumComponents(components) <= 0) {
        components.push({ labelKey: 'WH40K.Voidcraft.Fire.Component.CriticalPoint', value: 1 });
    }
    return { components, hullLoss: Math.max(0, sumComponents(components)) };
}

/**
 * The damage past Armour of each application of a shot's damage, the value a
 * Crippled target's Critical Hit is read at (#187). A macrobattery (and a
 * salvo) applies its summed hits once, less Armour; a lance applies each hit
 * on its own and ignores Armour, so each hit is all past it.
 */
export function damagePastArmour(weaponClass: ShipWeaponClass, damage: readonly HitDamageRoll[], armour: number): number[] {
    if (weaponClass === 'lance') return damage.map((roll) => roll.total);
    const total = damage.reduce((sum, roll) => sum + roll.total, 0);
    return damage.length === 0 ? [] : [total - armour];
}

/* -------------------------------------------- */
/*  Macrobattery salvos                         */
/* -------------------------------------------- */

/*
 * RT rules with the 1.4 errata, "Starship Weapons": "If a ship fires multiple
 * macrobatteries at a single target, before rolling to hit … the character
 * directing the firing has the option of adding the totals together and
 * applying the new, larger total to the target ship once … he can only
 * inflict a maximum of one Critical Hit." Each battery still makes its own
 * Ballistic Skill Test ("Even if all of the macrobatteries cause Critical Hits
 * on their Ballistic Skill Tests, only one Critical Hit is applied"), and
 * "Damage and Defences": "the attacker chooses which hits are
 * discarded by the void shields." Lances are never combined.
 */

/** One macrobattery's part in a salvo: its own test and the hits it scored. */
export interface SalvoBatteryShot {
    readonly name: string;
    readonly damage: string;
    readonly crit: number;
    readonly test: ShipTestResult;
    readonly scored: ScoredHits;
}

/** A salvo battery with the hits the void shields discarded from it. */
export type ShieldedSalvoBattery = SalvoBatteryShot & { readonly cancelled: number };

/** A whole damage formula: signed `NdM` and flat terms, nothing else. */
const DAMAGE_FORMULA = /^[+-]?(?:\d*d\d+|\d+)(?:[+-](?:\d*d\d+|\d+))*$/u;

/** One signed term of a damage formula. */
const DAMAGE_TERM = /[+-]?[^+-]+/gu;

/**
 * The average of a ship weapon's Damage formula (`1d10+2`, `2d10`), used only
 * to order which battery the void shields take hits from by default. A formula
 * this cannot read averages Infinity, so it is never the default to discard.
 */
export function averageDamage(formula: string): number {
    const compact = formula.replace(/\s+/gu, '').toLowerCase();
    if (DAMAGE_FORMULA.exec(compact) === null) return Number.POSITIVE_INFINITY;
    let total = 0;
    for (const signed of compact.match(DAMAGE_TERM) ?? []) {
        const sign = signed.startsWith('-') ? -1 : 1;
        const term = signed.replace(/^[+-]/u, '');
        const d = term.indexOf('d');
        if (d < 0) {
            total += sign * Number(term);
        } else {
            const count = term.slice(0, d);
            total += sign * Number(count === '' ? '1' : count) * ((Number(term.slice(d + 1)) + 1) / 2);
        }
    }
    return total;
}

/**
 * The battery the attacker's void-shield choice should default to: the one
 * whose hits are worth least (lowest average Damage), first listed on a tie.
 */
export function defaultShieldedBattery(batteries: readonly { readonly damage: string }[]): number {
    const averages = batteries.map((battery) => averageDamage(battery.damage));
    return Math.max(0, averages.indexOf(Math.min(...averages)));
}

/**
 * Spend the target's raised void shields on the salvo's pooled hits: the
 * attacker's chosen battery first, then the rest by lowest average Damage.
 * Returns each battery, in battery order, with the hits it lost to the shields.
 */
export function allocateSalvoShields<T extends { readonly damage: string; readonly hits: number }>(
    batteries: readonly T[],
    shieldsUp: number,
    first: number,
): Array<T & { readonly cancelled: number }> {
    const order = batteries
        .map((battery, index) => ({ battery, index, average: averageDamage(battery.damage) }))
        .sort((a, b) => (a.index === first ? -1 : b.index === first ? 1 : a.average - b.average || a.index - b.index));
    const taken = new Map<number, number>();
    let shields = Math.max(0, shieldsUp);
    for (const { battery, index } of order) {
        const lost = Math.min(battery.hits, shields);
        taken.set(index, lost);
        shields -= lost;
    }
    return batteries.map((battery, index) => ({ ...battery, cancelled: taken.get(index) ?? 0 }));
}

/**
 * The pooled hits derivation of a salvo: each battery's hits, then each
 * battery's hits the shields discarded, totalling the hits that land.
 */
export function salvoHitComponents(batteries: readonly ShieldedSalvoBattery[], target: { readonly name: string }): ShipTestComponent[] {
    const scored = batteries.map((battery) => ({
        labelKey: 'WH40K.Voidcraft.Fire.Component.SalvoBatteryHits',
        value: battery.scored.hits,
        data: { weapon: battery.name },
    }));
    const shielded = batteries
        .filter((battery) => battery.cancelled > 0)
        .map((battery) => ({
            labelKey: 'WH40K.Voidcraft.Fire.Component.SalvoShields',
            value: -battery.cancelled,
            data: { ship: target.name, weapon: battery.name },
        }));
    return [...scored, ...shielded];
}

/** A salvo causes one Critical Hit at most, when any battery's test met its Crit Rating. */
export function isSalvoCriticalHit(batteries: readonly SalvoBatteryShot[]): boolean {
    return batteries.some((battery) => isShipCriticalHit(battery.test, battery.crit));
}
