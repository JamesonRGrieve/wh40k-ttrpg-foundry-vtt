/**
 * Unit tests for the special-ability sheet's Distinction / Renown panel view
 * model (#597).
 */
import { describe, expect, it } from 'vitest';
import type { SpecialAbilityDistinctionFields } from '../../rules/dw-distinction.ts';
import {
    buildCategoryScalar,
    buildDistinctionPanelContext,
    DISTINCTION_MARK_ACCEPT,
    MARK_TRAIT_ACCEPT,
    renownRequirementLabelKey,
} from './special-ability-distinction-panel.ts';

const fields = (overrides: Partial<SpecialAbilityDistinctionFields> = {}): SpecialAbilityDistinctionFields => ({
    category: 'speciality',
    renownRequired: null,
    renownReward: 0,
    cost: 0,
    marks: [],
    grant: { trait: '', activeEffect: '' },
    ...overrides,
});

const resolveName = (uuid: string): string => `name:${uuid}`;

describe('buildCategoryScalar', () => {
    it('offers every category and selects the stored one', () => {
        const scalar = buildCategoryScalar('mark');
        expect(scalar).toMatchObject({ kind: 'select', name: 'system.category', value: 'mark' });
        expect(scalar.options.map((o) => o.value)).toEqual(['speciality', 'advanced', 'distinction', 'mark']);
        expect(scalar.options.find((o) => o.selected)?.labelKey).toBe('WH40K.SpecialAbility.Category.Mark');
    });
});

describe('renownRequirementLabelKey', () => {
    it('labels a rank, and null as none', () => {
        expect(renownRequirementLabelKey('famed')).toBe('WH40K.DW.Renown.Rank.Famed');
        expect(renownRequirementLabelKey(null)).toBe('WH40K.ItemSheet.Distinction.NoRenownRequirement');
    });
});

describe('buildDistinctionPanelContext', () => {
    it('renders no panel for a speciality ability (the default for every line)', () => {
        expect(buildDistinctionPanelContext({ fields: fields(), effects: [], resolveName })).toBeNull();
    });

    it('shows Renown and cost for an advanced ability, without Marks or a grant', () => {
        const ctx = buildDistinctionPanelContext({
            fields: fields({ category: 'advanced', renownRequired: 'respected', renownReward: 2, cost: 500 }),
            effects: [],
            resolveName,
        });
        expect(ctx).toMatchObject({
            renownRequiredPath: 'system.renownRequired',
            renownRewardPath: 'system.renownReward',
            costPath: 'system.cost',
            renownReward: 2,
            cost: 500,
            renownRequiredLabelKey: 'WH40K.DW.Renown.Rank.Respected',
            marks: null,
            grant: null,
        });
        expect(ctx?.renownRequiredOptions.find((o) => o.selected)?.value).toBe('respected');
    });

    it('offers a blank "no requirement" option, selected when the field is null', () => {
        const ctx = buildDistinctionPanelContext({ fields: fields({ category: 'advanced' }), effects: [], resolveName });
        expect(ctx?.renownRequiredOptions[0]).toEqual({ value: '', labelKey: 'WH40K.ItemSheet.Distinction.NoRenownRequirement', selected: true });
        expect(ctx?.renownRequiredOptions.slice(1).map((o) => o.value)).toEqual(['initiated', 'respected', 'distinguished', 'famed', 'hero']);
    });

    it('lists a Distinction’s Marks as a Mark-only drop list on system.marks', () => {
        const ctx = buildDistinctionPanelContext({ fields: fields({ category: 'distinction', marks: ['m1', 'm2'] }), effects: [], resolveName });
        expect(ctx?.marks).toMatchObject({ path: 'system.marks', mode: 'list', accept: DISTINCTION_MARK_ACCEPT });
        expect(ctx?.marks?.entries.map((e) => e.name)).toEqual(['name:m1', 'name:m2']);
        expect(ctx?.grant).toBeNull();
    });

    it('edits a Mark’s grant as a single trait reference plus an effect picker', () => {
        const ctx = buildDistinctionPanelContext({
            fields: fields({ category: 'mark', grant: { trait: 't1', activeEffect: 'fx' } }),
            effects: [{ id: 'fx', name: 'Iron Hide' }],
            resolveName,
        });
        expect(ctx?.marks).toBeNull();
        expect(ctx?.grant?.trait).toMatchObject({ path: 'system.grant.trait', mode: 'single', accept: MARK_TRAIT_ACCEPT });
        expect(ctx?.grant?.trait.entries).toEqual([{ uuid: 't1', name: 'name:t1', index: -1 }]);
        expect(ctx?.grant?.activeEffectPath).toBe('system.grant.activeEffect');
        expect(ctx?.grant?.activeEffectName).toBe('Iron Hide');
        expect(ctx?.grant?.activeEffectOptions).toEqual([{ value: 'fx', label: 'Iron Hide', selected: true }]);
    });
});
