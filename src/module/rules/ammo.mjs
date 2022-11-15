import { WeaponRollData } from '../rolls/roll-data.mjs';

/**
 * @param rollData {WeaponRollData}
 */
export function calculateAmmoUsed(rollData: WeaponRollData) {
    if(rollData.action === 'Full Auto Burst') {
        rollData.ammoUsed = rollData.weapon.system.rateOfFire.full;
    } else if (rollData.action === 'Semi-Auto Burst') {
        rollData.ammoUsed = rollData.weapon.system.rateOfFire.burst;
    } else {
        rollData.ammoUsed = 1;
    }

    if(rollData.weapon.hasAttackSpecial('Maximal')) {
        rollData.ammoUsed *= 3;
    }
    if(rollData.weapon.hasAttackSpecial('Twin-Linked')) {
        rollData.ammoUsed *= 2;
    }

    if((rollData.action === 'Full Auto Burst' || rollData.action === 'Semi-Auto Burst')
        && rollData.weapon.hasAttackSpecial('Storm')) {
        rollData.ammoUsed *= 2;
    }
}
