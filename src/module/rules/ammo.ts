/* -------------------------------------------- */
/*  Ammo Effects Table                          */
/* -------------------------------------------- */

import type { ActionData } from '../rolls/action-data.ts';
import type { WeaponRollData } from '../rolls/roll-data.ts';
import type { WH40KItemDocument } from '../types/global.d.ts';
import { consumeRounds, type MagazineSegment, refundRounds } from './magazine.ts';

/** The loaded (chambered) round's cached effect fields, read from the weapon's front segment. */
type LoadedAmmoEffects = {
    name: string;
    attack: number;
    fireRateOverride: number | null;
    hitEffect: string;
};

type AmmoItem = WH40KItemDocument & {
    usesAmmo: boolean;
    system: WH40KItemDocument['system'] & {
        loadedAmmo?: LoadedAmmoEffects & { name?: string };
        clip: { value: number; magazine?: MagazineSegment[] };
        activeModeSingleUse?: boolean;
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
};

type AmmoActionData = ActionData & {
    rollData: AmmoRollData & {
        ammoUsed: number;
    };
};

type AmmoHit = {
    addEffect: (key: string, description: string) => void;
};

/*
 * (The name-keyed AMMO_EFFECTS table was retired — Direction #7. Every ammo type's
 * effect now lives on its ammunition item's structured fields, cached onto the
 * chambered magazine segment and applied through the central paths:
 *   - damage / penetration deltas → `modifiers.{damage,penetration}` → the weapon's
 *     `effectiveDamageFormula` / `effectivePenetration` getters (so they also
 *     rendered on the roll card and no longer double-counted);
 *   - a full-profile OVERRIDE round (warhead / sniper) → `system.damage` → the same
 *     getters (dice + type + bonus + Pen replacement);
 *   - damage TYPE override → `system.damage.type` → `effectiveDamageType`;
 *   - added / removed qualities → `addedQualities` / `removedQualities` → applied to
 *     the roll's attack-specials in `attack-specials.ts` (id → canonical name bridge);
 *   - to-hit delta → `modifiers.attack` (below);
 *   - fire-rate override → `fireRateOverride` (below);
 *   - on-hit effect text → `hitEffect` (below).)
 */

/* -------------------------------------------- */
/*  Ammo Utility Functions                      */
/* -------------------------------------------- */

function ammoText(item: AmmoItem): string | undefined {
    game.wh40k.log('ammoText', item);
    if (item.usesAmmo) {
        const loadedName = item.system.loadedAmmo?.name;
        const name = loadedName !== undefined && loadedName !== '' ? loadedName : 'Standard';
        game.wh40k.log('ammoName', name);
        return `${name} (${item.system.clip.value}/${item.system.effectiveClipMax})`;
    }
    return undefined;
}

export async function useAmmo(actionData: AmmoActionData): Promise<void> {
    const actionItem = actionData.rollData.weapon;
    if (actionItem.usesAmmo) {
        // Combi single-use secondary (#ammo-system): firing it spends the secondary
        // (until reload), not the bolter's clip.
        if (actionItem.system.activeModeSingleUse === true) {
            await actionItem.update({ 'system.secondaryUsed': true });
            return;
        }
        const used = actionData.rollData.ammoUsed;
        const newValue = Math.max(0, actionItem.system.clip.value - used);
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Item.update accepts a loose document payload
        const update: Record<string, unknown> = { 'system.clip.value': newValue };
        // Consume the chambered round(s) from the ordered magazine (#ammo-system);
        // a generic (magazine-less) clip only tracks the count.
        const magazine = actionItem.system.clip.magazine;
        if (magazine !== undefined && magazine.length > 0) update['system.clip.magazine'] = consumeRounds(magazine, used).magazine;
        await actionItem.update(update);

        if (newValue === 0) {
            ui.notifications.warn(game.i18n.localize('WH40K.AMMO.ClipEmpty'));
        }
    }
}

export async function refundAmmo(actionData: AmmoActionData): Promise<void> {
    const actionItem = actionData.rollData.weapon;
    if (actionItem.usesAmmo) {
        const used = actionData.rollData.ammoUsed;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Item.update accepts a loose document payload
        const update: Record<string, unknown> = { 'system.clip.value': actionItem.system.clip.value + used };
        const magazine = actionItem.system.clip.magazine;
        const front = magazine !== undefined && magazine.length > 0 ? magazine[0] : undefined;
        if (magazine !== undefined && front !== undefined) update['system.clip.magazine'] = refundRounds(magazine, used, front);
        await actionItem.update(update);
    }
}

/* -------------------------------------------- */
/*  Attack Phase                                */
/* -------------------------------------------- */

/**
 * Apply the loaded round's to-hit delta to the attack roll (e.g. Explosive
 * Arrows/Quarrels −10). Data-driven from the ammunition item's `modifiers.attack`
 * (cached on the chambered segment). Keyed by the round's name for card provenance.
 * @param rollData {WeaponRollData}
 */
export function calculateAmmoAttackBonuses(rollData: AmmoRollData): void {
    const loaded = rollData.weapon.system.loadedAmmo;
    if (loaded === undefined || loaded.attack === 0) return;
    const key = loaded.name !== '' ? loaded.name : 'Ammunition';
    rollData.specialModifiers[key] = loaded.attack;
}

/* -------------------------------------------- */
/*  Hit Phase                                   */
/* -------------------------------------------- */

/**
 * Apply the loaded round's structured on-hit effect (e.g. Bleeder Rounds blood
 * loss, Dumdum armour-doubling) to the hit. The damage TYPE override is applied
 * upstream by the weapon's `effectiveDamageType` getter, not here.
 */
export function calculateAmmoSpecials(actionData: AmmoActionData, hit: AmmoHit): void {
    const loaded = actionData.rollData.weapon.system.loadedAmmo;
    if (loaded === undefined) return;
    if (loaded.hitEffect !== '') {
        const key = loaded.name !== '' ? loaded.name : 'Ammunition';
        hit.addEffect(key, loaded.hitEffect);
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
        } else {
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

    // Ammunition fire-rate override (e.g. Hot-shot Charge Packs → single shot),
    // data-driven from the chambered round's `fireRateOverride`.
    const override = rollData.weapon.system.loadedAmmo?.fireRateOverride;
    if (override !== undefined && override !== null) fireRate = Math.min(fireRate, override);

    rollData.ammoPerShot = ammoPerShot;
    rollData.fireRate = fireRate;
    rollData.ammoUsed = fireRate * ammoPerShot;
    rollData.ammoText = ammoText(rollData.weapon) ?? '';
}
