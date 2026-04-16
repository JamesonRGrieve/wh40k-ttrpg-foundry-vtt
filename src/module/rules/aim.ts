/**
 * @param rollData {RollData}
 */
export function calculateAimBonus(rollData) {
    rollData.weapon ?? rollData.power;
}

export function aimModifiers() {
    return {
        0: 'None',
        10: 'Half (+10)',
        20: 'Full (+20)',
    };
}
