import { WeaponRollData } from '../rolls/roll-data.mjs';


export function ammoText(item) {
    game.dh.log('ammoText', item);
    if (item.isRanged) {
        const ammo = item.items.find(i => i.isAmmunition);
        const name = ammo ? ammo.name : 'Standard'
        game.dh.log('ammoName', name);
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
    const weapon = rollData.weapon;
    const ammo = weapon.items.find(i => i.isAmmunition);
    if(!ammo) return;

    switch(ammo.name) {
        case 'Explosive Arrows/Quarrels':
            rollData.specialModifiers['explosive arrows'] = -10;
            break;

    }
}

export async function calculateAmmoAttackSpecials(rollData) {
    const weapon = rollData.weapon;
    const ammo = weapon.items.find(i => i.isAmmunition);
    if(!ammo) return;

    switch(ammo.name) {
        case 'Explosive Arrows/Quarrels':
            rollData.attackSpecials.findSplice(i => i.name === 'Primitive');
            rollData.attackSpecials.push({
                name: 'Blast',
                level: 1
            })
            break;
    }
}

export async function calculateAmmoSpecials(attackData, hit) {
    const weapon = attackData.rollData.weapon;
    const ammo = weapon.items.find(i => i.isAmmunition);
    if(!ammo) return;

    switch(ammo.name) {
        case 'Dumdum Bullets':
            hit.specials.push({
                'name': 'dumdum bullets',
                'special': 'Armour points count double against this hit.'
            })
            break;
        case 'Explosive Arrows/Quarrels':
            hit.damageType = 'Explosive';
            break;
    }
}


/**
 * @param attackData {AttackData}
 * @param hit {Hit}
 */
export async function calculateAmmoDamageBonuses(attackData, hit) {
    const weapon = attackData.rollData.weapon;
    const ammo = weapon.items.find(i => i.isAmmunition);
    if(!ammo) return;

    switch(ammo.name) {
        case 'Amputator Shells':
            hit.modifiers['amputator shells'] = 2;
            break;
        case 'Dumdum Bullets':
            hit.modifiers['dumdum bullets'] = 2;
            break;
        case 'Expander Rounds':
            hit.modifiers['expander rounds'] = 1;
            break;
    }
}

/**
 * @param attackData {AttackData}
 * @param hit {Hit}
 */
export async function calculateAmmoPenetrationBonuses(attackData, hit) {
    const weapon = attackData.rollData.weapon;
    const ammo = weapon.items.find(i => i.isAmmunition);
    if(!ammo) return;

    switch(ammo.name) {
        case 'Expander Rounds':
            hit.penetrationModifiers['expander rounds'] = 1;
            break;
    }
}


/**
 * @param rollData {WeaponRollData}
 */
export function calculateAmmoInformation(rollData) {
    const availableAmmo = rollData.weapon.system.clip.value;

    // Calculate Ammo *PER* shot
    let ammoPerShot = 1;
    if (rollData.hasAttackSpecial('Twin-Linked')) {
        ammoPerShot *= 2;
    }
    if (rollData.hasAttackSpecial('Maximal')) {
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
        if (rollData.hasAttackSpecial('Storm')) {
            fireRate *= 2;
        }
    }

    // Not enough ammo available -- lower to max hits
    if (maximumHits < fireRate) {
        fireRate = maximumHits;
    }

    // Ammunition Modification
    const ammunition = rollData.weapon.items.find(i => i.isAmmunition);
    if(ammunition) {
        switch(ammunition.name) {
            case 'Hot-Shot Charge Packs':
                fireRate = 1;
        }
    }

    rollData.ammoPerShot = ammoPerShot;
    rollData.fireRate = fireRate;
    rollData.ammoUsed = fireRate * ammoPerShot;
    rollData.ammoText = ammoText(rollData.weapon);
}
