/**
 * @file MalignancySheet — sheet for malignancy content items.
 *
 * Uses the shared `item-content-block-sheet.hbs` template and the freeform-gated
 * base so editing is read-only unless the Freeform Character Editing setting is
 * on. See issue #221.
 */

import defineSimpleItemSheet from './define-simple-item-sheet.ts';
import FreeformGatedItemSheet from './freeform-gated-item-sheet.ts';

interface MalignancySystem {
    effect?: string;
}

/** Sheet for malignancy items. */
const MalignancySheet = defineSimpleItemSheet({
    className: 'MalignancySheet',
    baseClass: FreeformGatedItemSheet,
    classes: ['wh40k-rpg', 'sheet', 'item', 'malignancy'],
    template: 'systems/wh40k-rpg/templates/item/item-content-block-sheet.hbs',
    width: 560,
    height: 640,
    prepareContext: (sheet, context) => {
        const system = sheet.item.system as MalignancySystem;
        context['contentFields'] = [{ name: 'system.effect', labelKey: 'WH40K.Malignancy.Effect', value: system.effect ?? '' }];
        context['contentScalars'] = [];
    },
});

export default MalignancySheet;
