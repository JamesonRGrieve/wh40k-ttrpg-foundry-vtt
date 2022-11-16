import { WeaponRollData } from '../rolls/roll-data.mjs';


export function ammoText(item) {
    if (item.isRanged) {
        const ammo = item.items.find(i => i.isAmmunition);
        const name = ammo ? ammo.name : 'Standard'
        return `${name} ${item.system.clip.value}/${item.system.clip.max}`
    }
}


/**
 * @param attackData {AttackData}
 */
export async function useAmmo(attackData) {

}

/**
 * @param rollData {WeaponRollData}
 */
export async function calculateAmmoAttackBonuses(rollData) {

}


/**
 * @param attackData {AttackData}
 * @param hit {Hit}
 */
export async function calculateAmmoDamageBonuses(attackData, hit) {

}

/**
 * @param attackData {AttackData}
 * @param hit {Hit}
 */
export async function calculateAmmoPenetrationBonuses(attackData, hit) {

}


/**
 * @param rollData {WeaponRollData}
 */
export function calculateAmmoInformation(rollData) {
    const availableAmmo = rollData.weapon.system.clip.value;

    // Calculate Ammo *PER* shot
    let ammoPerShot = 1;
    if (rollData.weapon.hasAttackSpecial('Twin-Linked')) {
        ammoPerShot *= 2;
    }
    if (rollData.weapon.hasAttackSpecial('Maximal')) {
        ammoPerShot *= 3;
    }

    // Max hits with available ammo
    const maximumHits = Math.floor(availableAmmo / ammoPerShot);
    let fireRate = 1;

    if (rollData.action === 'Full Auto Burst' || rollData.action === 'Semi-Auto Burst') {
        if (rollData.action === 'Full Auto Burst') {
            fireRate = rollData.weapon.system.rateOfFire.full;
        } else if (rollData.action === 'Semi-Auto Burst') {
            fireRate = rollData.weapon.system.rateOfFire.burst;
        }
        if (rollData.weapon.hasAttackSpecial('Storm')) {
            fireRate *= 2;
        }
    }

    // Not enough ammo available -- lower to max hits
    if (maximumHits < fireRate) {
        fireRate = maximumHits;
    }

    rollData.ammoPerShot = ammoPerShot;
    rollData.fireRate = fireRate;
    rollData.ammoUsed = fireRate * ammoPerShot;
    rollData.ammoText = ammoText(rollData.weapon);
}
