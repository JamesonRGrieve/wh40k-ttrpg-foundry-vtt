import { WeaponRollData } from '../rolls/roll-data.mjs';

export async function updateWeaponModifiers(rollData) {
    rollData.weaponModifiers = [];

    let actionItem = rollData.weapon ?? rollData.power;
    for(const i of actionItem.items) {
        if(i.isWeaponModification && (i.system.equipped || i.system.enabled)) {
            rollData.weaponModifiers.push({
                name: i.name,
                level: i.level
            });
        }
    }
}

/**
 * @param rollData {WeaponRollData}
 */
export async function calculateWeaponModifiers(rollData) {
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
