import { WeaponRollData } from '../rolls/roll-data.mjs';

/**
 * @param rollData {WeaponRollData}
 */
export async function calculateWeaponModifiers(rollData) {
    // Reset Data -- this prevents needing to ensure removal if modifiers change
    rollData.weaponModifiers = {};
    const weapon = rollData.weapon;

    for (const item of Object.values(weapon.items)) {
        if (!item.system.equipped) continue;
        if (!item.isWeaponModification) continue;
        switch (item.name) {
            case 'Red-Dot Laser Sight':
                if (rollData.action === 'Standard Attack' && weapon.isRanged) {
                    rollData.weaponModifiers.weaponModifiers['Red-Dot'] = 10;
                }
                break;
            case 'Custom Grip':
                rollData.weaponModifiers.weaponModifiers['Custom Grip'] = 10;
                break;
        }
    }
}
