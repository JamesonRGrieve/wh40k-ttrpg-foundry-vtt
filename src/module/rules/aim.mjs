import { RollData } from '../rolls/roll-data.mjs';
import { DarkHeresyItem } from '../documents/item.mjs';

export function calculateAimBonus(rollData: RollData) {
    let actionItem: DarkHeresyItem = rollData.weapon ?? rollData.power;



}

export function aimModifiers() {
    return {
        '0': 'None',
        '10': 'Half (+10)',
        '20': 'Full (+20)',
    };
}
