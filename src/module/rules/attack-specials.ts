import type { PsychicRollData, RollData, WeaponRollData } from '../rolls/roll-data.ts';
import type { WH40KItemDocument } from '../types/global.d.ts';
import { calculateWeaponModifiersAttackSpecials } from './weapon-modifiers.ts';
import { applyQualityModifiersToRollData } from './weapon-quality-effects.ts';

type AttackSpecialLike = {
    name: string;
    level?: number | boolean | string;
};

/** The chambered round's quality changes, read from the weapon's `loadedAmmo` getter. */
type LoadedAmmoQualities = { addedQualities?: Iterable<string>; removedQualities?: Iterable<string> };

/** Collapse a quality identifier / attack-special name to a comparable key (`Razor Sharp` ⇄ `razor-sharp`). */
function normalizeQualityKey(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Canonical attack-special registry keyed by normalized name, built once at module
// load (`attackSpecials()` is a hoisted pure function returning a static list).
const attackSpecialByKey: Map<string, { name: string; hasLevel: boolean }> = new Map(attackSpecials().map((a) => [normalizeQualityKey(a.name), a]));

/**
 * Bridge an ammunition quality id (lowercase-hyphenated, e.g. `toxic-1`, `blast-1`,
 * `razor-sharp`) to the roll's canonical attack-special ({ name, level }). A trailing
 * `-N` is the level; a level-less quality resolves to `level: true`. Returns null for
 * a pseudo-quality with no combat attack-special (e.g. `clip-reduced-to-1`), which is
 * then skipped. This replaces the name-keyed AMMO_EFFECTS `attackSpecials` table.
 */
export function attackSpecialForQualityId(qualityId: string): { name: string; level: number | boolean } | null {
    const levelMatch = /-(\d+)$/.exec(qualityId);
    const base = levelMatch !== null ? qualityId.slice(0, levelMatch.index) : qualityId;
    const level = levelMatch !== null ? Number(levelMatch[1]) : null;
    const found = attackSpecialByKey.get(normalizeQualityKey(base));
    if (found === undefined) return null;
    return { name: found.name, level: level ?? true };
}

type AttackSpecialCarrier = WH40KItemDocument & {
    isAttackSpecial: boolean;
    system: WH40KItemDocument['system'] & {
        enabled?: boolean;
        level?: number | boolean | string;
    };
};

type AttackSpecialRollData = RollData & {
    attackSpecials: AttackSpecialLike[];
};

type AttackSpecialSourceRollData = WeaponRollData | PsychicRollData;

export function updateAttackSpecials(rollData: AttackSpecialSourceRollData): void {
    const mutableRollData = rollData as AttackSpecialRollData;
    mutableRollData.attackSpecials = [];
    const actionItem = rollData.weapon ?? rollData.power;
    if (!actionItem) return;
    // eslint-disable-next-line no-restricted-syntax -- boundary: actionItem.items is untyped in WH40KItemDocument; cast to structural type for attack-special access
    for (const i of actionItem.items as unknown as AttackSpecialCarrier[]) {
        if (i.isAttackSpecial && (i.system.state.equipped === true || i.system.enabled === true)) {
            const entry: AttackSpecialLike = { name: i.name };
            if (i.system.level !== undefined) entry.level = i.system.level;
            mutableRollData.attackSpecials.push(entry);
        }
    }

    // Las Variable Setting
    if ('lasMode' in rollData && rollData.lasMode) {
        if (rollData.lasMode === 'Overload') {
            mutableRollData.attackSpecials.findSplice((i: AttackSpecialLike) => i.name === 'Reliable');
            mutableRollData.attackSpecials.push({ name: 'Unreliable', level: true });
            mutableRollData.attackSpecials.push({ name: rollData.lasMode, level: true });
        } else if (rollData.lasMode === 'Overcharge') {
            mutableRollData.attackSpecials.push({ name: rollData.lasMode, level: true });
        }
        // 'Standard' → no change.
    }

    if (actionItem.isRanged) {
        // Apply the loaded round's quality changes (#ammo-system, Direction #7):
        // the ammo item's structured `addedQualities` / `removedQualities` (lowercase
        // quality ids) bridge to the roll's canonical attack-special names. This
        // replaces the name-keyed AMMO_EFFECTS `attackSpecials` table.
        const loaded = (actionItem.system as { loadedAmmo?: LoadedAmmoQualities }).loadedAmmo;
        if (loaded !== undefined) {
            for (const q of loaded.removedQualities ?? []) {
                const spec = attackSpecialForQualityId(q);
                if (spec !== null) mutableRollData.attackSpecials.findSplice((i: AttackSpecialLike) => i.name === spec.name);
            }
            for (const q of loaded.addedQualities ?? []) {
                const spec = attackSpecialForQualityId(q);
                if (spec !== null && !mutableRollData.attackSpecials.some((i) => i.name === spec.name)) {
                    mutableRollData.attackSpecials.push(spec);
                }
            }
        }
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: runtime-narrowed union; WeaponModifiers accepts WeaponRollData at runtime
    calculateWeaponModifiersAttackSpecials(mutableRollData as unknown as Parameters<typeof calculateWeaponModifiersAttackSpecials>[0]);
}

/**
 * @param rollData {RollData}
 */
export function calculateAttackSpecialAttackBonuses(rollData: RollData): void {
    // Reset Attack Specials
    rollData.specialModifiers = {};
    const actionItem = rollData.weapon ?? rollData.power;
    if (!actionItem) return;

    const applySpecial = (name: string, rd: RollData): void => {
        if (name === 'Scatter') {
            if (rd.rangeName === 'Point Blank' || rd.rangeName === 'Short Range') {
                rd.specialModifiers['Scatter'] = 10;
            }
            return;
        }
        if (name === 'Indirect') {
            rd.specialModifiers['Indirect'] = 10;
            return;
        }
        if (name === 'Twin-Linked') {
            rd.specialModifiers['Twin-Linked'] = 20;
            return;
        }
        if (name === 'Defensive') {
            rd.specialModifiers['Defensive'] = -10;
            return;
        }
        if (name === 'Accurate') {
            if ((rd.modifiers['aim'] ?? 0) > 0) {
                rd.specialModifiers['Accurate'] = 10;
            }
            return;
        }
        if (name === 'Inaccurate') {
            const aim = rd.modifiers['aim'] ?? 0;
            if (aim > 0) {
                rd.specialModifiers['Inaccurate'] = -aim;
            }
        }
    };

    // eslint-disable-next-line no-restricted-syntax -- boundary: actionItem.items is untyped in WH40KItemDocument; cast to structural type for attack-special access
    for (const item of actionItem.items as unknown as AttackSpecialCarrier[]) {
        if (!item.isAttackSpecial) continue;
        applySpecial(item.name, rollData);
    }

    // Apply weapon quality effects (Phase 1: Accurate aim bonus)
    // eslint-disable-next-line no-restricted-syntax -- boundary: runtime-narrowed RollData; QualityEffects expects WeaponRollData shape at runtime
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

export function attackSpecialsNames(): string[] {
    return attackSpecials().map((a) => a.name);
}
