import { PsychicRollData, RollData, WeaponRollData } from '../rolls/roll-data.mjs';

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

    let range;
    if (Number.isInteger(weapon.system.range)) {
        range = weapon.system.range;
    } else if (weapon.system.range === '' || weapon.system.range === 'N/A') {
        range = 0;
    } else {
        try {
            const rangeCalculation = new Roll(weapon.system.range, rollData);
            await rangeCalculation.evaluate({ async: true });
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
        range = Math.floor(range * .66);
    }

    //Check Pistol Grip
    if (rollData.hasWeaponModification('Pistol Grip')) {
        range = Math.floor(range * .5);
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
            await rangeCalculation.evaluate({ async: true });
            range = rangeCalculation.total ?? 0;
        } catch (error) {
            ui.notifications.warn('Range formula failed - setting to 0');
            range = 0;
        }
    }

    rollData.maxRange = range;
}

/**
 * @param rollData {RollData}
 */
function calculateRangeNameAndBonus(rollData) {
    if(rollData.weapon && rollData.weapon.isMelee) {
        rollData.rangeName = 'Melee';
        rollData.rangeBonus = 0;
        return;
    }

    const targetDistance = rollData.distance ?? 0;
    const maxRange = rollData.maxRange ?? 0;

    if (targetDistance === 0) {
        rollData.rangeName = 'Self';
        rollData.rangeBonus = 0;
    } else if (targetDistance === 2) {
        rollData.rangeName = 'Point Blank';
        rollData.rangeBonus = 30;
    } else if (targetDistance <= maxRange / 2) {
        rollData.rangeName = 'Short Range';
        rollData.rangeBonus = 10;
    } else if (targetDistance <= maxRange * 2) {
        rollData.rangeName = 'Normal Range';
        rollData.rangeBonus = 0;
    } else if (targetDistance <= maxRange * 3) {
        rollData.rangeName = 'Long Range';
        rollData.rangeBonus = -10;
    } else {
        rollData.rangeName = 'Extreme Range';
        rollData.rangeBonus = -30;
    }
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
