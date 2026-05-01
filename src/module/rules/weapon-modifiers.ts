/* -------------------------------------------- */
/*  Weapon Modifier Effects Table               */
/* -------------------------------------------- */

import type { ActionData } from '../rolls/action-data.ts';
import type { WeaponRollData } from '../rolls/roll-data.ts';
import type { WH40KItem } from '../documents/item.ts';
import type { WH40KItemDocument } from '../types/global.d.ts';

type AttackSpecialEffect = {
    remove?: string;
};

type WeaponModifierEffects = {
    /** Applied in calculateWeaponModifiersDamageBonuses → hit.penetrationModifiers */
    damagePhasePenetrationMods?: Record<string, number>;
    /** Applied in calculateWeaponModifiersPenetrationBonuses → hit.penetrationModifiers */
    penetrationModifiers?: Record<string, number>;
    attackSpecials?: AttackSpecialEffect[];
    /** Context-dependent attack bonuses → rollData.weaponModifiers */
    attackBonus?: (rollData: WeaponModifierBonusRollData, item: WeaponModifierItem) => Record<string, number>;
};

type WeaponModifierItem = WH40KItemDocument & {
    isWeaponModification: boolean;
    level?: unknown;
    system: WH40KItemDocument['system'] & {
        enabled?: boolean;
        equipped?: boolean;
    };
};

type WeaponModifierBaseRollData = WeaponRollData & {
    attackSpecials: Array<{ name: string }>;
    modifiers: Record<string, number>;
    action: string;
};

type WeaponModifierListRollData = WeaponModifierBaseRollData & {
    weaponModifications: Array<{ name: string; level?: unknown }>;
};

type WeaponModifierBonusRollData = WeaponModifierBaseRollData & {
    weaponModifiers: Record<string, number>;
};

type WeaponModifierActionData = ActionData & {
    rollData: WeaponModifierBaseRollData;
};

type PenetrationHit = {
    penetrationModifiers: Record<string, number>;
};

function getModifierItems(actionItem: { items: Iterable<unknown> } | null | undefined): WeaponModifierItem[] {
    if (!actionItem) return [];
    return Array.from(actionItem.items as Iterable<WeaponModifierItem>);
}

/**
 * All weapon modification effects in one place.
 * To add a new mod, add a single entry here — no function changes needed.
 * Use `attackBonus` for context-dependent bonuses (action type, aim level, etc.).
 */
const MOD_EFFECTS: Record<string, WeaponModifierEffects> = {
    'Compact': {
        // Original behavior: reduces penetration, applied in damage phase
        damagePhasePenetrationMods: { compact: -1 },
    },
    'Custom Grip': {
        attackBonus: () => ({ 'Custom-Grip': 5 }),
    },
    'Modified Stock': {
        attackBonus: (rollData): Record<string, number> => {
            const modifiers = rollData.modifiers ?? {};
            if (modifiers['aim'] === 10) return { 'Modified-Stock': 2 };
            if (modifiers['aim'] === 20) return { 'Modified-Stock': 4 };
            return {};
        },
    },
    'Mono': {
        penetrationModifiers: { mono: 2 },
        attackSpecials: [{ remove: 'Primitive' }],
    },
    'Motion Predictor': {
        attackBonus: (rollData): Record<string, number> => {
            if (rollData.action === 'Full Auto Burst' || rollData.action === 'Semi-Auto Burst') {
                return { 'Motion-Predictor': 10 };
            }
            return {};
        },
    },
    'Red-Dot Laser Sight': {
        attackBonus: (rollData, item): Record<string, number> => {
            if (rollData.action === 'Standard Attack' && item.isRanged) {
                return { 'Red-Dot': 10 };
            }
            return {};
        },
    },
};

/* -------------------------------------------- */
/*  Weapon Modifier Functions                   */
/* -------------------------------------------- */

export function updateWeaponModifiers(rollData: WeaponModifierListRollData): void {
    rollData.weaponModifications = [];

    const actionItem = rollData.weapon ?? rollData.power;
    if (!actionItem) return;

    for (const i of getModifierItems(actionItem)) {
        if (i.isWeaponModification && (i.system.equipped || i.system.enabled)) {
            rollData.weaponModifications.push({
                name: i.name,
                level: i.level,
            });
        }
    }
}

export function calculateWeaponModifiersDamageBonuses(actionData: WeaponModifierActionData, hit: PenetrationHit): void {
    const actionItem = actionData.rollData.weapon ?? actionData.rollData.power;
    if (!actionItem) return;

    for (const item of getModifierItems(actionItem)) {
        game.wh40k.log('calculateWeaponModifiersDamageBonuses', item);
        if (!item.system.equipped) continue;
        if (!item.isWeaponModification) continue;
        const effects = MOD_EFFECTS[item.name];
        if (!effects?.damagePhasePenetrationMods) continue;
        for (const [key, value] of Object.entries(effects.damagePhasePenetrationMods)) {
            hit.penetrationModifiers[key] = value;
        }
    }
}

export function calculateWeaponModifiersPenetrationBonuses(actionData: WeaponModifierActionData, hit: PenetrationHit): void {
    const actionItem = actionData.rollData.weapon ?? actionData.rollData.power;
    if (!actionItem) return;

    for (const item of getModifierItems(actionItem)) {
        game.wh40k.log('calculateWeaponModifiersPenetrationBonuses', item);
        if (!item.system.equipped) continue;
        if (!item.isWeaponModification) continue;
        const effects = MOD_EFFECTS[item.name];
        if (!effects?.penetrationModifiers) continue;
        for (const [key, value] of Object.entries(effects.penetrationModifiers)) {
            hit.penetrationModifiers[key] = value;
        }
    }
}

export function calculateWeaponModifiersAttackSpecials(rollData: WeaponModifierBaseRollData): void {
    const actionItem = rollData.weapon ?? rollData.power;
    if (!actionItem) return;

    for (const item of getModifierItems(actionItem)) {
        game.wh40k.log('calculateWeaponModifiersAttackSpecials', item);
        if (!item.system.equipped) continue;
        if (!item.isWeaponModification) continue;
        const effects = MOD_EFFECTS[item.name];
        if (!effects?.attackSpecials) continue;
        for (const spec of effects.attackSpecials) {
            if (spec.remove) rollData.attackSpecials.findSplice((i: { name: string }) => i.name === spec.remove);
        }
    }
}

/**
 * @param rollData {WeaponRollData}
 */
export function calculateWeaponModifiersAttackBonuses(rollData: WeaponModifierBonusRollData): void {
    // Reset Data -- this prevents needing to ensure removal if modifiers change
    rollData.weaponModifiers = {};
    const actionItem = rollData.weapon ?? rollData.power;
    if (!actionItem) return;

    for (const item of getModifierItems(actionItem)) {
        game.wh40k.log('calculateWeaponModifiers', item);
        if (!item.system.equipped) continue;
        if (!item.isWeaponModification) continue;
        const effects = MOD_EFFECTS[item.name];
        if (!effects?.attackBonus) continue;
        const bonuses = effects.attackBonus(rollData, item);
        for (const [key, value] of Object.entries(bonuses)) {
            (rollData.weaponModifiers as Record<string, number>)[key] = value;
        }
    }
}
