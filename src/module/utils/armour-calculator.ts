/**
 * Armour calculation utilities for character actors.
 * Extracts complex armour computation logic from the main actor document.
 */

interface LegacyAPResult {
    defaultValue?: number;
    pointsByLocation?: Record<string, number>;
}

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
 * Handles nested structures where armourPoints might contain another armourPoints object.
 * @param {object} itemSystem - The item's system data
 * @returns {object|null} The armour points object or null
 */
function getArmourPointsObject(itemSystem: Record<string, unknown>): Record<string, unknown> | null {
    const raw = (itemSystem as any)?.armourPoints;
    if (!raw || typeof raw !== 'object') return null;
    // Handle nested structure
    if (raw.armourPoints && typeof raw.armourPoints === 'object') {
        return raw.armourPoints;
    }
    return raw;
}

/**
 * Parses legacy location strings into a Set of body locations.
 * @param {string} rawLocations - Legacy location string like "Head, Body, Arms"
 * @returns {Set|null} Set of location keys or null
 */
function parseLegacyLocations(rawLocations: string | null | undefined): Set<string> | null {
    if (!rawLocations || typeof rawLocations !== 'string') return null;
    const normalized = rawLocations.toLowerCase();
    if (normalized.includes('all')) {
        return new Set(['all']);
    }
    const coverage = new Set<string>();
    const tokens = normalized
        .split(',')
        .map((token: string) => token.trim())
        .filter(Boolean);
    for (const token of tokens) {
        if (token.includes('head')) {
            coverage.add('head');
        }
        if (token.includes('body') || token.includes('chest') || token.includes('torso')) {
            coverage.add('body');
        }
        if (token.includes('arm')) {
            coverage.add('leftArm');
            coverage.add('rightArm');
        }
        if (token.includes('leg')) {
            coverage.add('leftLeg');
            coverage.add('rightLeg');
        }
    }
    return coverage.size ? coverage : null;
}

/**
 * Parses legacy AP values from string or number format.
 * @param {string|number} rawAp - Legacy AP value
 * @returns {object|null} Parsed AP object with defaultValue or pointsByLocation
 */
function parseLegacyAP(rawAp: string | number | null | undefined): LegacyAPResult | null {
    if (rawAp === null || rawAp === undefined) return null;
    if (typeof rawAp === 'number') {
        return { defaultValue: rawAp };
    }
    if (typeof rawAp !== 'string') return null;
    const values = rawAp.match(/-?\d+(?:\.\d+)?/g);
    if (!values) return null;
    const parsed = values.map((value: string) => Number(value));
    if (parsed.length === 1) {
        return { defaultValue: parsed[0] };
    }
    if (parsed.length >= 6) {
        return {
            pointsByLocation: {
                head: parsed[0],
                body: parsed[1],
                leftArm: parsed[2],
                rightArm: parsed[3],
                leftLeg: parsed[4],
                rightLeg: parsed[5],
            },
        };
    }
    if (parsed.length === 4) {
        return {
            pointsByLocation: {
                head: parsed[0],
                body: parsed[1],
                leftArm: parsed[2],
                rightArm: parsed[2],
                leftLeg: parsed[3],
                rightLeg: parsed[3],
            },
        };
    }
    return null;
}

/**
 * Gets the AP value for a specific location from an armour item.
 * Handles both modern armourPoints schema and legacy formats.
 * Uses effective AP which includes craftsmanship bonuses.
 * @param {object} armourSystem - The armour item's system data
 * @param {string} location - Body location key
 * @returns {number} AP value for that location
 */
function getArmourAPForLocation(armourSystem: Record<string, unknown>, location: string): number {
    // Try modern getEffectiveAPForLocation method first (includes craftsmanship)
    if (armourSystem && typeof armourSystem.getEffectiveAPForLocation === 'function') {
        return armourSystem.getEffectiveAPForLocation(location);
    }

    // Fall back to getAPForLocation (base AP without craftsmanship)
    if (armourSystem && typeof armourSystem.getAPForLocation === 'function') {
        return armourSystem.getAPForLocation(location);
    }

    // Try modern armourPoints schema
    const armourPoints = getArmourPointsObject(armourSystem);
    if (armourPoints) {
        const hasValues = Object.values(armourPoints).some((value: unknown) => Number(value) > 0);
        if (hasValues) {
            const value = Number((armourPoints as any)?.[location] ?? 0);
            return Number.isFinite(value) ? value : 0;
        }
    }

    // Fall back to legacy format
    const coverage = parseLegacyLocations(armourSystem?.locations);
    if (coverage && !coverage.has('all') && !coverage.has(location)) {
        return 0;
    }
    const legacy = parseLegacyAP(armourSystem?.ap);
    if (!legacy) return 0;
    if (legacy.pointsByLocation) {
        return legacy.pointsByLocation[location] ?? 0;
    }
    return legacy.defaultValue ?? 0;
}

/**
 * Computes the total armour for each body location on an actor.
 * Combines toughness bonus, trait bonuses (Machine, Natural Armor),
 * cybernetics, and equipped armour items.
 *
 * @param {Actor} actor - The actor to compute armour for
 * @returns {object} Armour object with totals for each location
 */
export function computeArmour(actor: any): Record<string, ArmourLocationData> {
    const toughness = actor.characteristics.toughness;
    let traitBonus = 0;

    // Compute highest trait bonus from Machine or Natural Armor traits
    const traits = actor.items.filter((item: any) => item.type === 'trait');
    for (const trait of traits) {
        switch (trait.name) {
            case 'Machine':
            case 'Natural Armor':
            case 'Natural Armour':
                if (trait.system.level > traitBonus) {
                    traitBonus = trait.system.level;
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
        .filter((item: any) => item.type === 'cybernetic')
        .filter((item: any) => item.system.equipped)
        .filter((item: any) => item.system.hasArmourPoints)
        .forEach((cybernetic: any) => {
            const armourPoints = getArmourPointsObject(cybernetic.system);
            BODY_LOCATIONS.forEach((location: string) => {
                const armourVal = (armourPoints as any)?.[location] ?? 0;
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
        .filter((item: any) => item.type === 'armour')
        .filter((item: any) => item.system.equipped)
        .forEach((armourItem: any) => {
            // Check for Good craftsmanship armour
            if (armourItem.system.craftsmanship === 'good') {
                hasGoodArmour = true;
            }

            BODY_LOCATIONS.forEach((location: string) => {
                const armourVal = getArmourAPForLocation(armourItem.system, location);
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
            armour[location].goodArmourBonus = goodArmourBonus;
        }
    });

    return armour;
}

export { BODY_LOCATIONS, getArmourPointsObject, getArmourAPForLocation };
