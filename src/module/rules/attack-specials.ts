import type { PsychicRollData, RollData, WeaponRollData } from '../rolls/roll-data.ts';
import type { WH40KItemDocument } from '../types/global.d.ts';
import { calculateAmmoAttackSpecials } from './ammo.ts';
import { calculateWeaponModifiersAttackSpecials } from './weapon-modifiers.ts';
import { applyQualityModifiersToRollData } from './weapon-quality-effects.ts';

type AttackSpecialLike = {
    name: string;
    level?: unknown;
};

type AttackSpecialCarrier = WH40KItemDocument & {
    isAttackSpecial: boolean;
    system: WH40KItemDocument['system'] & {
        enabled?: boolean;
        level?: unknown;
    };
};

type AttackSpecialRollData = RollData & {
    attackSpecials: AttackSpecialLike[];
};

type AttackSpecialSourceRollData = WeaponRollData | PsychicRollData;

export async function updateAttackSpecials(rollData: AttackSpecialSourceRollData): Promise<void> {
    const mutableRollData = rollData as AttackSpecialSourceRollData & AttackSpecialRollData;
    mutableRollData.attackSpecials = [];
    const actionItem = rollData.weapon ?? rollData.power;
    if (!actionItem) return;
    for (const i of actionItem.items as unknown as AttackSpecialCarrier[]) {
        if (i.isAttackSpecial && (i.system.equipped || i.system.enabled)) {
            mutableRollData.attackSpecials.push({
                name: i.name,
                level: i.system.level,
            });
        }
    }

    // Las Variable Setting
    if ('lasMode' in rollData && rollData.lasMode) {
        switch (rollData.lasMode) {
            case 'Standard':
                break;
            case 'Overload':
                mutableRollData.attackSpecials.findSplice((i: AttackSpecialLike) => i.name === 'Reliable');
                mutableRollData.attackSpecials.push({
                    name: 'Unreliable',
                    level: true,
                });
                mutableRollData.attackSpecials.push({
                    name: rollData.lasMode,
                    level: true,
                });
                break;
            case 'Overcharge':
                mutableRollData.attackSpecials.push({
                    name: rollData.lasMode,
                    level: true,
                });
                break;
        }
    }

    if (actionItem.isRanged) {
        // actionItem.isRanged is true → rollData is WeaponRollData (not PsychicRollData),
        // narrowed at runtime but invisible to the TS type system; cast accordingly.
        await calculateAmmoAttackSpecials(mutableRollData as unknown as Parameters<typeof calculateAmmoAttackSpecials>[0]);
    }

    await calculateWeaponModifiersAttackSpecials(mutableRollData as unknown as Parameters<typeof calculateWeaponModifiersAttackSpecials>[0]);
}

/**
 * @param rollData {RollData}
 */
export function calculateAttackSpecialAttackBonuses(rollData: RollData): void {
    // Reset Attack Specials
    rollData.specialModifiers = {};
    const actionItem = rollData.weapon ?? rollData.power;
    if (!actionItem) return;

    for (const item of actionItem.items as unknown as AttackSpecialCarrier[]) {
        if (!item.isAttackSpecial) continue;
        switch (item.name) {
            case 'Scatter':
                if (rollData.rangeName === 'Point Blank' || rollData.rangeName === 'Short Range') {
                    rollData.specialModifiers['Scatter'] = 10;
                }
                break;
            case 'Indirect':
                rollData.specialModifiers['Indirect'] = 10;
                break;
            case 'Twin-Linked':
                rollData.specialModifiers['Twin-Linked'] = 20;
                break;
            case 'Defensive':
                rollData.specialModifiers['Defensive'] = -10;
                break;
            case 'Accurate':
                if (rollData.modifiers['aim'] > 0) {
                    rollData.specialModifiers['Accurate'] = 10;
                }
                break;
            case 'Inaccurate':
                if (rollData.modifiers['aim'] > 0) {
                    rollData.specialModifiers['Inaccurate'] = -1 * rollData.modifiers['aim'];
                }
                break;
        }
    }

    // Apply weapon quality effects (Phase 1: Accurate aim bonus)
    applyQualityModifiersToRollData(rollData as unknown as Parameters<typeof applyQualityModifiersToRollData>[0]);
}

export function attackSpecials(): Array<{ name: string; hasLevel: boolean }> {
    return [
        {
            name: 'Accurate',
            hasLevel: false,
        },
        {
            name: 'Balanced',
            hasLevel: false,
        },
        {
            name: 'Blast',
            hasLevel: true,
        },
        {
            name: 'Concussive',
            hasLevel: true,
        },
        {
            name: 'Corrosive',
            hasLevel: false,
        },
        {
            name: 'Crippling',
            hasLevel: true,
        },
        {
            name: 'Defensive',
            hasLevel: false,
        },
        {
            name: 'Felling',
            hasLevel: true,
        },
        {
            name: 'Flame',
            hasLevel: false,
        },
        {
            name: 'Flexible',
            hasLevel: false,
        },
        {
            name: 'Force',
            hasLevel: false,
        },
        {
            name: 'Graviton',
            hasLevel: false,
        },
        {
            name: 'Hallucinogenic',
            hasLevel: true,
        },
        {
            name: 'Haywire',
            hasLevel: true,
        },
        {
            name: 'Inaccurate',
            hasLevel: false,
        },
        {
            name: 'Indirect',
            hasLevel: true,
        },
        {
            name: 'Lance',
            hasLevel: false,
        },
        {
            name: 'Maximal',
            hasLevel: false,
        },
        {
            name: 'Melta',
            hasLevel: false,
        },
        {
            name: 'Overheats',
            hasLevel: false,
        },
        {
            name: 'Power Field',
            hasLevel: false,
        },
        {
            name: 'Primitive',
            hasLevel: true,
        },
        {
            name: 'Proven',
            hasLevel: true,
        },
        {
            name: 'Razor Sharp',
            hasLevel: false,
        },
        {
            name: 'Recharge',
            hasLevel: false,
        },
        {
            name: 'Reliable',
            hasLevel: false,
        },
        {
            name: 'Sanctified',
            hasLevel: false,
        },
        {
            name: 'Scatter',
            hasLevel: false,
        },
        {
            name: 'Smoke',
            hasLevel: true,
        },
        {
            name: 'Snare',
            hasLevel: true,
        },
        {
            name: 'Spray',
            hasLevel: false,
        },
        {
            name: 'Storm',
            hasLevel: false,
        },
        {
            name: 'Tearing',
            hasLevel: false,
        },
        {
            name: 'Toxic',
            hasLevel: true,
        },
        {
            name: 'Twin-Linked',
            hasLevel: false,
        },
        {
            name: 'Unbalanced',
            hasLevel: false,
        },
        {
            name: 'Unreliable',
            hasLevel: false,
        },
        {
            name: 'Unwieldy',
            hasLevel: false,
        },
        {
            name: 'Vengeful',
            hasLevel: true,
        },
        {
            name: 'Gauss',
            hasLevel: false,
        },
    ];
}

export function attackSpecialsNames() {
    return attackSpecials().map((a) => a.name);
}
