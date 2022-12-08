import { WeaponRollData } from '../rolls/roll-data.mjs';

export async function updateWeaponModifiers(rollData) {
    rollData.weaponModifiers = [];

    let actionItem = rollData.weapon ?? rollData.power;
    game.dh.log('updateWeaponModifiers', actionItem);
    game.dh.log('updateWeaponModifiers items', actionItem.items);
    for (const i of actionItem.items) {
        if (i.isWeaponModification && (i.system.equipped || i.system.enabled)) {
            rollData.weaponModifiers.push({
                name: i.name,
                level: i.level,
            });
        }
    }
}

export async function calculateWeaponModifiersPenetrationBonuses(actionData, hit) {
    const weapon = actionData.rollData.weapon;
    for (const item of weapon.items) {
        game.dh.log('calculateWeaponModifiersPenetrationBonuses', item);
        if (!item.system.equipped) continue;
        if (!item.isWeaponModification) continue;
        switch (item.name) {
            case 'Mono':
                hit.penetrationModifiers['mono'] = 2;
                break;
        }
    }
}

export async function calculateWeaponModifiersAttackSpecials(rollData) {
    const weapon = rollData.weapon;

    for (const item of weapon.items) {
        game.dh.log('calculateWeaponModifiersAttackSpecials', item);
        if (!item.system.equipped) continue;
        if (!item.isWeaponModification) continue;
        switch (item.name) {
            case 'Mono':
                rollData.attackSpecials.findSplice((i) => i.name === 'Primitive');
                break;
        }
    }
}

/**
 * @param rollData {WeaponRollData}
 */
export async function calculateWeaponModifiersAttackBonuses(rollData) {
    // Reset Data -- this prevents needing to ensure removal if modifiers change
    rollData.weaponModifiers = {};
    const weapon = rollData.weapon;

    for (const item of weapon.items) {
        game.dh.log('calculateWeaponModifiers', item);
        if (!item.system.equipped) continue;
        if (!item.isWeaponModification) continue;
        switch (item.name) {
            case 'Red-Dot Laser Sight':
                if (rollData.action === 'Standard Attack' && weapon.isRanged) {
                    rollData.weaponModifiers['Red-Dot'] = 10;
                }
                break;
            case 'Custom Grip':
                rollData.weaponModifiers['Custom-Grip'] = 5;
                break;
        }
    }
}
