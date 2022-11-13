export function getDegree(a, b) {
    return Math.floor(a / 10) - Math.floor(b / 10);
}

export function modifiersToRollData(modifiers) {
    let formula = '0 ';
    const rollParams = {};
    for(const modifier of Object.keys(modifiers)) {
        if(modifiers[modifier] !== 0) {
            if(modifiers[modifier] >= 0) {
                formula += ` + @${modifier}`
            } else {
                formula += ` - @${modifier}`
            }
            rollParams[modifier] = Math.abs(modifiers[modifier]);
        }
    }
    return {
        formula: formula,
        params: rollParams
    }
}

export async function totalModifiers(modifiers) {
    const rollDetails = modifiersToRollData(modifiers);
    const roll = new Roll(rollDetails.formula, rollDetails.params);
    await roll.evaluate({async: true});
    if (roll.total > 60) {
        return 60;
    } else if (roll.total < -60) {
        return -60;
    } else {
        return roll.total;
    }
}

export async function performSkillCheckRoll(modifier) {
    let formula = '1d100';
    if(modifier > 0) {
        formula += ` + ${Math.abs(modifier)}`;
    } else if (modifier < 0) {
        formula += ` - ${Math.abs(modifier)}`;
    }
    const roll = new Roll(formula, {});
    await roll.evaluate({ async: true });
    return roll;
}

export function determineSuccess(roll, target) {
    const successData = {
        success: roll.total <= target
    }
    if (successData.success) {
        successData.dof = 0;
        successData.dos = 1 + getDegree(target, roll.total);
    } else {
        successData.dos = 0;
        successData.dof = 1 + getDegree(roll.total, target);
    }
    return successData;
}

export function calculateRange(actionRange, targetDistance, weapon = null) {
    const rangeData = {}
    if (targetDistance === 0) {
        rangeData.name = 'Self';
        rangeData.bonus = 0;
    } else if (targetDistance === 2) {
        rangeData.name = 'Point Blank';
        rangeData.bonus = 30;
    } else if (targetDistance <= (actionRange / 2)) {
        rangeData.name = 'Short Range';
        rangeData.bonus = 10;
    } else if (targetDistance <= (actionRange * 2)) {
        rangeData.name = 'Normal Range';
        rangeData.bonus = 0;
    } else if (targetDistance <= (actionRange * 3)) {
        rangeData.name = 'Long Range';
        if (weapon && (weapon.hasAttackSpecial('Telescopic Sight') || weapon.hasAttackSpecial('Omni-Scope'))) {
            rangeData.bonus = 0;
        } else rangeData.bonus = -10;
    } else {
        rangeData.name = 'Extreme Range';
        if (weapon && (weapon.hasAttackSpecial('Telescopic Sight') || weapon.hasAttackSpecial('Omni-Scope'))) {
            rangeData.bonus = 0;
        } else rangeData.bonus = -30;
    }
    return rangeData;
}
