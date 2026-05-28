/**
 * @file SpecialAbilitySheet — sheet for specialAbility content items.
 *
 * Uses the shared `item-content-block-sheet.hbs` template and the freeform-gated
 * base so editing is read-only unless the Freeform Character Editing setting is
 * on. See issue #221.
 */

import defineSimpleItemSheet from './define-simple-item-sheet.ts';
import FreeformGatedItemSheet from './freeform-gated-item-sheet.ts';

interface SpecialAbilitySystem {
    benefit?: string;
}

/** Sheet for special-ability items. */
const SpecialAbilitySheet = defineSimpleItemSheet({
    className: 'SpecialAbilitySheet',
    baseClass: FreeformGatedItemSheet,
    classes: ['wh40k-rpg', 'sheet', 'item', 'specialAbility'],
    template: 'systems/wh40k-rpg/templates/item/item-content-block-sheet.hbs',
    width: 560,
    height: 640,
    prepareContext: (sheet, context) => {
        const system = sheet.item.system as SpecialAbilitySystem;
        context['contentFields'] = [{ name: 'system.benefit', labelKey: 'WH40K.SpecialAbility.Benefit', value: system.benefit ?? '' }];
        context['contentScalars'] = [];
    },
});

export default SpecialAbilitySheet;
