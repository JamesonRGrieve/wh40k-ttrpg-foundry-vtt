import { describe, expect, it } from 'vitest';
import { parsePrerequisiteString } from './prerequisite-validator.ts';

/**
 * Coverage for the pure prerequisite-string parser (previously untested).
 * checkPrerequisites is actor/CONFIG/i18n-coupled and excluded.
 */
describe('parsePrerequisiteString', () => {
    it('parses a characteristic prerequisite ("<KEY> <N>")', () => {
        expect(parsePrerequisiteString('Fel 30')).toEqual({ type: 'characteristic', key: 'Fel', value: 30 });
        expect(parsePrerequisiteString('WS 40')).toEqual({ type: 'characteristic', key: 'WS', value: 40 });
    });

    it('trims surrounding whitespace before matching', () => {
        expect(parsePrerequisiteString('  Fel 30  ')).toEqual({ type: 'characteristic', key: 'Fel', value: 30 });
    });

    it('falls back to a skill/talent name when not a characteristic pattern', () => {
        expect(parsePrerequisiteString('Quick Draw')).toEqual({ type: 'skill', key: 'Quick Draw' });
        expect(parsePrerequisiteString('Dodge')).toEqual({ type: 'skill', key: 'Dodge' });
    });

    it('returns null for an empty/whitespace string', () => {
        expect(parsePrerequisiteString('')).toBeNull();
        expect(parsePrerequisiteString('   ')).toBeNull();
    });
});
