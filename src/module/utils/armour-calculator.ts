/**
 * Armour calculation utilities for character actors.
 * Extracts complex armour computation logic from the main actor document.
 */

import { BODY_LOCATIONS } from '../data/shared/body-locations.ts';
import type { WH40KBaseActor } from '../documents/base-actor.ts';
import type { WH40KItem } from '../documents/item.ts';
import { itemIdentifier } from './item-identifier.ts';

interface ArmourLocationData {
    total: number;
    toughnessBonus: number;
    traitBonus: number;
    value: number;
    goodArmourBonus?: number;
}

interface ArmourPointsLike {
    [location: string]: number | undefined;
}

export interface ArmourSystemLike {
    armourPoints?: ArmourPointsLike;
    getEffectiveAPForLocation?: (location: string) => number;
    getAPForLocation?: (location: string) => number;
}

/** Options controlling how {@link computeArmour} gathers armour sources. */
export interface ComputeArmourOptions {
    /**
     * When `true` (default), only armour/cybernetic items whose `state.equipped`
     * is `true` contribute — the PC model, where gear is explicitly worn. When
     * `false`, every owned armour/cybernetic item counts, which is the NPC model:
     * a stat-block NPC wears the armour listed in its inventory (its lean items
     * carry no equip toggle).
     */
    equippedOnly?: boolean;
}

/**
 * `system.identifier`s of the traits whose rating is armour on every location:
 * Machine (X) and Natural Armour (X). DH2, OW and BC print that the two do not
 * stack; DH1, RT and DW print nothing on it, so the higher one counts in every
 * line.
 */
const ARMOUR_TRAIT_IDENTIFIERS: ReadonlySet<string> = new Set(['machine', 'naturalArmour']);

/** The first integer in a string, or `null` when there is none. */
function firstInteger(text: string | null | undefined): number | null {
    if (typeof text !== 'string') return null;
    const match = /\d+/.exec(text);
    return match === null ? null : Number(match[0]);
}

/**
 * Read the armour rating carried by a Machine / Natural Armour trait: its
 * `level`, else the integer in its `specialization` (the SPEC-philosophy
 * authoring, #261, parks it there — "Natural Armour" with `specialization: "3"`),
 * else the integer in its name (embedded stat-block traits are named
 * "Machine (8)").
 * @param {object} trait - The trait item's name and system data
 * @returns {number} The armour rating, or 0 when none is authored
 */
function traitArmourRating(trait: { name: string; system: { level?: number; specialization?: string | null } }): number {
    const level = trait.system.level;
    if (level !== undefined && level > 0) return level;
    return firstInteger(trait.system.specialization) ?? firstInteger(trait.name) ?? 0;
}

/** The trait-item surface the armour-trait reader needs. */
interface ArmourTraitLike {
    type: string;
    name: string;
    system: { identifier?: string; level?: number; specialization?: string | null };
}

/**
 * The armour the bearer's Machine / Natural Armour traits grant: the highest
 * single rating (the two never stack), matched by `system.identifier`.
 */
function armourTraitBonus(items: Iterable<ArmourTraitLike>): number {
    let best = 0;
    for (const item of items) {
        if (item.type !== 'trait' || !ARMOUR_TRAIT_IDENTIFIERS.has(itemIdentifier(item))) continue;
        best = Math.max(best, traitArmourRating(item));
    }
    return best;
}

/**
 * Gets the armourPoints object from an item's system data.
 * @param {object} itemSystem - The item's system data
 * @returns {object|null} The armour points object or null
 */
function getArmourPointsObject(itemSystem: ArmourSystemLike): ArmourPointsLike | null {
    const raw = itemSystem.armourPoints;
    if (raw === undefined || typeof raw !== 'object') return null;
    return raw;
}

/**
 * Gets the AP value for a specific location from an armour item.
 * Uses effective AP which includes craftsmanship bonuses.
 * @param {object} armourSystem - The armour item's system data
 * @param {string} location - Body location key
 * @returns {number} AP value for that location
 */
function getArmourAPForLocation(armourSystem: ArmourSystemLike, location: string): number {
    if (typeof armourSystem.getEffectiveAPForLocation === 'function') {
        return armourSystem.getEffectiveAPForLocation(location);
    }
    if (typeof armourSystem.getAPForLocation === 'function') {
        return armourSystem.getAPForLocation(location);
    }

    const armourPoints = getArmourPointsObject(armourSystem);
    if (armourPoints) {
        const value = Number(armourPoints[location] ?? 0);
        return Number.isFinite(value) ? value : 0;
    }
    return 0;
}

/**
 * Computes the total armour for each body location on an actor.
 * Combines toughness bonus, trait bonuses (Machine, Natural Armor),
 * cybernetics, and equipped armour items.
 *
 * @param {Actor} actor - The actor to compute armour for
 * @returns {object} Armour object with totals for each location
 */
export function computeArmour(actor: WH40KBaseActor, options: ComputeArmourOptions = {}): Record<string, ArmourLocationData> {
    const equippedOnly = options.equippedOnly !== false;
    const isWorn = (item: WH40KItem): boolean => !equippedOnly || (item.system as { state?: { equipped?: boolean } }).state?.equipped === true;

    const toughness = actor.characteristics['toughness'] as (typeof actor.characteristics)[string] | undefined;
    const toughnessBonus = toughness?.bonus ?? 0;

    // Highest Machine / Natural Armour rating (they do not stack).
    const traitBonus = armourTraitBonus(
        actor.items
            .filter((item: WH40KItem) => item.type === 'trait')
            .map((item: WH40KItem) => ({ type: item.type, name: item.name, system: item.system as ArmourTraitLike['system'] })),
    );

    // Initialize armour object with base values (TB + trait bonus)
    const armour: Record<string, ArmourLocationData> = BODY_LOCATIONS.reduce(
        (acc: Record<string, ArmourLocationData>, location: string) =>
            Object.assign(acc, {
                [location]: {
                    total: toughnessBonus + traitBonus,
                    toughnessBonus,
                    traitBonus,
                    value: 0,
                },
            }),
        {},
    );

    // Add cybernetic armour (cumulative)
    actor.items
        .filter((item: WH40KItem) => item.type === 'cybernetic')
        .filter(isWorn)
        .filter((item: WH40KItem) => (item.system as { hasArmourPoints?: boolean }).hasArmourPoints === true)
        .forEach((cybernetic: WH40KItem) => {
            const armourPoints = getArmourPointsObject(cybernetic.system as ArmourSystemLike);
            BODY_LOCATIONS.forEach((location: string) => {
                const armourVal = armourPoints?.[location] ?? 0;
                const loc = armour[location] as ArmourLocationData | undefined;
                if (loc !== undefined) loc.total += Number(armourVal);
            });
        });

    // Find maximum armour value per location from equipped armour items
    const maxArmour: Record<string, number> = BODY_LOCATIONS.reduce(
        (acc: Record<string, number>, location: string) => Object.assign(acc, { [location]: 0 }),
        {},
    );
    let hasGoodArmour = false;

    const equippedArmour = actor.items.filter((item: WH40KItem) => item.type === 'armour').filter(isWorn);

    for (const armourItem of equippedArmour) {
        // Check for Good craftsmanship armour
        const system = armourItem.system as { craftsmanship?: string };
        if (system.craftsmanship === 'good') {
            hasGoodArmour = true;
        }

        for (const location of BODY_LOCATIONS) {
            const armourVal = getArmourAPForLocation(armourItem.system as ArmourSystemLike, location);
            const currentMax = maxArmour[location] ?? 0;
            if (armourVal > currentMax) {
                maxArmour[location] = armourVal;
            }
        }
    }

    // Apply Good armour bonus (+1 AP on first attack per round)
    const isFirstAttack = actor.getFlag('wh40k-rpg', 'hitThisRound') !== true;
    const goodArmourBonus = hasGoodArmour && isFirstAttack ? 1 : 0;

    // Apply max armour values and update totals
    BODY_LOCATIONS.forEach((location: string) => {
        const loc = armour[location] as ArmourLocationData | undefined;
        const locMax = (maxArmour[location] as number | undefined) ?? 0;
        if (loc === undefined) return;
        loc.value = locMax;
        loc.total += locMax + goodArmourBonus;
        if (goodArmourBonus > 0) {
            loc.goodArmourBonus = goodArmourBonus;
        }
    });

    return armour;
}

export { getArmourPointsObject, getArmourAPForLocation };
