/**
 * Armour calculation utilities for character actors.
 * Extracts complex armour computation logic from the main actor document.
 */

import type { WH40KBaseActor } from '../documents/base-actor.ts';
import type { WH40KItem } from '../documents/item.ts';

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

interface ArmourSystemLike {
    armourPoints?: ArmourPointsLike;
    getEffectiveAPForLocation?: (location: string) => number;
    getAPForLocation?: (location: string) => number;
}

const BODY_LOCATIONS: string[] = ['body', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];

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
export function computeArmour(actor: WH40KBaseActor): Record<string, ArmourLocationData> {
    const toughness = actor.characteristics['toughness'] as (typeof actor.characteristics)[string] | undefined;
    const toughnessBonus = toughness?.bonus ?? 0;
    let traitBonus = 0;

    // Compute highest trait bonus from Machine or Natural Armor traits
    const traits = actor.items.filter((item: WH40KItem) => item.type === 'trait');
    for (const trait of traits) {
        const system = trait.system as { level?: number };
        switch (trait.name) {
            case 'Machine':
            case 'Natural Armor':
            case 'Natural Armour':
                if (system.level !== undefined && system.level > traitBonus) {
                    traitBonus = system.level;
                }
                break;
        }
    }

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
        .filter((item: WH40KItem) => (item.system as { equipped?: boolean }).equipped === true)
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

    const equippedArmour = actor.items
        .filter((item: WH40KItem) => item.type === 'armour')
        .filter((item: WH40KItem) => (item.system as { equipped?: boolean }).equipped === true);

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

export { BODY_LOCATIONS, getArmourPointsObject, getArmourAPForLocation };
