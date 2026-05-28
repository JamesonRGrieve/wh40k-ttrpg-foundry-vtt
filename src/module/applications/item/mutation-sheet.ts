/**
 * @file MutationSheet — sheet for mutation content items.
 *
 * Uses the shared `item-content-block-sheet.hbs` template and the freeform-gated
 * base so editing is read-only unless the Freeform Character Editing setting is
 * on. See issue #221.
 */

import defineSimpleItemSheet from './define-simple-item-sheet.ts';
import FreeformGatedItemSheet from './freeform-gated-item-sheet.ts';

interface MutationSystem {
    category?: string;
    effect?: string;
    drawback?: string;
    visible?: boolean;
}

/** Category choices, mirrored from {@link MutationData.defineSchema}. */
const CATEGORY_CHOICES = ['minor', 'major', 'malignancy'] as const;

/** Sheet for mutation items. */
const MutationSheet = defineSimpleItemSheet({
    className: 'MutationSheet',
    baseClass: FreeformGatedItemSheet,
    classes: ['wh40k-rpg', 'sheet', 'item', 'mutation'],
    template: 'systems/wh40k-rpg/templates/item/item-content-block-sheet.hbs',
    width: 560,
    height: 640,
    prepareContext: (sheet, context) => {
        const system = sheet.item.system as MutationSystem;
        const category = system.category ?? 'minor';
        context['contentFields'] = [
            { name: 'system.effect', labelKey: 'WH40K.Mutation.Effect', value: system.effect ?? '' },
            { name: 'system.drawback', labelKey: 'WH40K.Mutation.Drawback', value: system.drawback ?? '' },
        ];
        context['contentScalars'] = [
            {
                kind: 'select',
                name: 'system.category',
                labelKey: 'WH40K.Mutation.Category',
                value: category,
                options: CATEGORY_CHOICES.map((c) => ({ value: c, labelKey: `WH40K.MutationCategory.${c.capitalize()}`, selected: c === category })),
            },
            {
                kind: 'checkbox',
                name: 'system.visible',
                labelKey: 'WH40K.Mutation.Visible',
                checked: system.visible === true,
            },
        ];
    },
});

export default MutationSheet;
