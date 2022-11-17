import { RollData } from '../rolls/roll-data.mjs';

/**
 * @param rollData {RollData}
 */
export function calculateAimBonus(rollData) {
    let actionItem = rollData.weapon ?? rollData.power;
}

export function aimModifiers() {
    return {
        0: 'None',
        10: 'Half (+10)',
        20: 'Full (+20)',
    };
}
