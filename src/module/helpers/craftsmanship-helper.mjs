/**
 * CraftsmanshipHelper Utility Class
 *
 * Centralized utility for applying craftsmanship modifiers and qualities
 * across all item types (weapons, armour, gear, force fields).
 *
 * Uses CONFIG.ROGUE_TRADER.craftsmanshipRules as single source of truth.
 */
export default class CraftsmanshipHelper {
    /**
     * Get craftsmanship modifiers for any item type.
     * Returns an object with stat modifiers based on item type and craftsmanship.
     *
     * @param {ItemDataModel} item - Item data model
     * @returns {object} - Modifiers object (structure depends on item type)
     *
     * @example
     * // Melee weapon
     * CraftsmanshipHelper.getModifiers(weapon)
     * // Returns: { toHit: 10, damage: 1 } (for Best)
     *
     * @example
     * // Armour
     * CraftsmanshipHelper.getModifiers(armour)
     * // Returns: { armourBonus: 1, weight: 0.5 } (for Best)
     */
    static getModifiers(item) {
        const craftsmanship = item.craftsmanship ?? 'common';
        const rules = CONFIG.ROGUE_TRADER.craftsmanshipRules;

        if (!rules) {
            console.warn('RogueTrader | craftsmanshipRules not found in CONFIG');
            return {};
        }

        // Determine item type and sub-type
        const itemType = item.parent?.type;

        switch (itemType) {
            case 'weapon':
                return this.#getWeaponModifiers(item, craftsmanship, rules.weapon);
            case 'armour':
                return rules.armour[craftsmanship] ?? {};
            case 'gear':
                return rules.gear[craftsmanship] ?? {};
            case 'forceField':
                return rules.forceField[craftsmanship] ?? {};
            default:
                return {};
        }
    }

    /**
     * Get weapon-specific modifiers (handles melee vs ranged).
     * @param {WeaponData} weapon - Weapon data model
     * @param {string} craftsmanship - Craftsmanship tier
     * @param {object} weaponRules - Weapon craftsmanship rules
     * @returns {object} - Modifiers object
     * @private
     */
    static #getWeaponModifiers(weapon, craftsmanship, weaponRules) {
        const isMelee = weapon.melee || weapon.isMeleeWeapon;
        const subType = isMelee ? 'melee' : 'ranged';
        return weaponRules[subType][craftsmanship] ?? {};
    }

    /**
     * Get craftsmanship-derived qualities for weapons.
     * Only applies to ranged weapons.
     *
     * @param {WeaponData} weapon - Weapon data model
     * @returns {Set<string>} - Set of quality identifiers to add
     *
     * @example
     * CraftsmanshipHelper.getWeaponQualities(poorRangedWeapon)
     * // Returns: Set(['unreliable'])
     */
    static getWeaponQualities(weapon) {
        const craftsmanship = weapon.craftsmanship ?? 'common';
        const rules = CONFIG.ROGUE_TRADER.craftsmanshipRules?.weapon;

        if (!rules) return new Set();

        // Only ranged weapons get craftsmanship qualities
        const isMelee = weapon.melee || weapon.isMeleeWeapon;
        if (isMelee) return new Set();

        const rangedRules = rules.ranged[craftsmanship];
        return new Set(rangedRules?.qualities || []);
    }

    /**
     * Get qualities that should be removed by craftsmanship.
     * Only applies to ranged weapons.
     *
     * @param {WeaponData} weapon - Weapon data model
     * @returns {Set<string>} - Set of quality identifiers to remove
     *
     * @example
     * CraftsmanshipHelper.getRemoveQualities(bestRangedWeapon)
     * // Returns: Set(['unreliable', 'overheats'])
     */
    static getRemoveQualities(weapon) {
        const craftsmanship = weapon.craftsmanship ?? 'common';
        const rules = CONFIG.ROGUE_TRADER.craftsmanshipRules?.weapon;

        if (!rules) return new Set();

        // Only ranged weapons get craftsmanship qualities
        const isMelee = weapon.melee || weapon.isMeleeWeapon;
        if (isMelee) return new Set();

        const rangedRules = rules.ranged[craftsmanship];
        return new Set(rangedRules?.removeQualities || []);
    }

    /**
     * Apply craftsmanship qualities to a weapon's quality set.
     * Handles adding/removing qualities based on craftsmanship rules.
     *
     * @param {WeaponData} weapon - Weapon data model
     * @param {Set<string>} qualities - Existing qualities set (will be modified)
     * @returns {Set<string>} - Modified qualities set
     *
     * @example
     * const qualities = new Set(['scatter', 'unreliable']);
     * CraftsmanshipHelper.applyWeaponQualities(goodWeapon, qualities);
     * // qualities is now Set(['scatter']) - unreliable removed
     */
    static applyWeaponQualities(weapon, qualities) {
        // Only ranged weapons get craftsmanship qualities
        const isMelee = weapon.melee || weapon.isMeleeWeapon;
        if (isMelee) return qualities;

        const craftsmanship = weapon.craftsmanship ?? 'common';
        const hasUnreliable = qualities.has('unreliable');

        const toAdd = this.getWeaponQualities(weapon);
        const toRemove = this.getRemoveQualities(weapon);

        // Add qualities
        for (const quality of toAdd) {
            qualities.add(quality);
        }

        // Remove qualities
        for (const quality of toRemove) {
            qualities.delete(quality);
        }

        // Special logic for Good/Exceptional craftsmanship:
        // If Reliable quality would be added, but weapon already has Unreliable,
        // cancel out instead of adding Reliable
        if (['good', 'exceptional'].includes(craftsmanship)) {
            if (hasUnreliable && toAdd.has('reliable')) {
                qualities.delete('unreliable');
                qualities.delete('reliable'); // Don't add Reliable, just cancel Unreliable
            }
        }

        return qualities;
    }

    /**
     * Check if an item has craftsmanship-derived effects.
     *
     * @param {ItemDataModel} item - Item data model
     * @returns {boolean} - True if craftsmanship is not 'common'
     */
    static hasCraftsmanshipEffects(item) {
        const craftsmanship = item.craftsmanship ?? 'common';
        return craftsmanship !== 'common';
    }

    /**
     * Get force field overload range for craftsmanship tier.
     *
     * @param {ForceFieldData} forceField - Force field data model
     * @returns {[number, number]} - [min, max] overload range
     *
     * @example
     * CraftsmanshipHelper.getForceFieldOverloadRange(poorField)
     * // Returns: [1, 20]
     */
    static getForceFieldOverloadRange(forceField) {
        const craftsmanship = forceField.craftsmanship ?? 'common';
        const rules = CONFIG.ROGUE_TRADER.craftsmanshipRules?.forceField;

        if (!rules) return [1, 10]; // Default to common

        const tierRules = rules[craftsmanship];
        return tierRules?.overloadRange ?? [1, 10];
    }

    /**
     * Check if a protection roll causes overload.
     *
     * @param {ForceFieldData} forceField - Force field data model
     * @param {number} roll - Protection roll result (1-100)
     * @returns {boolean} - True if roll is in overload range
     */
    static isOverloadRoll(forceField, roll) {
        const [min, max] = this.getForceFieldOverloadRange(forceField);
        return roll >= min && roll <= max;
    }

    /**
     * Get human-readable summary of craftsmanship effects for an item.
     * Used for tooltips and UI display.
     *
     * @param {ItemDataModel} item - Item data model
     * @returns {string[]} - Array of effect descriptions
     *
     * @example
     * CraftsmanshipHelper.getEffectSummary(bestMeleeWeapon)
     * // Returns: ['+10 to attack', '+1 damage']
     */
    static getEffectSummary(item) {
        const modifiers = this.getModifiers(item);
        const effects = [];
        const itemType = item.parent?.type;

        // Weapon
        if (itemType === 'weapon') {
            if (modifiers.toHit) {
                effects.push(`${modifiers.toHit > 0 ? '+' : ''}${modifiers.toHit} to attack`);
            }
            if (modifiers.damage) {
                effects.push(`+${modifiers.damage} damage`);
            }

            // Ranged weapon qualities
            const isMelee = item.melee || item.isMeleeWeapon;
            if (!isMelee) {
                const addQualities = this.getWeaponQualities(item);
                const removeQualities = this.getRemoveQualities(item);

                for (const quality of addQualities) {
                    effects.push(`Gains ${quality.capitalize()} quality`);
                }
                for (const quality of removeQualities) {
                    effects.push(`Removes ${quality.capitalize()} quality`);
                }
            }
        }

        // Armour
        if (itemType === 'armour') {
            if (modifiers.agility) {
                effects.push(`${modifiers.agility} to Agility tests`);
            }
            if (modifiers.armourBonus) {
                effects.push(`+${modifiers.armourBonus} AP (permanent)`);
            }
            if (modifiers.firstAttackBonus) {
                effects.push(`+${modifiers.firstAttackBonus} AP on first attack per round`);
            }
            if (modifiers.weight && modifiers.weight !== 1.0) {
                const percent = Math.round((modifiers.weight - 1) * 100);
                effects.push(`${percent > 0 ? '+' : ''}${percent}% weight`);
            }
        }

        // Gear
        if (itemType === 'gear') {
            if (modifiers.weight && modifiers.weight !== 1.0) {
                const percent = Math.round((modifiers.weight - 1) * 100);
                effects.push(`${percent > 0 ? '+' : ''}${percent}% weight`);
            }
        }

        // Force Field
        if (itemType === 'forceField') {
            if (modifiers.overloadRange) {
                const [min, max] = modifiers.overloadRange;
                if (min === max) {
                    effects.push(`Overloads on ${String(min).padStart(2, '0')}`);
                } else {
                    effects.push(`Overloads on ${String(min).padStart(2, '0')}-${String(max).padStart(2, '0')}`);
                }
            }
        }

        return effects;
    }
}
