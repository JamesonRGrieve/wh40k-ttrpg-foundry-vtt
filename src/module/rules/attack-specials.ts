import type { PsychicRollData, RollData, WeaponRollData } from '../rolls/roll-data.ts';
import type { WH40KItemDocument } from '../types/global.d.ts';
import { parseQualityLevel } from '../utils/quality-id.ts';
import { calculateWeaponModifiersAttackSpecials } from './weapon-modifiers.ts';
import { applyQualityModifiersToRollData } from './weapon-quality-effects.ts';
import { chosenQualityEffects, getWeaponQualityMechanicsForId } from './weapon-quality-payloads.ts';

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
    // A dice-rated quality (`blast-10+1d10`) is present but carries no fixed level here.
    const { baseId, level } = parseQualityLevel(qualityId);
    const found = attackSpecialByKey.get(normalizeQualityKey(baseId));
    if (found === undefined) return null;
    return { name: found.name, level: level ?? true };
}

/**
 * The base ids of the selectable qualities (`mechanics.selectable`) in a weapon's
 * quality set — the per-attack firing options the roll dialog offers (Maximal).
 * Which qualities are optional is read from the quality docs, never name-matched.
 */
export function selectableQualityIds(qualityIds: Iterable<string> | undefined, systemId?: string): string[] {
    const ids: string[] = [];
    for (const qualityId of qualityIds ?? []) {
        const { baseId } = parseQualityLevel(qualityId);
        if (ids.includes(baseId)) continue;
        if (getWeaponQualityMechanicsForId(qualityId, systemId)?.selectable === true) ids.push(baseId);
    }
    return ids;
}

/** Flip one selectable quality's opt-in for this attack, returning the new selection. */
export function toggleQualityChoice(selected: readonly string[], qualityId: string): string[] {
    return selected.includes(qualityId) ? selected.filter((id) => id !== qualityId) : [...selected, qualityId];
}

/**
 * Bridge a weapon's quality set (`effectiveSpecial`: lowercase ids such as
 * `tearing`, `proven-3`, `vengeful-9`, already reflecting craftsmanship, the
 * loaded round and the active firing mode) onto the roll's attack specials.
 *
 * Compendium weapons carry their qualities ONLY as these ids — the legacy embedded
 * attack-special items are absent on them — so every `hasAttackSpecial` check
 * (Twin-Linked, Storm, Spray, Reliable, Scatter, Vengeful, …) missed them until
 * bridged here. A quality already present (an embedded item of the same name) is
 * not added twice; an id with no combat attack-special is skipped. A selectable
 * quality is bridged only when its base id is in `chosen` — it is the attacker's
 * per-attack option, not an always-on property.
 *
 * Mutates `specials` and returns the base ids of the selectable qualities bridged.
 */
export function bridgeWeaponQualities(
    specials: AttackSpecialLike[],
    qualityIds: Iterable<string> | undefined,
    chosen: ReadonlySet<string>,
    systemId?: string,
): string[] {
    const bridgedChoices: string[] = [];
    for (const qualityId of qualityIds ?? []) {
        const spec = attackSpecialForQualityId(qualityId);
        if (spec === null) continue;
        const { baseId } = parseQualityLevel(qualityId);
        const selectable = getWeaponQualityMechanicsForId(qualityId, systemId)?.selectable === true;
        if (selectable && !chosen.has(baseId)) continue;
        if (specials.some((s) => s.name === spec.name)) continue;
        specials.push(spec);
        if (selectable) bridgedChoices.push(baseId);
    }
    return bridgedChoices;
}

/**
 * Apply the qualities a chosen quality brings with it (Deathwatch Maximal adds
 * Overheats) and raise an existing Blast rating by its `chosenBlastBonus` (Maximal
 * outside Rogue Trader: +2). Values come from the quality's mechanics per line.
 */
export function applyChosenQualityEffects(specials: AttackSpecialLike[], chosenQualityIds: readonly string[], systemId?: string): void {
    const effects = chosenQualityEffects(chosenQualityIds, systemId);
    for (const qualityId of effects.addedQualities) {
        const spec = attackSpecialForQualityId(qualityId);
        if (spec !== null && !specials.some((s) => s.name === spec.name)) specials.push(spec);
    }
    if (effects.blastBonus === 0) return;
    const blast = attackSpecialForQualityId('blast');
    const existing = blast === null ? undefined : specials.find((s) => s.name === blast.name);
    if (existing !== undefined && typeof existing.level === 'number') existing.level += effects.blastBonus;
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

    // The weapon's own quality set — the only place compendium weapons carry them
    // (absent on a psychic power).
    const qualityIds = actionItem.system.effectiveSpecial;
    if ('selectedQualities' in rollData) {
        rollData.chosenQualities = bridgeWeaponQualities(
            mutableRollData.attackSpecials,
            qualityIds,
            new Set(rollData.selectedQualities),
            rollData.gameSystemId,
        );
        applyChosenQualityEffects(mutableRollData.attackSpecials, rollData.chosenQualities, rollData.gameSystemId);
    } else {
        bridgeWeaponQualities(mutableRollData.attackSpecials, qualityIds, new Set(), rollData.gameSystemId);
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
        if (name === 'Defensive') {
            rd.specialModifiers['Defensive'] = -10;
        }
        // Accurate / Inaccurate / Twin-Linked are resolved once, data-driven, by
        // `applyQualityModifiersToRollData` below (which also sees embedded attack-
        // special items). A second hardcoded copy here drifted from it: Twin-Linked
        // applied in every mode here but only on single shots there.
    };

    // The roll's resolved attack specials: embedded items AND the weapon's bridged
    // quality set, after mode / ammo / weapon-mod changes (see updateAttackSpecials).
    for (const special of rollData.attackSpecials) {
        applySpecial(special.name, rollData);
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
