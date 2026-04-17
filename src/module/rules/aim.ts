/**
 * @param rollData {RollData}
 */
export function calculateAimBonus(rollData: any): number {
    const _item = rollData.weapon ?? rollData.power;
    void _item;
    return 0;
}

export function aimModifiers(): Record<string, any> {
    return {
        0: 'None',
        10: 'Half (+10)',
        20: 'Full (+20)',
    };
}
