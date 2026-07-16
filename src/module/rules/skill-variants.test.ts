/**
 * Tests for the test-variant rule logic (#246).
 */

import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../testing/repo-file.ts';
import { availableSkillVariants, filterModifiersByVariant, modifierAppliesToVariant, type SkillVariant, variantAutoFails } from './skill-variants.ts';

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

describe('variantAutoFails — sense-channel condition gate (#440)', () => {
    const visual: SkillVariant = { name: 'Visual', description: '', blockedBy: 'blinded' };
    const auditory: SkillVariant = { name: 'Auditory', description: '', blockedBy: 'deafened' };
    const untagged: SkillVariant = { name: 'Olfactory', description: '' };

    it('auto-fails when the actor carries the channel-blocking condition (case-insensitive)', () => {
        expect(variantAutoFails(visual, new Set(['blinded']))).toBe(true);
        expect(variantAutoFails(visual, new Set(['BLINDED']))).toBe(false); // set holds lower-cased tokens
        expect(variantAutoFails(auditory, new Set(['deafened', 'prone']))).toBe(true);
    });

    it('does not gate when the blocking condition is absent or the channel declares none', () => {
        expect(variantAutoFails(visual, new Set(['deafened']))).toBe(false);
        expect(variantAutoFails(untagged, new Set(['blinded', 'deafened']))).toBe(false);
        expect(variantAutoFails({ blockedBy: '  ' }, new Set(['blinded']))).toBe(false);
    });
});

describe('availableSkillVariants — enabled by the sense-split toggle too (#440)', () => {
    it('offers channels when refinements are enabled by any source (homebrew OR sense-split)', () => {
        // The caller passes `isHomebrew() || isAwarenessSenseSplit()`; either true enables.
        const enabledBy = (isHomebrew: boolean, isSenseSplit: boolean): boolean => isHomebrew || isSenseSplit;
        expect(availableSkillVariants(AWARENESS, enabledBy(false, true)).map((v) => v.name)).toEqual(['Visual', 'Auditory']);
        expect(availableSkillVariants(AWARENESS, enabledBy(true, false)).map((v) => v.name)).toEqual(['Visual', 'Auditory']);
        expect(availableSkillVariants(AWARENESS, enabledBy(false, false))).toEqual([]);
    });
});

describe('unified roll dialog wires test variants (#246) + sense-split (#440)', () => {
    const dialog = readRepoFile('src/module/applications/prompts/unified-roll-dialog.ts');
    const modifiers = readRepoFile('src/templates/prompt/unified/modifiers.hbs');

    it('computes available variants (homebrew-gated) and applies the variant filter to the modifier sum', () => {
        expect(dialog).toContain('availableSkillVariants(');
        expect(dialog).toContain('filterModifiersByVariant(');
        expect(dialog).toContain('WH40KSettings.isHomebrew()');
    });

    it('renders the variant selector gated on hasSkillVariants', () => {
        expect(modifiers).toContain('{{#if hasSkillVariants}}');
        expect(modifiers).toContain('data-action="selectSkillVariant"');
    });

    it('also enables the variant selector via the granular sense-split toggle (#440)', () => {
        expect(dialog).toContain('WH40KSettings.isAwarenessSenseSplit()');
        expect(dialog).toContain('variantAutoFails(');
    });

    it('propagates the item modifier appliesToVariant tag through getSituationalModifiers (#440 auspex→Visual)', () => {
        // Without this propagation the dialog's filterModifiersByVariant never sees a
        // sense-scoped item modifier, so an auspex bonus tagged Visual would apply to
        // every channel. The acolyte must forward mod.appliesToVariant.
        const acolyte = readRepoFile('src/module/documents/acolyte.ts');
        expect(acolyte).toContain('appliesToVariant');
        const modifiersTemplate = readRepoFile('src/module/data/shared/modifiers-template.ts');
        expect(modifiersTemplate).toContain('appliesToVariant');
    });

    it('runs the skill-use resolution hooks on BOTH simple-roll paths so opposed/auto-resolve fire', () => {
        // Regression: the simple auto (_systemRoll) and manual (_submitSimpleRoll)
        // paths previously skipped checkForOpposed/descriptionText, so #432-#434
        // skill-use flows never resolved through the dialog.
        expect(dialog).toContain('async _resolveSimpleActionHooks()');
        expect(dialog).toContain('this.actionData.checkForOpposed()');
        expect(dialog).toContain('this.actionData.descriptionText()');
        // Both call sites present.
        const hookCalls = dialog.split('await this._resolveSimpleActionHooks()').length - 1;
        expect(hookCalls).toBeGreaterThanOrEqual(2);
    });
});
