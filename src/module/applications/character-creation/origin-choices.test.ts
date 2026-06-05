import { describe, expect, it } from 'vitest';
import { choiceBaseLabel, iterateResolvedChoices, type ChoiceLike, type SelectedChoices } from './origin-choices.ts';

/**
 * Pins the choice-key disambiguation (#305) — the produced `choiceKey` is the
 * persisted `selectedChoices` map key, so these fixtures lock it byte-for-byte
 * against the prior per-site logic for the shapes real packs produce.
 */

describe('choiceBaseLabel', () => {
    it('prefers a non-empty label (RT), else name (DH2/BC/OW)', () => {
        expect(choiceBaseLabel({ label: 'Talent Choice', name: 'ignored' })).toBe('Talent Choice');
        expect(choiceBaseLabel({ name: 'Skill' })).toBe('Skill');
        expect(choiceBaseLabel({ label: '', name: 'Skill' })).toBe('Skill'); // empty label → name
    });
});

describe('iterateResolvedChoices', () => {
    function keys(choices: ChoiceLike[], selected: SelectedChoices = {}): string[] {
        return [...iterateResolvedChoices(choices, selected)].map((r) => r.choiceKey);
    }

    it('keys a single choice by its base label, no suffix', () => {
        expect(keys([{ name: 'Skill' }])).toEqual(['Skill']);
        expect(keys([{ label: 'Aptitude' }])).toEqual(['Aptitude']);
    });

    it('appends " (N)" to the 2nd+ occurrence of a duplicated label', () => {
        expect(keys([{ name: 'Skill' }, { name: 'Skill' }, { name: 'Skill' }])).toEqual(['Skill', 'Skill (2)', 'Skill (3)']);
    });

    it('disambiguates per base-label independently', () => {
        expect(keys([{ name: 'Skill' }, { name: 'Talent' }, { name: 'Skill' }])).toEqual(['Skill', 'Talent', 'Skill (2)']);
    });

    // `.map` over the generator (not index-destructure) so results are non-optional
    // and the `?.` parser mismatch (noUncheckedIndexedAccess off in the test tsconfig,
    // on in the main one) never arises.
    it('resolves player picks from the scoped key, coerced to strings', () => {
        const values = [...iterateResolvedChoices([{ name: 'Skill' }, { name: 'Skill' }], { 'Skill': ['dodge'], 'Skill (2)': ['awareness', 1] })].map(
            (r) => r.selectedValues,
        );
        expect(values).toEqual([['dodge'], ['awareness', '1']]);
    });

    it('falls back to the legacy base-label key when the scoped key is absent', () => {
        // pre-disambiguation worlds persisted under the bare base label
        const resolved = [...iterateResolvedChoices([{ name: 'Skill' }], { Skill: ['legacy-pick'] })].map((r) => ({ key: r.choiceKey, sel: r.selectedValues }));
        expect(resolved).toEqual([{ key: 'Skill', sel: ['legacy-pick'] }]);
    });

    it('yields [] when nothing is selected', () => {
        const values = [...iterateResolvedChoices([{ name: 'Skill' }], {})].map((r) => r.selectedValues);
        expect(values).toEqual([[]]);
    });

    it('resolveOption matches by value ?? name, then name, then label', () => {
        const choice: ChoiceLike = {
            name: 'Skill',
            options: [{ value: 'v-dodge', name: 'Dodge' }, { name: 'Awareness' }, { label: 'Survival' }],
        };
        for (const resolved of iterateResolvedChoices([choice], {})) {
            expect(resolved.resolveOption('v-dodge')?.name).toBe('Dodge'); // by value
            expect(resolved.resolveOption('Awareness')?.name).toBe('Awareness'); // by name (no value)
            expect(resolved.resolveOption('Survival')?.label).toBe('Survival'); // by label
            expect(resolved.resolveOption('missing')).toBeUndefined();
        }
    });
});
