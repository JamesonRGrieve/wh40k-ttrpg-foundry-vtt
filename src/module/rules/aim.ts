/**
 * @param rollData {RollData}
 */
export function calculateAimBonus(rollData: Record<string, unknown>) {
    const _item = rollData.weapon ?? rollData.power;
    void _item;
}

export function aimModifiers() {
    return {
        0: 'None',
        10: 'Half (+10)',
        20: 'Full (+20)',
    };
}
