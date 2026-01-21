/**
 * @file Range Calculator - Weapon Range Brackets and Modifiers System
 * Calculates range brackets and applies modifiers for weapon attacks.
 *
 * Range Brackets:
 * - Point Blank: <= 2m (+30)
 * - Short Range: <= weapon range / 2 (+10)
 * - Standard Range: <= weapon range * 2 (0)
 * - Long Range: <= weapon range * 3 (-10)
 * - Extreme Range: > weapon range * 3 (-30)
 */

/**
 * Range bracket definitions.
 * @type {Object<string, {label: string, modifier: number, description: string}>}
 */
export const RANGE_BRACKETS = {
    pointBlank: {
        label: 'Point Blank',
        modifier: 30,
        description: '2 meters or less',
        maxMultiplier: 0, // Special case: always <= 2m
    },
    short: {
        label: 'Short Range',
        modifier: 10,
        description: 'Half weapon range or less',
        maxMultiplier: 0.5,
    },
    standard: {
        label: 'Standard Range',
        modifier: 0,
        description: 'Up to double weapon range',
        maxMultiplier: 2,
    },
    long: {
        label: 'Long Range',
        modifier: -10,
        description: 'Up to triple weapon range',
        maxMultiplier: 3,
    },
    extreme: {
        label: 'Extreme Range',
        modifier: -30,
        description: 'Beyond triple weapon range',
        maxMultiplier: Infinity,
    },
};

/**
 * Calculate the range bracket for a given distance and weapon range.
 * @param {number} distance - Distance to target in meters
 * @param {number} weaponRange - Base weapon range in meters
 * @returns {{bracket: string, label: string, modifier: number, description: string}}
 */
export function calculateRangeBracket(distance, weaponRange) {
    // Handle melee weapons
    if (weaponRange <= 1 || distance <= 1) {
        return {
            bracket: 'melee',
            label: 'Melee',
            modifier: 0,
            description: 'Melee range',
        };
    }

    // Handle self-targeting
    if (distance === 0) {
        return {
            bracket: 'self',
            label: 'Self',
            modifier: 0,
            description: 'Self-target',
        };
    }

    // Point Blank: Always 2m or less
    if (distance <= 2) {
        return {
            bracket: 'pointBlank',
            label: RANGE_BRACKETS.pointBlank.label,
            modifier: RANGE_BRACKETS.pointBlank.modifier,
            description: RANGE_BRACKETS.pointBlank.description,
        };
    }

    // Short Range: Up to half weapon range
    if (distance <= weaponRange * RANGE_BRACKETS.short.maxMultiplier) {
        return {
            bracket: 'short',
            label: RANGE_BRACKETS.short.label,
            modifier: RANGE_BRACKETS.short.modifier,
            description: RANGE_BRACKETS.short.description,
        };
    }

    // Standard Range: Up to double weapon range
    if (distance <= weaponRange * RANGE_BRACKETS.standard.maxMultiplier) {
        return {
            bracket: 'standard',
            label: RANGE_BRACKETS.standard.label,
            modifier: RANGE_BRACKETS.standard.modifier,
            description: RANGE_BRACKETS.standard.description,
        };
    }

    // Long Range: Up to triple weapon range
    if (distance <= weaponRange * RANGE_BRACKETS.long.maxMultiplier) {
        return {
            bracket: 'long',
            label: RANGE_BRACKETS.long.label,
            modifier: RANGE_BRACKETS.long.modifier,
            description: RANGE_BRACKETS.long.description,
        };
    }

    // Extreme Range: Beyond triple weapon range
    return {
        bracket: 'extreme',
        label: RANGE_BRACKETS.extreme.label,
        modifier: RANGE_BRACKETS.extreme.modifier,
        description: RANGE_BRACKETS.extreme.description,
    };
}

/**
 * Apply quality-based range modifications.
 * Handles special cases like Gyro-Stabilised and Melta.
 *
 * @param {{bracket: string, label: string, modifier: number}} rangeInfo - Base range info
 * @param {Set<string>} weaponQualities - Set of weapon quality identifiers
 * @returns {{bracket: string, label: string, modifier: number, modifiedBy: string|null}}
 */
export function applyQualityModifiers(rangeInfo, weaponQualities) {
    let modifier = rangeInfo.modifier;
    let modifiedBy = null;

    // Gyro-Stabilised: Never worse than Long Range (-10)
    // If penalty would be worse than -10, cap it at -10
    if (weaponQualities.has('gyro-stabilised')) {
        if (modifier < -10) {
            modifier = -10;
            modifiedBy = 'gyro-stabilised';
        }
    }

    return {
        ...rangeInfo,
        modifier: modifier,
        modifiedBy: modifiedBy,
    };
}

/**
 * Check if weapon is at short range for Melta quality purposes.
 * Melta doubles penetration at short range (including point blank).
 *
 * @param {string} bracket - Range bracket identifier
 * @returns {boolean} - True if at melta short range
 */
export function isAtMeltaRange(bracket) {
    return bracket === 'pointBlank' || bracket === 'short';
}

/**
 * Calculate effective range modifier for a weapon attack.
 * This is the main entry point for the range system.
 *
 * @param {object} options - Range calculation options
 * @param {number} options.distance - Distance to target in meters
 * @param {number} options.weaponRange - Base weapon range in meters
 * @param {Set<string>} options.weaponQualities - Set of weapon quality identifiers
 * @param {boolean} options.isRangedWeapon - Is this a ranged weapon?
 * @returns {{
 *   bracket: string,
 *   label: string,
 *   modifier: number,
 *   description: string,
 *   modifiedBy: string|null,
 *   isMeltaRange: boolean
 * }}
 */
export function calculateRangeModifier(options) {
    const { distance = 0, weaponRange = 0, weaponQualities = new Set(), isRangedWeapon = true } = options;

    // Melee weapons don't use range brackets
    if (!isRangedWeapon) {
        return {
            bracket: 'melee',
            label: 'Melee',
            modifier: 0,
            description: 'Melee range',
            modifiedBy: null,
            isMeltaRange: false,
        };
    }

    // Calculate base range bracket
    const rangeInfo = calculateRangeBracket(distance, weaponRange);

    // Apply quality modifiers
    const modifiedRange = applyQualityModifiers(rangeInfo, weaponQualities);

    // Check Melta range
    const isMeltaRange = weaponQualities.has('melta') && isAtMeltaRange(rangeInfo.bracket);

    return {
        ...modifiedRange,
        isMeltaRange: isMeltaRange,
    };
}

/**
 * Calculate distance between two tokens in combat.
 * Accounts for elevation differences (3D distance).
 *
 * @param {Token} token1 - First token
 * @param {Token} token2 - Second token
 * @returns {number} - Distance in grid units (converted to meters)
 */
export function calculateTokenDistance(token1, token2) {
    if (!token1 || !token2) return 0;

    // Measure path distance using Foundry's grid system
    const pathDistance = canvas.grid.measurePath([token1, token2]);
    let distance = pathDistance.distance || 0;

    // Account for elevation difference (3D distance)
    if (token1.document && token2.document) {
        const elevation1 = token1.document.elevation || 0;
        const elevation2 = token2.document.elevation || 0;

        if (elevation1 !== elevation2) {
            const elevationDiff = Math.abs(elevation2 - elevation1);
            // Pythagorean theorem: sqrt(horizontal^2 + vertical^2)
            distance = Math.sqrt(Math.pow(distance, 2) + Math.pow(elevationDiff, 2));
        }
    }

    return Math.floor(distance);
}

/**
 * Get range information for display in UI.
 * Returns formatted strings for templates.
 *
 * @param {{bracket: string, label: string, modifier: number, modifiedBy: string|null, isMeltaRange: boolean}} rangeInfo
 * @returns {{
 *   label: string,
 *   modifierText: string,
 *   modifierClass: string,
 *   tooltip: string,
 *   isMeltaRange: boolean
 * }}
 */
export function formatRangeDisplay(rangeInfo) {
    const { label, modifier, modifiedBy, isMeltaRange, description } = rangeInfo;

    // Format modifier text with sign
    let modifierText = modifier === 0 ? '±0' : modifier > 0 ? `+${modifier}` : `${modifier}`;

    // CSS class for styling
    let modifierClass = 'rt-range-modifier';
    if (modifier > 0) modifierClass += ' rt-range-modifier--positive';
    else if (modifier < 0) modifierClass += ' rt-range-modifier--negative';
    else modifierClass += ' rt-range-modifier--neutral';

    // Build tooltip
    let tooltip = description;
    if (modifiedBy) {
        const qualityNames = {
            'gyro-stabilised': 'Gyro-Stabilised',
        };
        tooltip += ` (Modified by ${qualityNames[modifiedBy] || modifiedBy})`;
    }
    if (isMeltaRange) {
        tooltip += ' | Melta: Double Penetration';
    }

    return {
        label,
        modifierText,
        modifierClass,
        tooltip,
        isMeltaRange,
    };
}

/**
 * Check if target is out of range.
 * @param {number} distance - Distance to target
 * @param {number} weaponRange - Base weapon range
 * @param {number} maxRangeMultiplier - Maximum range multiplier (default 3 for extreme range)
 * @returns {boolean} - True if out of range
 */
export function isOutOfRange(distance, weaponRange, maxRangeMultiplier = 3) {
    // No limit for melee
    if (weaponRange <= 1) return false;

    // Beyond extreme range (3x base range)
    return distance > weaponRange * maxRangeMultiplier;
}
