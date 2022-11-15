import { WeaponRollData } from '../rolls/roll-data.mjs';


export function calculateAmmoUsed(rollData: WeaponRollData) {
    if(rollData.action === 'Full Auto Burst') {
        rollData.ammoUsed = rollData.weapon.system.rateOfFire.full;
    } else if (rollData.action === 'Full Auto Burst') {
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
}
