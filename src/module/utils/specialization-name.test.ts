import { describe, expect, it } from 'vitest';
import { composeSpecializationName, parseSpecializationName, stripSpecializationSuffix } from './specialization-name.ts';

describe('composeSpecializationName', () => {
    it('appends the specialization to a bare base name (the normal SPEC case)', () => {
        expect(composeSpecializationName('Weapon Training', 'Shock')).toBe('Weapon Training (Shock)');
    });

    it('strips the "(X)" placeholder the base item ships with before composing', () => {
        expect(composeSpecializationName('Weapon Training (X)', 'Shock')).toBe('Weapon Training (Shock)');
        expect(composeSpecializationName('Weapon Training (x)', 'Las')).toBe('Weapon Training (Las)');
    });

    it('does NOT double a specialization the name already carries (#261)', () => {
        // Legacy/contaminated data: name baked the spec in AND the field holds it.
        expect(composeSpecializationName('Weapon Training (Shock)', 'Shock')).toBe('Weapon Training (Shock)');
    });

    it('returns the base unchanged when there is no specialization', () => {
        expect(composeSpecializationName('Ambidextrous', '')).toBe('Ambidextrous');
        expect(composeSpecializationName('Ambidextrous', null)).toBe('Ambidextrous');
        expect(composeSpecializationName('Ambidextrous', undefined)).toBe('Ambidextrous');
    });

    it('does not strip a non-placeholder trailing parenthetical when no spec is given', () => {
        // Without a spec we leave the name alone — only the placeholder strip is spec-gated.
        expect(composeSpecializationName('Lore (Forbidden)', '')).toBe('Lore (Forbidden)');
    });

    it('trims surrounding whitespace on the base name', () => {
        expect(composeSpecializationName('  Trade  ', 'Armourer')).toBe('Trade (Armourer)');
    });
});

describe('stripSpecializationSuffix', () => {
    it('removes a trailing "(X)" placeholder', () => {
        expect(stripSpecializationSuffix('Weapon Training (X)')).toBe('Weapon Training');
    });

    it('removes a baked-in specialization so storage keeps only the bare base', () => {
        expect(stripSpecializationSuffix('Weapon Training (Shock)')).toBe('Weapon Training');
    });

    it('leaves a name with no trailing parenthetical untouched', () => {
        expect(stripSpecializationSuffix('Ambidextrous')).toBe('Ambidextrous');
    });

    it('only strips the final trailing parenthetical', () => {
        expect(stripSpecializationSuffix('Foo (Bar) (Baz)')).toBe('Foo (Bar)');
    });
});

describe('parseSpecializationName', () => {
    it('splits a "Name (Spec)" full name into base and specialization', () => {
        expect(parseSpecializationName('Common Lore (Imperium)')).toEqual({ name: 'Common Lore', specialization: 'Imperium' });
        expect(parseSpecializationName('Acrobatics (Tumbling)')).toEqual({ name: 'Acrobatics', specialization: 'Tumbling' });
    });

    it('returns a null specialization for a bare name', () => {
        expect(parseSpecializationName('Awareness')).toEqual({ name: 'Awareness', specialization: null });
    });

    it('round-trips with composeSpecializationName', () => {
        const parsed = parseSpecializationName('Trade (Armourer)');
        expect(composeSpecializationName(parsed.name, parsed.specialization)).toBe('Trade (Armourer)');
    });

    it('trims whitespace around the base and the specialization', () => {
        expect(parseSpecializationName('  Speak Language ( Low Gothic ) ')).toEqual({ name: 'Speak Language', specialization: 'Low Gothic' });
    });

    it('handles the empty string without throwing', () => {
        expect(parseSpecializationName('')).toEqual({ name: '', specialization: null });
    });
});
