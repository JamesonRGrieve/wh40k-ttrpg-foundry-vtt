import { describe, expect, it } from 'vitest';
import { TRADE_ARMOURER_FITTING_RULES } from '../config/game-systems/base-system-config.ts';
import { DH2_ACQUISITION_LADDER, DH2_WEAPON_MODIFICATION_RULES } from '../config/game-systems/dh2-config.ts';
import { weaponModificationRulesFor } from '../config/game-systems/index.ts';
import {
    damagedWeaponQualities,
    fittingOutcome,
    modificationAvailabilityModifier,
    modificationBlocker,
    modificationEffectLines,
    modificationEntry,
    modifiedRange,
    modifiedRateOfFire,
    type ModificationSource,
    partsSourceUuid,
    sumModificationModifiers,
} from './weapon-modification';

const dh2 = DH2_WEAPON_MODIFICATION_RULES;
const plain = TRADE_ARMOURER_FITTING_RULES;

function mod(overrides: Partial<ModificationSource['system']> = {}, uuid = 'Compendium.wh40k-rpg.dh2-weapon-mods.Item.grip'): ModificationSource {
    return { uuid, name: 'Custom Grip', system: { category: 'stock', modifiers: { toHit: 5 }, ...overrides } };
}

describe('modificationAvailabilityModifier (DH2)', () => {
    it('takes the availability table value of the modification’s Availability', () => {
        expect(modificationAvailabilityModifier(dh2, DH2_ACQUISITION_LADDER, 'rare')).toBe(-20);
        expect(modificationAvailabilityModifier(dh2, DH2_ACQUISITION_LADDER, 'very-rare')).toBe(-30);
        expect(modificationAvailabilityModifier(dh2, DH2_ACQUISITION_LADDER, 'plentiful')).toBe(20);
    });
    it('gives no row for a rating printed without a number, or an unknown one', () => {
        expect(modificationAvailabilityModifier(dh2, DH2_ACQUISITION_LADDER, 'ubiquitous')).toBeNull();
        expect(modificationAvailabilityModifier(dh2, DH2_ACQUISITION_LADDER, 'uncommon')).toBeNull();
        expect(modificationAvailabilityModifier(dh2, DH2_ACQUISITION_LADDER, undefined)).toBeNull();
    });
    it('gives no row on a line whose plain test takes no Availability modifier', () => {
        expect(modificationAvailabilityModifier(plain, DH2_ACQUISITION_LADDER, 'rare')).toBeNull();
        expect(modificationAvailabilityModifier(dh2, null, 'rare')).toBeNull();
    });
});

describe('fittingOutcome', () => {
    it('fits and uses up the parts on a success', () => {
        expect(fittingOutcome(dh2, true, 0)).toEqual({ fitted: true, partsConsumed: true, weaponDamaged: false });
        expect(fittingOutcome(plain, true, 0)).toEqual({ fitted: true, partsConsumed: true, weaponDamaged: false });
    });
    it('DH2: a failure loses the parts; two or more degrees also damage the weapon', () => {
        expect(fittingOutcome(dh2, false, 1)).toEqual({ fitted: false, partsConsumed: true, weaponDamaged: false });
        expect(fittingOutcome(dh2, false, 2)).toEqual({ fitted: false, partsConsumed: true, weaponDamaged: true });
        expect(fittingOutcome(dh2, false, 5)).toEqual({ fitted: false, partsConsumed: true, weaponDamaged: true });
    });
    it('DH1 / RT / OW: a failure keeps the parts and never damages the weapon', () => {
        expect(fittingOutcome(plain, false, 6)).toEqual({ fitted: false, partsConsumed: false, weaponDamaged: false });
    });
});

describe('damagedWeaponQualities', () => {
    it('makes an ordinary weapon Unreliable', () => {
        expect(damagedWeaponQualities(['tearing'])).toEqual(['tearing', 'unreliable']);
    });
    it('strips Reliable instead from a Reliable weapon', () => {
        expect(damagedWeaponQualities(['reliable', 'tearing'])).toEqual(['tearing']);
    });
    it('leaves an already-Unreliable weapon Unreliable', () => {
        expect(damagedWeaponQualities(['unreliable'])).toEqual(['unreliable']);
    });
});

describe('modificationBlocker', () => {
    const weapon = { class: 'basic', type: 'las', modifications: [] as { uuid: string }[] };
    it('allows an unrestricted modification', () => {
        expect(modificationBlocker(weapon, mod())).toBeNull();
    });
    it('enforces the class and type restrictions', () => {
        expect(modificationBlocker(weapon, mod({ restrictions: { weaponClasses: new Set(['pistol']) } }))).toBe('weaponClass');
        expect(modificationBlocker(weapon, mod({ restrictions: { weaponTypes: new Set(['bolt']) } }))).toBe('weaponType');
        expect(modificationBlocker(weapon, mod({ restrictions: { weaponClasses: new Set(['basic']), weaponTypes: new Set(['las']) } }))).toBeNull();
    });
    it('refuses a second copy, matched by the source the entry points at', () => {
        const fitted = { ...weapon, modifications: [{ uuid: 'Compendium.source' }] };
        expect(modificationBlocker(fitted, mod({}, 'Actor.a.Item.parts'), 'Compendium.source')).toBe('alreadyInstalled');
        expect(modificationBlocker(fitted, mod({}, 'Actor.a.Item.parts'))).toBeNull();
    });
});

describe('modificationEntry', () => {
    it('caches the modifiers and points at the given source', () => {
        expect(modificationEntry(mod(), 'Compendium.source')).toEqual({
            uuid: 'Compendium.source',
            name: 'Custom Grip',
            active: true,
            category: 'stock',
            cachedModifiers: {
                damage: 0,
                penetration: 0,
                toHit: 5,
                range: 0,
                weight: 0,
                clip: 0,
                rangeMultiplier: 1,
                rateOfFire: { single: 0, semi: 0, full: 0 },
            },
        });
    });
    it('defaults a blank category to accessory', () => {
        expect(modificationEntry(mod({ category: '' })).category).toBe('accessory');
    });
});

describe('partsSourceUuid', () => {
    it('prefers the compendium source, since the parts item is used up', () => {
        expect(partsSourceUuid({ uuid: 'Actor.a.Item.p', _stats: { compendiumSource: 'Compendium.x.Item.y' } })).toBe('Compendium.x.Item.y');
    });
    it('falls back to the parts’ own uuid', () => {
        expect(partsSourceUuid({ uuid: 'Actor.a.Item.p', _stats: { compendiumSource: null } })).toBe('Actor.a.Item.p');
        expect(partsSourceUuid({ uuid: 'Actor.a.Item.p' })).toBe('Actor.a.Item.p');
    });
});

describe('weaponModificationRulesFor — per-line gating (#136)', () => {
    it('DH2 prints the full personal-modification rule, xenos step included', () => {
        const rules = weaponModificationRulesFor('dh2');
        expect(rules).toBe(DH2_WEAPON_MODIFICATION_RULES);
        expect(rules?.fitSkill).toEqual({ skill: 'trade', specialisation: 'Armourer' });
        expect(rules?.removalSkill).toEqual({ skill: 'techUse', specialisation: null });
        expect(rules?.xenos).toEqual({ loreModifier: -20, repairModifier: -20, bonusPerLoreDegree: 5 });
    });
    it('DH1, RT and OW print a plain successful Trade (Armourer) test', () => {
        for (const line of ['dh1', 'rt', 'ow']) expect(weaponModificationRulesFor(line)).toBe(TRADE_ARMOURER_FITTING_RULES);
    });
    it('DW, BC and IM print no fitting test', () => {
        for (const line of ['dw', 'bc', 'im']) expect(weaponModificationRulesFor(line)).toBeNull();
        expect(weaponModificationRulesFor(undefined)).toBeNull();
    });
});

describe('a modification changes clip, range and rate of fire (#740)', () => {
    const capacitor = mod({ category: 'magazine', modifiers: { clip: 10 } }, 'Item.capacitor');
    const scope = mod({ category: 'sight', modifiers: { rangeMultiplier: 1.5, range: 10 } }, 'Item.scope');
    const burst = mod({ category: 'barrel', modifiers: { rateOfFire: { semi: 1, full: -2, single: -1 } } }, 'Item.burst');

    it('caches the clip, range multiplier and rate of fire with the rest', () => {
        expect(modificationEntry(capacitor).cachedModifiers.clip).toBe(10);
        expect(modificationEntry(scope).cachedModifiers.rangeMultiplier).toBe(1.5);
        expect(modificationEntry(burst).cachedModifiers.rateOfFire).toEqual({ single: -1, semi: 1, full: -2 });
    });

    it('sums the active modifications: deltas add, multipliers multiply', () => {
        const switchedOff = { ...modificationEntry(mod({ modifiers: { clip: 5, rangeMultiplier: 2 } }, 'Item.off')), active: false };
        const total = sumModificationModifiers([...[capacitor, scope, burst].map((m) => modificationEntry(m)), switchedOff]);
        expect(total.clip).toBe(10);
        expect(total.range).toBe(10);
        expect(total.rangeMultiplier).toBe(1.5);
        expect(total.rateOfFire).toEqual({ single: -1, semi: 1, full: -2 });
    });

    it('reads a loaded modification live, so an edit after fitting applies; the cache answers otherwise', () => {
        const entries = [modificationEntry(capacitor), modificationEntry(scope)];
        const live = (uuid: string): { clip: number } | null => (uuid === 'Item.capacitor' ? { clip: 25 } : null);
        const total = sumModificationModifiers(entries, live);
        expect(total.clip).toBe(25);
        expect(total.rangeMultiplier).toBe(1.5);
    });

    it('applies range deltas, then multipliers, rounding down and never below 0', () => {
        expect(modifiedRange(100, { range: 10, rangeMultiplier: 1.5 })).toBe(165);
        expect(modifiedRange(35, { range: 0, rangeMultiplier: 0.66 })).toBe(23);
        expect(modifiedRange(10, { range: -30, rangeMultiplier: 1 })).toBe(0);
    });

    it('grows or shrinks a firing mode the weapon has, never below 1, and gives or takes single shot', () => {
        expect(modifiedRateOfFire({ single: true, semi: 3, full: 0 }, { single: -1, semi: 1, full: 2 })).toEqual({ single: false, semi: 4, full: 0 });
        expect(modifiedRateOfFire({ single: false, semi: 2, full: 4 }, { single: 1, semi: -5, full: 0 })).toEqual({ single: true, semi: 1, full: 4 });
    });

    it('lists each effect for the weapon sheet, and none for a neutral block', () => {
        expect(modificationEffectLines({ clip: 10, rangeMultiplier: 1.5, rateOfFire: { single: 1, semi: -1 } })).toEqual([
            { key: 'WH40K.WeaponSheet.EffectRangeMultiplier', value: '1.5' },
            { key: 'WH40K.WeaponSheet.EffectClip', value: '+10' },
            { key: 'WH40K.WeaponSheet.EffectSingleShotGained', value: '' },
            { key: 'WH40K.WeaponSheet.EffectRateOfFireSemi', value: '-1' },
        ]);
        expect(modificationEffectLines({})).toEqual([]);
    });
});
