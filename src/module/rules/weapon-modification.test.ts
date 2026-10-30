import { describe, expect, it } from 'vitest';
import { TRADE_ARMOURER_FITTING_RULES } from '../config/game-systems/base-system-config.ts';
import { DH2_ACQUISITION_LADDER, DH2_WEAPON_MODIFICATION_RULES } from '../config/game-systems/dh2-config.ts';
import { weaponModificationRulesFor } from '../config/game-systems/index.ts';
import {
    damagedWeaponQualities,
    fittingOutcome,
    modificationAvailabilityModifier,
    modificationBlocker,
    modificationEntry,
    type ModificationSource,
    partsSourceUuid,
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
            cachedModifiers: { damage: 0, penetration: 0, toHit: 5, range: 0, weight: 0 },
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
