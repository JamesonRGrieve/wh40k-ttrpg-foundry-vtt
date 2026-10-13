import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DAMAGE_SOURCE, DAMAGE_TYPE, validateDoc, variant, WEAPON_CLASS } from '../scripts/validate-pack-schema.mjs';
import { WEAPON_CLASS_CHOICES } from '../src/module/data/shared/weapon-class.ts';
import { DAMAGE_SOURCE_CHOICES, DAMAGE_TYPE_CHOICES } from '../src/module/rules/damage-profile.ts';

/**
 * Unit coverage for the Zod v4 compendium content-schema gate
 * (`scripts/validate-pack-schema.mjs`). The gate is green on the whole `_source`
 * corpus and must catch the corruption class that bit us in play — a ranged weapon
 * stored as `class: "melee"`, a bad enum, a bad `crewExposure` — while accepting the
 * homologated variant-container authoring format and the neutral blank crewExposure.
 */

describe('validateDoc', () => {
    it('passes a well-formed ranged weapon', () => {
        const doc = {
            name: 'Autocannon',
            type: 'weapon',
            system: { class: 'heavy', type: 'solid-projectile', melee: false, attack: { type: 'ranged', characteristic: 'ballisticSkill' } },
        };
        expect(validateDoc(doc)).toEqual([]);
    });

    it('CATCHES a ranged weapon mis-typed as melee (the Dreadnought corruption)', () => {
        const doc = {
            name: 'Autocannon',
            type: 'weapon',
            system: { class: 'heavy', type: 'solid-projectile', melee: true, attack: { type: 'melee', characteristic: 'weaponSkill' } },
        };
        const errs = validateDoc(doc);
        expect(errs.length).toBeGreaterThan(0);
        expect(errs.join(' ')).toMatch(/incoherent weapon/);
    });

    it('catches an invalid class enum (typo)', () => {
        expect(validateDoc({ name: 'Sword', type: 'weapon', system: { class: 'meele' } }).length).toBeGreaterThan(0);
    });

    it('accepts a per-line variant container for class', () => {
        expect(validateDoc({ name: 'Grenade Launcher', type: 'weapon', system: { class: { dh2: 'basic', dw: 'basic' } } })).toEqual([]);
    });

    it('accepts the neutral blank crewExposure but rejects an invalid one', () => {
        expect(validateDoc({ name: 'Walker', type: 'vehicleTrait', system: { effects: { crewExposure: '' } } })).toEqual([]);
        expect(validateDoc({ name: 'Walker', type: 'vehicleTrait', system: { effects: { crewExposure: 'exposed' } } }).length).toBeGreaterThan(0);
    });

    it('skips whole-file reference stubs and non-Item/Actor documents', () => {
        expect(validateDoc({ reference: 'packs/x/_source/y.json' })).toEqual([]);
        expect(validateDoc({ name: 'Session 1', text: { content: '<p>…</p>' } })).toEqual([]);
    });
});

describe('variant', () => {
    it('accepts a scalar, a PARTIAL per-line container, and rejects non-line keys', () => {
        const schema = variant(z.enum(['a', 'b']));
        expect(schema.safeParse('a').success).toBe(true);
        expect(schema.safeParse({ dh2: 'a', dw: 'b' }).success).toBe(true); // subset of lines is fine
        expect(schema.safeParse({ notALine: 'a' }).success).toBe(false);
    });
});

describe('weapon class list', () => {
    // The gate once kept its own list and rejected `placed` (DW Melta Bomb) after the
    // DataModel accepted it. Every DataModel class must pass the gate.
    it('accepts every class the weapon DataModel accepts', () => {
        for (const cls of WEAPON_CLASS_CHOICES) expect(WEAPON_CLASS).toContain(cls);
    });
});

describe('contextual damage profiles (#608)', () => {
    const band = (maxRange: number | null, formula = '1d10'): object => ({ maxRange, formula, type: 'energy', penetration: 2, bonus: 9, qualities: [] });
    const weapon = (damage: object): object => ({ name: 'Beamer', type: 'weapon', system: { damage } });

    it('keeps the gate lists in step with the DataModel choices', () => {
        expect(DAMAGE_TYPE).toEqual([...DAMAGE_TYPE_CHOICES]);
        expect(DAMAGE_SOURCE).toEqual([...DAMAGE_SOURCE_CHOICES]);
    });

    it('accepts rising bands with an unbounded last band, per line too', () => {
        expect(validateDoc(weapon({ formula: '', bands: [band(15), band(50), band(null)] }))).toEqual([]);
        expect(validateDoc(weapon({ dh1: { formula: '', bands: [band(15), band(null)] } }))).toEqual([]);
    });

    it('rejects bands out of order, an unbounded band before the last, and a malformed band', () => {
        expect(validateDoc(weapon({ bands: [band(50), band(15)] })).length).toBeGreaterThan(0);
        expect(validateDoc(weapon({ bands: [band(null), band(50)] })).length).toBeGreaterThan(0);
        expect(validateDoc(weapon({ bands: [{ maxRange: 15, formula: '', type: 'energy', penetration: 0, bonus: 0, qualities: [] }] })).length).toBeGreaterThan(
            0,
        );
        expect(validateDoc(weapon({ bands: [{ ...band(15), type: 'plasma' }] })).length).toBeGreaterThan(0);
    });

    it('accepts a RollTable UUID or blank for `table`, and rejects anything else', () => {
        expect(validateDoc(weapon({ table: 'Compendium.wh40k-rpg.dh1-radical-rolltables.RollTable.15df0cf72c366222' }))).toEqual([]);
        expect(validateDoc(weapon({ table: '' }))).toEqual([]);
        expect(validateDoc(weapon({ table: 'Compendium.wh40k-rpg.dh1-radical-items-weapons.Item.1668f6aa4b3e9469' })).length).toBeGreaterThan(0);
    });

    it('accepts the borrowed sources and rejects an unknown one', () => {
        expect(validateDoc(weapon({ from: 'mount' }))).toEqual([]);
        expect(validateDoc(weapon({ from: 'wielder-melee' }))).toEqual([]);
        expect(validateDoc(weapon({ from: 'wielder' })).length).toBeGreaterThan(0);
    });

    it('accepts the IM string damage notation as authored', () => {
        expect(validateDoc(weapon({ im: '2 + StrB' }))).toEqual([]);
    });

    it('checks a RollTable result damage profile', () => {
        const table = (damageProfile: object): object => ({ name: 'Discharge', results: [{ range: [1, 10], flags: { 'wh40k-rpg': { damageProfile } } }] });
        expect(validateDoc(table({ formula: '3d10', bonus: 10, type: 'energy', penetration: 0 }))).toEqual([]);
        expect(validateDoc(table({ formula: '' })).length).toBeGreaterThan(0);
        expect(validateDoc(table({ formula: '3d10', type: 'warp' })).length).toBeGreaterThan(0);
        expect(validateDoc({ name: 'Plain', results: [{ range: [1, 10], text: 'x' }] })).toEqual([]);
    });
});
