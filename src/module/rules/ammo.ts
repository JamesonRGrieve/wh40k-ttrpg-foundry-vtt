/* -------------------------------------------- */
/*  Ammo Effects Table                          */
/* -------------------------------------------- */

import type { ActionData } from '../rolls/action-data.ts';
import type { WeaponRollData } from '../rolls/roll-data.ts';
import type { WH40KItemDocument } from '../types/global.d.ts';

type AttackSpecialEffect = {
    remove?: string;
    add?: { name: string; level: unknown };
};

type HitEffect = {
    key: string;
    description: string;
};

type AmmoEffects = {
    attackBonuses?: Record<string, number>;
    attackSpecials?: AttackSpecialEffect[];
    hitEffects?: HitEffect[];
    hitDamageType?: string;
    damageModifiers?: Record<string, number>;
    penetrationModifiers?: Record<string, number>;
    fireRate?: number;
};

type AmmoItem = WH40KItemDocument & {
    usesAmmo: boolean;
    system: WH40KItemDocument['system'] & {
        loadedAmmo?: { name?: string };
        clip: { value: number };
        effectiveClipMax?: number;
        attack?: {
            rateOfFire?: {
                full?: number;
                semi?: number;
            };
        };
    };
};

type AmmoRollData = WeaponRollData & {
    weapon: AmmoItem;
    attackSpecials: Array<{ name: string; level?: unknown }>;
};

type AmmoActionData = ActionData & {
    rollData: AmmoRollData & {
        ammoUsed: number;
    };
};

type AmmoHit = {
    addEffect: (key: string, description: string) => void;
    damageType?: string;
    modifiers: Record<string, number>;
    penetrationModifiers: Record<string, number>;
};

/**
 * All ammo type effects in one place.
 * To add a new ammo type, add a single entry here — no function changes needed.
 */
const AMMO_EFFECTS: Record<string, AmmoEffects> = {
    'Amputator Shells': {
        damageModifiers: { 'amputator shells': 2 },
    },
    'Bleeder Rounds': {
        hitEffects: [{ key: 'Bleeder Rounds', description: 'If the target takes damage, they suffer blood loss for [[1d5]] rounds.' }],
    },
    'Dumdum Bullets': {
        hitEffects: [{ key: 'Dumdum Bullets', description: 'Armour points count double against this hit.' }],
        damageModifiers: { 'dumdum bullets': 2 },
    },
    'Expander Rounds': {
        damageModifiers: { 'expander rounds': 1 },
        penetrationModifiers: { 'expander rounds': 1 },
    },
    'Explosive Arrows/Quarrels': {
        attackBonuses: { 'explosive arrows': -10 },
        attackSpecials: [{ remove: 'Primitive' }, { add: { name: 'Blast', level: 1 } }],
        hitDamageType: 'Explosive',
    },
    'Hot-Shot Charge Packs': {
        attackSpecials: [{ remove: 'Reliable' }, { add: { name: 'Tearing', level: true } }],
        damageModifiers: { 'hot-shot charge pack': 1 },
        penetrationModifiers: { 'hot-shot charge pack': 4 },
        fireRate: 1,
    },
    'Inferno Shells': {
        attackSpecials: [{ add: { name: 'Flame', level: true } }],
    },
    'Man-Stopper Bullets': {
        penetrationModifiers: { 'man-stopper bullets': 3 },
    },
    'Tox Rounds': {
        attackSpecials: [{ add: { name: 'Toxic', level: 1 } }],
        damageModifiers: { 'tox rounds': -1 },
    },
};

/* -------------------------------------------- */
/*  Ammo Utility Functions                      */
/* -------------------------------------------- */

export function ammoText(item: AmmoItem): string | undefined {
    game.wh40k.log('ammoText', item);
    if (item.usesAmmo) {
        const name = item.system.loadedAmmo?.name || 'Standard';
        game.wh40k.log('ammoName', name);
        return `${name} (${item.system.clip.value}/${item.system.effectiveClipMax})`;
    }
    return undefined;
}

export async function useAmmo(actionData: AmmoActionData): Promise<void> {
    const actionItem = actionData.rollData.weapon ?? actionData.rollData.power;
    if (!actionItem) return;
    if (actionItem.usesAmmo) {
        let newValue = (actionItem.system.clip.value -= actionData.rollData.ammoUsed);
        // Reset to 0 if there was a problem
        if (newValue < 0) {
            newValue = 0;
        }

        await actionItem.update({
            'system.clip.value': newValue,
        } as Record<string, unknown>);

        if (actionItem.system.clip.value === 0) {
            ui.notifications.warn(`Clip is now empty. Ammo should be removed or reloaded.`);
        }
    }
}

export async function refundAmmo(actionData: AmmoActionData): Promise<void> {
    const actionItem = actionData.rollData.weapon ?? actionData.rollData.power;
    if (actionItem.usesAmmo) {
        await actionItem.update({
            'system.clip.value': actionItem.system.clip.value + actionData.rollData.ammoUsed,
        } as Record<string, unknown>);
    }
}

/* -------------------------------------------- */
/*  Attack Phase                                */
/* -------------------------------------------- */

/**
 * @param rollData {WeaponRollData}
 */
export function calculateAmmoAttackBonuses(rollData: AmmoRollData): void {
    const ammoName = rollData.weapon.system.loadedAmmo?.name;
    if (!ammoName) return;
    const effects = AMMO_EFFECTS[ammoName];
    if (!effects?.attackBonuses) return;
    for (const [key, value] of Object.entries(effects.attackBonuses)) {
        rollData.specialModifiers[key] = value;
    }
}

export function calculateAmmoAttackSpecials(rollData: AmmoRollData): void {
    const ammoName = rollData.weapon.system.loadedAmmo?.name;
    if (!ammoName) return;
    game.wh40k.log('calculateAmmoAttackSpecials', ammoName);
    const effects = AMMO_EFFECTS[ammoName];
    if (!effects?.attackSpecials) return;
    for (const spec of effects.attackSpecials) {
        if (spec.remove) rollData.attackSpecials.findSplice((i: { name: string }) => i.name === spec.remove);
        if (spec.add) rollData.attackSpecials.push(spec.add);
    }
}

/* -------------------------------------------- */
/*  Hit Phase                                   */
/* -------------------------------------------- */

export function calculateAmmoSpecials(actionData: AmmoActionData, hit: AmmoHit): void {
    const ammoName = actionData.rollData.weapon.system.loadedAmmo?.name;
    if (!ammoName) return;
    const effects = AMMO_EFFECTS[ammoName];
    if (!effects) return;
    if (effects.hitEffects) {
        for (const e of effects.hitEffects) hit.addEffect(e.key, e.description);
    }
    if (effects.hitDamageType) hit.damageType = effects.hitDamageType;
}

/**
 * @param actionData {WeaponAttackData}
 * @param hit {Hit}
 */
export function calculateAmmoDamageBonuses(actionData: AmmoActionData, hit: AmmoHit): void {
    const ammoName = actionData.rollData.weapon.system.loadedAmmo?.name;
    if (!ammoName) return;
    const effects = AMMO_EFFECTS[ammoName];
    if (!effects?.damageModifiers) return;
    for (const [key, value] of Object.entries(effects.damageModifiers)) {
        hit.modifiers[key] = value;
    }
}

/**
 * @param actionData {actionData}
 * @param hit {Hit}
 */
export function calculateAmmoPenetrationBonuses(actionData: AmmoActionData, hit: AmmoHit): void {
    const ammoName = actionData.rollData.weapon.system.loadedAmmo?.name;
    if (!ammoName) return;
    const effects = AMMO_EFFECTS[ammoName];
    if (!effects?.penetrationModifiers) return;
    for (const [key, value] of Object.entries(effects.penetrationModifiers)) {
        hit.penetrationModifiers[key] = value;
    }
}

/* -------------------------------------------- */
/*  Ammo Information                            */
/* -------------------------------------------- */

/**
 * @param rollData {WeaponRollData}
 */
export function calculateAmmoInformation(rollData: AmmoRollData): void {
    const availableAmmo = rollData.weapon.system.clip.value;

    if (!rollData.weapon.usesAmmo) {
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
        const rateOfFire = rollData.weapon.system.attack?.rateOfFire;
        if (rollData.action === 'Full Auto Burst') {
            fireRate = rateOfFire?.full ?? 0;
        } else if (rollData.action === 'Semi-Auto Burst') {
            fireRate = rateOfFire?.semi ?? 0;
        }
        if (rollData.hasAttackSpecial('Storm')) {
            fireRate *= 2;
        }
    }

    // Not enough ammo available -- lower to max hits
    if (maximumHits < fireRate) {
        fireRate = maximumHits;
    }

    // Ammunition fire rate override
    const ammoName = rollData.weapon.system.loadedAmmo?.name;
    if (ammoName) {
        const effects = AMMO_EFFECTS[ammoName];
        if (effects?.fireRate !== undefined) fireRate = effects.fireRate;
    }

    rollData.ammoPerShot = ammoPerShot;
    rollData.fireRate = fireRate;
    rollData.ammoUsed = fireRate * ammoPerShot;
    rollData.ammoText = ammoText(rollData.weapon) ?? '';
}
