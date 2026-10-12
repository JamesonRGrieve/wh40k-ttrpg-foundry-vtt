/**
 * @file View model for the Distinction / Renown panel on the special-ability
 * sheet (#597).
 *
 * A `specialAbility` item's Deathwatch fields (shape:
 * {@link SpecialAbilityDistinctionFields} in `rules/dw-distinction.ts`) are
 * edited here. The category select always shows; the Renown gate, Renown
 * reward and XP cost show only for the Renown categories (advanced /
 * distinction / mark); a Distinction additionally lists the Marks it combines
 * and a Mark shows its trait / Active Effect grant. A `speciality` ability —
 * the default for every pre-existing special ability, in every line — gets no
 * panel.
 *
 * Pure: the sheet supplies the stored fields, the item's embedded effects and a
 * UUID → name resolver.
 */

import {
    SPECIAL_ABILITY_CATEGORIES,
    type SpecialAbilityDistinctionFields,
    isRenownCategory,
    specialAbilityCategoryLabelKey,
} from '../../rules/dw-distinction.ts';
import { RENOWN_RANK_ORDER, type RenownRank, renownRankLabelKey } from '../../rules/dw-renown.ts';
import {
    buildReferenceList,
    type EffectChoice,
    effectName,
    effectOptions,
    type LiteralOption,
    type ReferenceListContext,
    type SelectOption,
    type UuidNameResolver,
} from './reference-list-edits.ts';

/** Drop-zone accept tokens for the Marks a Distinction combines. */
export const DISTINCTION_MARK_ACCEPT = 'specialAbility:mark';

/** Drop-zone accept tokens for the trait a Mark grants. */
export const MARK_TRAIT_ACCEPT = 'trait';

/** Langpack key shown for an ability with no Renown requirement. */
const NO_RENOWN_REQUIREMENT_KEY = 'WH40K.ItemSheet.Distinction.NoRenownRequirement';

/** The `system.category` select, as the content-block template's scalar list renders it. */
export interface CategoryScalar {
    kind: 'select';
    name: string;
    labelKey: string;
    value: string;
    options: SelectOption[];
}

/** A Mark of Distinction's grant editor. */
export interface MarkGrantView {
    trait: ReferenceListContext;
    activeEffectPath: string;
    activeEffectOptions: LiteralOption[];
    activeEffectName: string;
}

/** Context of `special-ability-distinction-panel.hbs`. */
export interface DistinctionPanelContext {
    renownRequiredPath: string;
    renownRequiredOptions: SelectOption[];
    renownRequiredLabelKey: string;
    renownRewardPath: string;
    renownReward: number;
    costPath: string;
    cost: number;
    /** The Marks a Distinction combines; `null` for any other category. */
    marks: ReferenceListContext | null;
    /** A Mark's grant; `null` for any other category. */
    grant: MarkGrantView | null;
}

/** The category select of a special ability. */
export function buildCategoryScalar(category: SpecialAbilityDistinctionFields['category']): CategoryScalar {
    return {
        kind: 'select',
        name: 'system.category',
        labelKey: 'WH40K.ItemSheet.Distinction.Category',
        value: category,
        options: SPECIAL_ABILITY_CATEGORIES.map((c) => ({ value: c, labelKey: specialAbilityCategoryLabelKey(c), selected: c === category })),
    };
}

/** Langpack key for a stored Renown requirement; `null` reads as "none". */
export function renownRequirementLabelKey(rank: RenownRank | null): string {
    return rank === null ? NO_RENOWN_REQUIREMENT_KEY : renownRankLabelKey(rank);
}

/**
 * Build the panel context, or `null` for a category that carries no Renown /
 * Distinction data (a `speciality` ability).
 */
export function buildDistinctionPanelContext(args: {
    fields: SpecialAbilityDistinctionFields;
    effects: readonly EffectChoice[];
    resolveName: UuidNameResolver;
}): DistinctionPanelContext | null {
    const { fields, effects, resolveName } = args;
    if (!isRenownCategory(fields.category)) return null;

    // The blank option submits '' — the nullable, non-blank schema field cleans it back to null.
    const renownRequiredOptions: SelectOption[] = [
        { value: '', labelKey: NO_RENOWN_REQUIREMENT_KEY, selected: fields.renownRequired === null },
        ...RENOWN_RANK_ORDER.map((rank) => ({ value: rank, labelKey: renownRankLabelKey(rank), selected: rank === fields.renownRequired })),
    ];

    return {
        renownRequiredPath: 'system.renownRequired',
        renownRequiredOptions,
        renownRequiredLabelKey: renownRequirementLabelKey(fields.renownRequired),
        renownRewardPath: 'system.renownReward',
        renownReward: fields.renownReward,
        costPath: 'system.cost',
        cost: fields.cost,
        marks:
            fields.category === 'distinction'
                ? buildReferenceList({
                      path: 'system.marks',
                      mode: 'list',
                      accept: DISTINCTION_MARK_ACCEPT,
                      stored: fields.marks,
                      resolveName,
                      emptyKey: 'WH40K.ItemSheet.Distinction.NoMarks',
                      dropKey: 'WH40K.ItemSheet.Distinction.DropMark',
                  })
                : null,
        grant:
            fields.category === 'mark'
                ? {
                      trait: buildReferenceList({
                          path: 'system.grant.trait',
                          mode: 'single',
                          accept: MARK_TRAIT_ACCEPT,
                          stored: fields.grant.trait,
                          resolveName,
                          emptyKey: 'WH40K.ItemSheet.Distinction.NoGrantTrait',
                          dropKey: 'WH40K.ItemSheet.Distinction.DropGrantTrait',
                      }),
                      activeEffectPath: 'system.grant.activeEffect',
                      activeEffectOptions: effectOptions(effects, fields.grant.activeEffect),
                      activeEffectName: effectName(effects, fields.grant.activeEffect),
                  }
                : null,
    };
}
