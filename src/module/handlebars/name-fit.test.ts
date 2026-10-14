import { describe, expect, it } from 'vitest';
import { NAME_FIT_MAX_FITTED_CHARS, nameFitClass } from './name-fit.ts';

describe('nameFitClass (#630)', () => {
    it('keeps the base size for a short name', () => {
        expect(nameFitClass('Bloodletter')).toBe('tw-text-[1.05rem]');
        expect(nameFitClass('x'.repeat(17))).toBe('tw-text-[1.05rem]');
    });

    it('steps the font down as the name grows', () => {
        expect(nameFitClass('x'.repeat(18))).toBe('tw-text-[0.9rem]');
        expect(nameFitClass('Asphodel Kroot Warrior')).toBe('tw-text-[0.8rem]');
        expect(nameFitClass('x'.repeat(25))).toBe('tw-text-[0.7rem]');
        expect(nameFitClass('x'.repeat(NAME_FIT_MAX_FITTED_CHARS))).toBe('tw-text-[0.7rem]');
    });

    it('drops to the floor size past the longest fitted name', () => {
        expect(nameFitClass('x'.repeat(NAME_FIT_MAX_FITTED_CHARS + 1))).toBe('tw-text-[0.65rem]');
        expect(nameFitClass('Lord of Change, Greater Daemon of Tzeentch')).toBe('tw-text-[0.65rem]');
    });

    it('ignores surrounding whitespace', () => {
        expect(nameFitClass(`   ${'x'.repeat(17)}   `)).toBe('tw-text-[1.05rem]');
    });

    it('treats an empty name as short', () => {
        expect(nameFitClass('')).toBe('tw-text-[1.05rem]');
    });
});
