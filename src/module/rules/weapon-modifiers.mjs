import { WeaponRollData } from '../rolls/roll-data.mjs';

export async function updateWeaponModifiers(rollData) {
    rollData.weaponModifiers = [];

    let actionItem = rollData.weapon ?? rollData.power;
    if(!actionItem) return;

    for (const i of actionItem.items) {
        if (i.isWeaponModification && (i.system.equipped || i.system.enabled)) {
            rollData.weaponModifiers.push({
                name: i.name,
                level: i.level,
            });
        }
    }
}

export async function calculateWeaponModifiersDamageBonuses(actionData, hit) {
    let actionItem = actionData.rollData.weapon ?? actionData.rollData.power;
    if(!actionItem) return;

    for (const item of actionItem.items) {
        game.dh.log('calculateWeaponModifiersDamageBonuses', item);
        if (!item.system.equipped) continue;
        if (!item.isWeaponModification) continue;
        switch (item.name) {
            case 'Compact':
                hit.penetrationModifiers['compact'] = -1;
                break;
        }
    }
}

export async function calculateWeaponModifiersPenetrationBonuses(actionData, hit) {
    let actionItem = actionData.rollData.weapon ?? actionData.rollData.power;
    if(!actionItem) return;

    for (const item of actionItem.items) {
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
    let actionItem = rollData.weapon ?? rollData.power;
    if(!actionItem) return;

    for (const item of actionItem.items) {
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
    let actionItem = rollData.weapon ?? rollData.power;
    if(!actionItem) return;

    for (const item of actionItem.items) {
        game.dh.log('calculateWeaponModifiers', item);
        if (!item.system.equipped) continue;
        if (!item.isWeaponModification) continue;
        switch (item.name) {
            case 'Red-Dot Laser Sight':
                if (rollData.action === 'Standard Attack' && actionItem.isRanged) {
                    rollData.weaponModifiers['Red-Dot'] = 10;
                }
                break;
            case 'Custom Grip':
                rollData.weaponModifiers['Custom-Grip'] = 5;
                break;
            case 'Modified Stock':
                if (rollData.modifiers['aim'] === 10) {
                    rollData.weaponModifiers['Modified-Stock'] = 2;
                } else if (rollData.modifiers['aim'] === 20) {
                    rollData.weaponModifiers['Modified-Stock'] = 4;
                }
                break;
            case 'Motion Predictor':
                if (rollData.action === 'Full Auto Burst' || rollData.action === 'Semi-Auto Burst') {
                    rollData.weaponModifiers['Motion-Predictor'] = 10;
                }
                break;
        }
    }
}
