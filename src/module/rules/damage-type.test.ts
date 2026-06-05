import { describe, expect, it } from 'vitest';
import { damageType, damageTypeDropdown, damageTypeNames, normalizeBodyPart, normalizeDamageType } from './damage-type.ts';

/**
 * Coverage for the pure damage-type / body-part normalisers used by the
 * critical-damage resolution path. These select the Critical Effects table, so
 * the canonical-collapse rules (casing-insensitive type match, hit-location →
 * body-part folding) are pinned here.
 */

describe('normalizeDamageType', () => {
    it('matches the four canonical types case-insensitively', () => {
        expect(normalizeDamageType('Energy')).toBe('Energy');
        expect(normalizeDamageType('explosive')).toBe('Explosive');
        expect(normalizeDamageType('  IMPACT  ')).toBe('Impact');
        expect(normalizeDamageType('rending')).toBe('Rending');
    });

    it('returns null for an unknown type (caller falls back to Impact)', () => {
        expect(normalizeDamageType('Psychic')).toBeNull();
        expect(normalizeDamageType('')).toBeNull();
        expect(normalizeDamageType(null)).toBeNull();
        expect(normalizeDamageType(undefined)).toBeNull();
    });
});

describe('normalizeBodyPart', () => {
    it('folds the six hit locations onto the four table body-parts (side stripped)', () => {
        expect(normalizeBodyPart('Head')).toBe('Head');
        expect(normalizeBodyPart('Right Arm')).toBe('Arm');
        expect(normalizeBodyPart('Left Arm')).toBe('Arm');
        expect(normalizeBodyPart('Body')).toBe('Body');
        expect(normalizeBodyPart('Right Leg')).toBe('Leg');
        expect(normalizeBodyPart('Left Leg')).toBe('Leg');
    });

    it('accepts limb synonyms (hand→Arm, foot→Leg, torso/chest→Body)', () => {
        expect(normalizeBodyPart('hand')).toBe('Arm');
        expect(normalizeBodyPart('foot')).toBe('Leg');
        expect(normalizeBodyPart('Torso')).toBe('Body');
        expect(normalizeBodyPart('chest')).toBe('Body');
    });

    it('returns null for unresolved / empty input', () => {
        expect(normalizeBodyPart('Wing')).toBeNull();
        expect(normalizeBodyPart('')).toBeNull();
        expect(normalizeBodyPart(null)).toBeNull();
        expect(normalizeBodyPart(undefined)).toBeNull();
    });
});

describe('damageType registry', () => {
    it('lists exactly the four canonical types', () => {
        expect(damageTypeNames()).toEqual(['Energy', 'Explosive', 'Impact', 'Rending']);
    });

    it('every registry name normalises back to itself', () => {
        for (const { name } of damageType()) {
            expect(normalizeDamageType(name)).toBe(name);
        }
    });

    it('damageTypeDropdown is a name→name map of the registry', () => {
        expect(damageTypeDropdown()).toEqual({ Energy: 'Energy', Explosive: 'Explosive', Impact: 'Impact', Rending: 'Rending' });
    });
});
