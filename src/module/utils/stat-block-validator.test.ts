import { describe, expect, it } from 'vitest';
import StatBlockValidator, { type StatBlockData } from './stat-block-validator.ts';

/**
 * Coverage for the pure StatBlockValidator (previously untested). Pins the
 * pass/fail behavior: null input, a complete in-range npcV2 block, a missing
 * actor type, and an out-of-range characteristic.
 */
function characteristics(weaponSkillBase = 40): NonNullable<NonNullable<StatBlockData['system']>['characteristics']> {
    return {
        weaponSkill: { base: weaponSkillBase },
        ballisticSkill: { base: 30 },
        strength: { base: 45 },
        toughness: { base: 45 },
        agility: { base: 30 },
        intelligence: { base: 25 },
        perception: { base: 30 },
        willpower: { base: 30 },
        fellowship: { base: 20 },
    };
}

function validBlock(): StatBlockData {
    return { name: 'Ork Boy', type: 'npcV2', system: { characteristics: characteristics(), wounds: { max: 20 } } };
}

describe('StatBlockValidator.validate', () => {
    it('rejects null input', () => {
        const result = StatBlockValidator.validate(null);
        expect(result.valid).toBe(false);
        expect(result.errors.join(' ')).toMatch(/no data/i);
    });

    it('accepts a complete npcV2 block with in-range characteristics', () => {
        const result = StatBlockValidator.validate(validBlock());
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });

    it('errors when the actor type is missing', () => {
        const result = StatBlockValidator.validate({ name: 'X', system: { characteristics: characteristics(), wounds: { max: 20 } } });
        expect(result.valid).toBe(false);
        expect(result.errors.join(' ')).toMatch(/actor type/i);
    });

    it('warns (but stays valid) on an out-of-range characteristic', () => {
        const result = StatBlockValidator.validate({ name: 'X', type: 'npcV2', system: { characteristics: characteristics(250), wounds: { max: 20 } } });
        expect(result.valid).toBe(true);
        expect(result.warnings.join(' ')).toMatch(/outside normal range/i);
    });
});

describe('StatBlockValidator.isValid / getSummary', () => {
    it('isValid mirrors validate().valid', () => {
        expect(StatBlockValidator.isValid(validBlock())).toBe(true);
        expect(StatBlockValidator.isValid(null)).toBe(false);
    });

    it('getSummary returns a non-empty string', () => {
        const summary = StatBlockValidator.getSummary(StatBlockValidator.validate(validBlock()));
        expect(typeof summary).toBe('string');
        expect(summary.length).toBeGreaterThan(0);
    });
});
