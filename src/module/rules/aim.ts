interface AimRollData {
    weapon?: object;
    power?: object;
}

/**
 * @param rollData {RollData}
 */
export function calculateAimBonus(rollData: AimRollData): void {
    const _item = rollData.weapon ?? rollData.power;
    void _item;
}

export function aimModifiers(): Record<number, string> {
    return {
        0: 'None',
        10: 'Half (+10)',
        20: 'Full (+20)',
    };
}
