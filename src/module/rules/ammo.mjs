import { WeaponRollData } from '../rolls/roll-data.mjs';

export function ammoText(item) {
    game.dh.log('ammoText', item);
    if (item.usesAmmo) {
        const ammo = item.items.find((i) => i.isAmmunition);
        const name = ammo ? ammo.name : 'Standard';
        game.dh.log('ammoName', name);
        return `${name} (${item.system.clip.value}/${item.system.clip.max})`;
    }
}

export async function useAmmo(actionData) {
    let actionItem = actionData.rollData.weapon ?? actionData.rollData.power;
    if (!actionItem) return;
    if (actionItem.usesAmmo) {
        let newValue = actionItem.system.clip.value -= actionData.rollData.ammoUsed;
        // Reset to 0 if there was a problem
        if (newValue < 0) {
            newValue = 0;
        }

        await actionItem.update({
            system: {
                clip: {
                    value: newValue
                }
            }
        });

        if (actionItem.system.clip.value === 0) {
            ui.notifications.warn(`Clip is now empty. Ammo should be removed or reloaded.`);
        }
    }
}

export async function refundAmmo(actionData) {
    let actionItem = actionData.rollData.weapon ?? actionData.rollData.power;
    if (actionItem.usesAmmo) {
        await actionItem.update({
            system: {
                clip: {
                    value: actionItem.system.clip.value += actionData.rollData.ammoUsed
                }
            }
        });
    }
}

/**
 * @param rollData {WeaponRollData}
 */
export async function calculateAmmoAttackBonuses(rollData) {
    const weapon = rollData.weapon;
    const ammo = weapon.items.find((i) => i.isAmmunition);
    if (!ammo) return;

    switch (ammo.name) {
        case 'Explosive Arrows/Quarrels':
            rollData.specialModifiers['explosive arrows'] = -10;
            break;
    }
}

export async function calculateAmmoAttackSpecials(rollData) {
    const weapon = rollData.weapon;
    const ammo = weapon.items.find((i) => i.isAmmunition);
    if (!ammo) return;

    game.dh.log('calculateAmmoAttackSpecials', ammo.name);
    switch (ammo.name) {
        case 'Explosive Arrows/Quarrels':
            rollData.attackSpecials.findSplice((i) => i.name === 'Primitive');
            rollData.attackSpecials.push({
                name: 'Blast',
                level: 1,
            });
            break;
        case 'Hot-Shot Charge Packs':
            rollData.attackSpecials.findSplice((i) => i.name === 'Reliable');
            rollData.attackSpecials.push({
                name: 'Tearing',
                level: true,
            });
            break;
        case 'Inferno Shells':
            rollData.attackSpecials.push({
                name: 'Flame',
                level: true,
            });
            break;
        case 'Tox Rounds':
            rollData.attackSpecials.push({
                name: 'Toxic',
                level: 1,
            });
            break;
    }
}

export async function calculateAmmoSpecials(actionData, hit) {
    const weapon = actionData.rollData.weapon;
    const ammo = weapon.items.find((i) => i.isAmmunition);
    if (!ammo) return;

    switch (ammo.name) {
        case 'Bleeder Rounds':
            hit.addEffect('Bleeder Rounds', 'If the target takes damage, they suffer blood loss for [[1d5]] rounds.');
            break;
        case 'Dumdum Bullets':
            hit.addEffect('Dumdum Bullets', 'Armour points count double against this hit.');
            break;
        case 'Explosive Arrows/Quarrels':
            hit.damageType = 'Explosive';
            break;
    }
}

/**
 * @param actionData {WeaponAttackData}
 * @param hit {Hit}
 */
export async function calculateAmmoDamageBonuses(actionData, hit) {
    const weapon = actionData.rollData.weapon;
    const ammo = weapon.items.find((i) => i.isAmmunition);
    if (!ammo) return;

    switch (ammo.name) {
        case 'Amputator Shells':
            hit.modifiers['amputator shells'] = 2;
            break;
        case 'Dumdum Bullets':
            hit.modifiers['dumdum bullets'] = 2;
            break;
        case 'Expander Rounds':
            hit.modifiers['expander rounds'] = 1;
            break;
        case 'Hot-Shot Charge Packs':
            hit.modifiers['hot-shot charge pack'] = 1;
            break;
        case 'Tox Rounds':
            hit.modifiers['tox rounds'] = -1;
            break;
    }
}

/**
 * @param actionData {actionData}
 * @param hit {Hit}
 */
export async function calculateAmmoPenetrationBonuses(actionData, hit) {
    const weapon = actionData.rollData.weapon;
    const ammo = weapon.items.find((i) => i.isAmmunition);
    if (!ammo) return;

    switch (ammo.name) {
        case 'Expander Rounds':
            hit.penetrationModifiers['expander rounds'] = 1;
            break;
        case 'Hot-Shot Charge Packs':
            hit.penetrationModifiers['hot-shot charge pack'] = 4;
            break;
        case 'Man-Stopper Bullets':
            hit.penetrationModifiers['man-stopper bullets'] = 3;
            break;
    }
}

/**
 * @param rollData {WeaponRollData}
 */
export function calculateAmmoInformation(rollData) {
    const availableAmmo = rollData.weapon.system.clip.value;

    if(!rollData.weapon.usesAmmo) {
        return;
    }

    // Calculate Ammo *PER* shot
    let ammoPerShot = 1;
    if (rollData.hasAttackSpecial('Overcharge')) {
        ammoPerShot = 2;
    } else if (rollData.hasAttackSpecial('Overload')) {
        ammoPerShot = 4;
    }

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
    const ammunition = rollData.weapon.items.find((i) => i.isAmmunition);
    if (ammunition) {
        switch (ammunition.name) {
            case 'Hot-Shot Charge Packs':
                fireRate = 1;
        }
    }

    rollData.ammoPerShot = ammoPerShot;
    rollData.fireRate = fireRate;
    rollData.ammoUsed = fireRate * ammoPerShot;
    rollData.ammoText = ammoText(rollData.weapon);
}
