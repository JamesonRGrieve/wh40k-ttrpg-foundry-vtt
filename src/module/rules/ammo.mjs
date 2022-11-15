import { WeaponRollData } from '../rolls/roll-data.mjs';


export function calculateAmmoUsed(rollData: WeaponRollData) {
    if(rollData.action === 'Full Auto Burst') {
        rollData.ammoUsed = rollData.weapon.system.rateOfFire.full;
    } else if (rollData.action === 'Full Auto Burst') {
        rollData.ammoUsed = rollData.weapon.system.rateOfFire.burst;
    }
}
