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

const BODY_LOCATIONS: string[] = ['body', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];

/**
 * Gets the armourPoints object from an item's system data.
 * @param {object} itemSystem - The item's system data
 * @returns {object|null} The armour points object or null
 */
function getArmourPointsObject(itemSystem: Record<string, unknown>): Record<string, unknown> | null {
    const raw = (itemSystem as { armourPoints?: any })?.armourPoints;
    if (!raw || typeof raw !== 'object') return null;
    return raw as Record<string, unknown>;
}

/**
 * Gets the AP value for a specific location from an armour item.
 * Uses effective AP which includes craftsmanship bonuses.
 * @param {object} armourSystem - The armour item's system data
 * @param {string} location - Body location key
 * @returns {number} AP value for that location
 */
function getArmourAPForLocation(armourSystem: Record<string, unknown>, location: string): number {
    if (armourSystem && typeof armourSystem.getEffectiveAPForLocation === 'function') {
        return armourSystem.getEffectiveAPForLocation(location);
    }
    if (armourSystem && typeof armourSystem.getAPForLocation === 'function') {
        return armourSystem.getAPForLocation(location);
    }

    const armourPoints = getArmourPointsObject(armourSystem);
    if (armourPoints) {
        const value = Number((armourPoints as any)?.[location] ?? 0);
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
    const toughness = actor.characteristics.toughness;
    let traitBonus = 0;

    // Compute highest trait bonus from Machine or Natural Armor traits
    const traits = actor.items.filter((item: WH40KItem) => item.type === 'trait');
    for (const trait of traits) {
        const system = trait.system as { level?: number };
        switch (trait.name) {
            case 'Machine':
            case 'Natural Armor':
            case 'Natural Armour':
                if (system.level && system.level > traitBonus) {
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
                    total: toughness.bonus + traitBonus,
                    toughnessBonus: toughness.bonus,
                    traitBonus: traitBonus,
                    value: 0,
                },
            }),
        {},
    );

    // Add cybernetic armour (cumulative)
    actor.items
        .filter((item: WH40KItem) => item.type === 'cybernetic')
        .filter((item: WH40KItem) => (item.system as { equipped?: boolean }).equipped)
        .filter((item: WH40KItem) => (item.system as { hasArmourPoints?: boolean }).hasArmourPoints)
        .forEach((cybernetic: WH40KItem) => {
            const armourPoints = getArmourPointsObject(cybernetic.system as Record<string, unknown>);
            BODY_LOCATIONS.forEach((location: string) => {
                const armourVal = (armourPoints as Record<string, unknown>)?.[location] ?? 0;
                armour[location].total += Number(armourVal);
            });
        });

    // Find maximum armour value per location from equipped armour items
    const maxArmour: Record<string, number> = BODY_LOCATIONS.reduce(
        (acc: Record<string, number>, location: string) => Object.assign(acc, { [location]: 0 }),
        {},
    );
    let hasGoodArmour = false;

    actor.items
        .filter((item: WH40KItem) => item.type === 'armour')
        .filter((item: WH40KItem) => (item.system as { equipped?: boolean }).equipped)
        .forEach((armourItem: WH40KItem) => {
            // Check for Good craftsmanship armour
            const system = armourItem.system as { craftsmanship?: string };
            if (system.craftsmanship === 'good') {
                hasGoodArmour = true;
            }

            BODY_LOCATIONS.forEach((location: string) => {
                const armourVal = getArmourAPForLocation(armourItem.system as Record<string, unknown>, location);
                if (armourVal > maxArmour[location]) {
                    maxArmour[location] = armourVal;
                }
            });
        });

    // Apply Good armour bonus (+1 AP on first attack per round)
    const isFirstAttack = !actor.getFlag('wh40k-rpg', 'hitThisRound');
    const goodArmourBonus = hasGoodArmour && isFirstAttack ? 1 : 0;

    // Apply max armour values and update totals
    BODY_LOCATIONS.forEach((location: string) => {
        armour[location].value = maxArmour[location];
        armour[location].total += maxArmour[location] + goodArmourBonus;
        if (goodArmourBonus > 0) {
            (armour[location] as ArmourLocationData & { goodArmourBonus?: number }).goodArmourBonus = goodArmourBonus;
        }
    });

    return armour;
}

export { BODY_LOCATIONS, getArmourPointsObject, getArmourAPForLocation };
