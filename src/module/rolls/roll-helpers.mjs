export function getDegree(a, b) {
    return Math.floor(a / 10) - Math.floor(b / 10);
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
