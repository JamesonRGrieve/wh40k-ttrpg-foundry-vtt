import { describe, expect, it } from 'vitest';
import { identifierFromName, identifierFromNameIfBlank } from './identifier-utils.ts';

describe('identifierFromName', () => {
    it('kebab-cases a plain name', () => {
        expect(identifierFromName('Bolt Pistol')).toBe('bolt-pistol');
    });

    it('strips punctuation and collapses whitespace/hyphens', () => {
        expect(identifierFromName("Sergeant's  Power-Sword!!")).toBe('sergeants-power-sword');
        expect(identifierFromName('  Unrelenting   Devotion  ')).toBe('unrelenting-devotion');
    });

    it('trims leading/trailing hyphens and lowercases', () => {
        expect(identifierFromName('— Astartes —')).toBe('astartes');
        expect(identifierFromName('Mk VII')).toBe('mk-vii');
    });

    it('returns empty string for a name with no usable characters', () => {
        expect(identifierFromName('!!!')).toBe('');
        expect(identifierFromName('   ')).toBe('');
    });
});

describe('identifierFromNameIfBlank (#314 create-time backfill)', () => {
    it('generates from the name when the identifier is blank or missing', () => {
        expect(identifierFromNameIfBlank('Special Ability', '')).toBe('special-ability');
        expect(identifierFromNameIfBlank('Special Ability', undefined)).toBe('special-ability');
    });

    it('keeps an existing non-empty identifier untouched (compendium content / duplicates)', () => {
        expect(identifierFromNameIfBlank('Bolt Pistol', 'legacy_bolt_pistol')).toBeUndefined();
        expect(identifierFromNameIfBlank('Renamed', 'original-id')).toBeUndefined();
    });

    it('returns undefined when blank and the name yields no usable slug (nothing to write)', () => {
        expect(identifierFromNameIfBlank('!!!', '')).toBeUndefined();
        expect(identifierFromNameIfBlank('', undefined)).toBeUndefined();
    });
});
