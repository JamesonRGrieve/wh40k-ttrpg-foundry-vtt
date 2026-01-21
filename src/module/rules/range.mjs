import { PsychicRollData, RollData, WeaponRollData } from '../rolls/roll-data.mjs';
import { calculateRangeModifier } from '../utils/range-calculator.mjs';

/**
 * @param rollData {WeaponRollData}
 */
async function calculateWeaponMaxRange(rollData) {
    const weapon = rollData.weapon;
    if (!weapon) {
        rollData.maxRange = 0;
        return;
    }

    if (weapon.isMelee) {
        rollData.maxRange = 1;
        return;
    }

    // Get base range from weapon
    let range;
    const weaponRange = weapon.system.attack?.range?.value || weapon.system.range;

    if (Number.isInteger(weaponRange)) {
        range = weaponRange;
    } else if (weaponRange === '' || weaponRange === 'N/A') {
        range = 0;
    } else {
        try {
            const rangeCalculation = new Roll(String(weaponRange), rollData);
            rangeCalculation.evaluateSync();
            range = rangeCalculation.total ?? 0;
        } catch (error) {
            ui.notifications.warn('Range formula failed - setting to 0');
            range = 0;
        }
    }

    // Check Maximal
    if (rollData.hasAttackSpecial('Maximal')) {
        range += 10;
    }

    //Check Forearm Mounting
    if (rollData.hasWeaponModification('Forearm Weapon Mounting')) {
        range = Math.floor(range * 0.66);
    }

    //Check Pistol Grip
    if (rollData.hasWeaponModification('Pistol Grip')) {
        range = Math.floor(range * 0.5);
    }

    rollData.maxRange = range;
}

/**
 * @param rollData {PsychicRollData}
 */
async function calculatePsychicAbilityMaxRange(rollData) {
    if (!rollData.power) {
        rollData.maxRange = 0;
        return;
    }

    let range;
    if (Number.isInteger(rollData.power.system.range)) {
        range = rollData.power.system.range;
    } else if (rollData.power.system.range === '') {
        range = 0;
    } else {
        try {
            const rangeCalculation = new Roll(rollData.power.system.range, rollData);
            await rangeCalculation.evaluate();
            range = rangeCalculation.total ?? 0;
        } catch (error) {
            ui.notifications.warn('Range formula failed - setting to 0');
            range = 0;
        }
    }

    rollData.maxRange = range;
}

/**
 * Calculate range bracket and bonus using the new range calculator system.
 * @param rollData {RollData}
 */
function calculateRangeNameAndBonus(rollData) {
    if (rollData.weapon && rollData.weapon.isMelee) {
        rollData.rangeName = 'Melee';
        rollData.rangeBonus = 0;
        rollData.rangeBracket = 'melee';
        rollData.isMeltaRange = false;
        return;
    }

    const targetDistance = rollData.distance ?? 0;
    const maxRange = rollData.maxRange ?? 0;

    // Get weapon qualities if available
    const weaponQualities = rollData.weapon?.system?.effectiveSpecial || new Set();

    // Use new range calculator
    const rangeInfo = calculateRangeModifier({
        distance: targetDistance,
        weaponRange: maxRange,
        weaponQualities: weaponQualities,
        isRangedWeapon: true,
    });

    // Store range information in rollData
    rollData.rangeName = rangeInfo.label;
    rollData.rangeBonus = rangeInfo.modifier;
    rollData.rangeBracket = rangeInfo.bracket;
    rollData.rangeModifiedBy = rangeInfo.modifiedBy;
    rollData.isMeltaRange = rangeInfo.isMeltaRange;
}

/**
 * @param rollData {WeaponRollData}
 */
export async function calculateWeaponRange(rollData) {
    await calculateWeaponMaxRange(rollData);
    calculateRangeNameAndBonus(rollData);

    // Ignore Negative Range Bonus for certain modifications
    if (rollData.rangeBonus < 0) {
        const aiming = rollData.modifiers['aim'] > 0;
        if (aiming && (rollData.hasWeaponModification('Telescopic Sight') || rollData.hasWeaponModification('Omni-Scope'))) {
            rollData.rangeBonus = 0;
            rollData.rangeModifiedBy = 'telescopic-sight';
        }
    }
}

/**
 * @param rollData {PsychicRollData}
 */
export async function calculatePsychicPowerRange(rollData) {
    await calculatePsychicAbilityMaxRange(rollData);
    calculateRangeNameAndBonus(rollData);
    // Ignore Bonus for Psychic Powers
    rollData.rangeBonus = 0;
}
