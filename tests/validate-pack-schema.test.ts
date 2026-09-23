import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { validateDoc, variant } from '../scripts/validate-pack-schema.mjs';

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
