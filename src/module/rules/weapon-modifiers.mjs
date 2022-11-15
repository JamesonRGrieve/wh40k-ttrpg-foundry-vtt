import { WeaponRollData } from '../rolls/roll-data.mjs';


export async function calculateWeaponModifiers(rollData: WeaponRollData) {
    // Reset Data -- this prevents needing to ensure removal if modifiers change
    rollData.weaponModifiers = {};
    const weapon = this.data.weapon;

    for(const item of weapon.items) {
        if(!item.system.equipped) continue;
        if(!item.isWeaponModification) continue;
        switch(item.name) {
            case "Red-Dot Laser Sight":
                if(this.data.action === 'Standard Attack' && this.data.weapon.isRanged) {
                    rollData.weaponModifiers.weaponModifiers['Red-Dot'] = 10;
                }
                break;
            case "Custom Grip":
                rollData.weaponModifiers.weaponModifiers['Custom Grip'] = 10;
                break;
        }
    }
}
