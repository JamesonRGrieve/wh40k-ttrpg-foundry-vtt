export function getDegree(a, b) {
    return Math.floor(a / 10) - Math.floor(b / 10);
}

export function calculateRange(actionRange, targetDistance, weapon = null) {
    const rangeData = {}
    if (targetDistance === 0) {
        rangeData.name = 'self';
        rangeData.bonus = 0;
    } else if (targetDistance === 2) {
        rangeData.name = 'point blank';
        rangeData.bonus = 30;
    } else if (targetDistance <= (actionRange / 2)) {
        rangeData.name = 'short range';
        rangeData.bonus = 10;
    } else if (targetDistance <= (actionRange * 2)) {
        rangeData.name = 'normal range';
        rangeData.bonus = 0;
    } else if (targetDistance <= (actionRange * 3)) {
        rangeData.name = 'long range';
        if (weapon && (weapon.hasAttackSpecial('Telescopic Sight') || weapon.hasAttackSpecial('Omni-Scope'))) {
            rangeData.bonus = 0;
        } else rangeData.bonus = -10;
    } else {
        rangeData.name = 'extreme range';
        if (weapon && (weapon.hasAttackSpecial('Telescopic Sight') || weapon.hasAttackSpecial('Omni-Scope'))) {
            rangeData.bonus = 0;
        } else rangeData.bonus = -30;
    }
    return rangeData;
}
