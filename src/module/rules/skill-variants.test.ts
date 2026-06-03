/**
 * Tests for the test-variant rule logic (#246).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { availableSkillVariants, filterModifiersByVariant, modifierAppliesToVariant, type SkillVariant } from './skill-variants.ts';

const AWARENESS: SkillVariant[] = [
    { name: 'Visual', description: 'Sight-based perception.' },
    { name: 'Auditory', description: 'Hearing-based perception.' },
];

describe('availableSkillVariants (homebrew gate)', () => {
    it('returns the declared variants when homebrew refinements are on', () => {
        expect(availableSkillVariants(AWARENESS, true).map((v) => v.name)).toEqual(['Visual', 'Auditory']);
    });

    it('returns none in RAW mode (gate)', () => {
        expect(availableSkillVariants(AWARENESS, false)).toEqual([]);
    });

    it('drops blank-named entries and tolerates undefined', () => {
        expect(availableSkillVariants([{ name: '  ', description: 'x' }], true)).toEqual([]);
        expect(availableSkillVariants(undefined, true)).toEqual([]);
    });
});

describe('modifierAppliesToVariant', () => {
    it('untagged modifiers are universal', () => {
        expect(modifierAppliesToVariant({}, 'Visual')).toBe(true);
        expect(modifierAppliesToVariant({ appliesToVariant: '' }, 'Visual')).toBe(true);
        expect(modifierAppliesToVariant({ appliesToVariant: null }, 'Visual')).toBe(true);
    });

    it('a tagged modifier applies only to its variant once one is selected', () => {
        expect(modifierAppliesToVariant({ appliesToVariant: 'Visual' }, 'Visual')).toBe(true);
        expect(modifierAppliesToVariant({ appliesToVariant: 'Visual' }, 'Auditory')).toBe(false);
    });

    it('does not filter tagged modifiers when no variant is selected (RAW)', () => {
        expect(modifierAppliesToVariant({ appliesToVariant: 'Visual' }, null)).toBe(true);
        expect(modifierAppliesToVariant({ appliesToVariant: 'Visual' }, '')).toBe(true);
    });
});

describe('filterModifiersByVariant', () => {
    it('keeps universal + matching-variant modifiers, drops mismatched (auspex +20 visual only)', () => {
        const mods = [
            { key: 'auspex', value: 20, appliesToVariant: 'Visual' },
            { key: 'darkness', value: -10 },
            { key: 'echo', value: 10, appliesToVariant: 'Auditory' },
        ];
        expect(filterModifiersByVariant(mods, 'Visual').map((m) => m.key)).toEqual(['auspex', 'darkness']);
        expect(filterModifiersByVariant(mods, 'Auditory').map((m) => m.key)).toEqual(['darkness', 'echo']);
        // No variant selected → everything applies.
        expect(filterModifiersByVariant(mods, null).map((m) => m.key)).toEqual(['auspex', 'darkness', 'echo']);
    });
});

describe('unified roll dialog wires test variants (#246)', () => {
    const dialog = readFileSync(resolve(__dirname, '../applications/prompts/unified-roll-dialog.ts'), 'utf8');
    const modifiers = readFileSync(resolve(__dirname, '../../templates/prompt/unified/modifiers.hbs'), 'utf8');

    it('computes available variants (homebrew-gated) and applies the variant filter to the modifier sum', () => {
        expect(dialog).toContain('availableSkillVariants(');
        expect(dialog).toContain('filterModifiersByVariant(');
        expect(dialog).toContain('WH40KSettings.isHomebrew()');
    });

    it('renders the variant selector gated on hasSkillVariants', () => {
        expect(modifiers).toContain('{{#if hasSkillVariants}}');
        expect(modifiers).toContain('data-action="selectSkillVariant"');
    });
});
