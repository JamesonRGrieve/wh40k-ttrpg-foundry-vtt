/**
 * Regression coverage for the icon/colour lookup tables (H4). Pins each
 * category mapping + the fallback so collapsing the four hand-rolled helpers
 * onto `lookupOr` cannot drift output.
 */

import { describe, expect, it } from 'vitest';
import { TALENT_ICONS, TIER_COLORS, TRAIT_CATEGORY_COLORS, TRAIT_ICONS, lookupOr } from './icon-lookups';

describe('lookupOr', () => {
    it('returns the mapped value or the fallback', () => {
        expect(lookupOr({ a: 'x' }, 'a', 'fb')).toBe('x');
        expect(lookupOr<string>({ a: 'x' }, 'missing', 'fb')).toBe('fb');
        expect(lookupOr<number>({ 1: 'one' }, 1, 'fb')).toBe('one');
    });
});

describe('lookup tables', () => {
    it('talent icons (incl. general fallback target)', () => {
        expect(TALENT_ICONS['combat']).toBe('fa-sword');
        expect(TALENT_ICONS['psychic']).toBe('fa-brain');
        expect(TALENT_ICONS['general']).toBe('fa-circle');
        expect(lookupOr(TALENT_ICONS, 'nope', 'fa-circle')).toBe('fa-circle');
    });
    it('tier colours', () => {
        expect(TIER_COLORS[1]).toBe('tier-bronze');
        expect(TIER_COLORS[3]).toBe('tier-gold');
        expect(TIER_COLORS[0]).toBe('tier-none');
    });
    it('trait icons + colours', () => {
        expect(TRAIT_ICONS['creature']).toBe('fa-paw');
        expect(lookupOr(TRAIT_ICONS, 'nope', 'fa-shield-alt')).toBe('fa-shield-alt');
        expect(TRAIT_CATEGORY_COLORS['elite']).toBe('trait-elite');
        expect(lookupOr(TRAIT_CATEGORY_COLORS, 'nope', 'trait-general')).toBe('trait-general');
    });
});
