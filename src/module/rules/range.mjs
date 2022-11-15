import { PsychicRollData, RollData, WeaponRollData } from '../rolls/roll-data.mjs';

async function calculateWeaponMaxRange(rollData: WeaponRollData) {
    const weapon = rollData.weapon;
    if (!weapon) return 0;

    const rangeCalculation = new Roll(weapon.system.range, rollData);
    await rangeCalculation.evaluate({ async: true });
    let range = rangeCalculation.total ?? 0;


    // Check Maximal
    if(weapon.hasAttackSpecial('Maximal')) {
        range += 10;
    }

    rollData.maxRange = range;
}

async function calculatePsychicAbilityMaxRange(rollData: PsychicRollData) {
    const rangeCalculation = new Roll(rollData.power.system.range, rollData);
    await rangeCalculation.evaluate({ async: true });

    let range = rangeCalculation.total ?? 0;
    rollData.maxRange = range;
}

function calculateRangeNameAndBonus(rollData: RollData) {
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

export async function calculateWeaponRange(rollData: WeaponRollData) {
    await calculateWeaponMaxRange(rollData);
    calculateRangeNameAndBonus(rollData);

    // Ignore Negative Range Bonus for certain modifications
    if(rollData.rangeBonus < 0) {
        const aiming = rollData.modifiers['aim'] > 0;
        const weapon = rollData.weapon;
        if (aiming && (weapon.hasWeaponModification('Telescopic Sight') || weapon.hasWeaponModification('Omni-Scope'))) {
            rollData.rangeBonus = 0;
        }
    }
}

export async function calculatePsychicPowerRange(rollData: PsychicRollData) {
    await calculatePsychicAbilityMaxRange(rollData);
    calculateRangeNameAndBonus(rollData);
    // Ignore Bonus for Psychic Powers
    rollData.rangeBonus = 0;
}



