/**
 * @file MutationSheet — sheet for mutation content items.
 *
 * Uses the shared `item-content-block-sheet.hbs` template and the freeform-gated
 * base so editing is read-only unless the Freeform Character Editing setting is
 * on. See issue #221.
 *
 * A mutation whose category is `gift` (a Black Crusade Gift of the Gods, #180)
 * additionally renders the Gift panel (#597): base grants, alignment riders,
 * sub-table and acquisition rolls. Every other mutation gets no `giftPanel`
 * context and renders exactly as before.
 */

import { WH40K } from '../../config.ts';
import type MutationData from '../../data/item/mutation.ts';
import { MUTATION_CATEGORIES } from '../../rules/mutation-categories.ts';
import type { WH40KItemDocument } from '../../types/global.d.ts';
import type BaseItemSheet from './base-item-sheet.ts';
import defineSimpleItemSheet from './define-simple-item-sheet.ts';
import { buildGiftPanelContext, newCharacteristicRoll, newGiftRider, nextRiderAlignment, showsGiftPanel } from './mutation-gift-panel.ts';
import ReferenceListItemSheet, { embeddedEffectChoices, resolveReferenceName, updateSystemPath } from './reference-list-item-sheet.ts';

/** The mutation item a MutationSheet renders. */
type MutationItem = WH40KItemDocument & { system: MutationData };

/** The sheet's item, narrowed to the mutation DataModel this sheet is registered for. */
function mutationItem(sheet: BaseItemSheet): MutationItem {
    return sheet.item as MutationItem;
}

/** Append a rider for the first alignment that has none yet. */
async function addGiftRider(this: BaseItemSheet): Promise<void> {
    const alignment = nextRiderAlignment(mutationItem(this).system.gift.riders);
    if (alignment === null || !this.inEditMode) return;
    await updateSystemPath(this, 'system.gift.riders', (current) => [...(Array.isArray(current) ? current : []), newGiftRider(alignment)]);
}

/** Append an acquisition roll on the first characteristic. */
async function addGiftCharacteristicRoll(this: BaseItemSheet): Promise<void> {
    const roll = newCharacteristicRoll(Object.keys(WH40K.characteristics));
    if (roll === null || !this.inEditMode) return;
    await updateSystemPath(this, 'system.gift.characteristicRolls', (current) => [...(Array.isArray(current) ? current : []), roll]);
}

/** Sheet for mutation items. */
const MutationSheet = defineSimpleItemSheet({
    className: 'MutationSheet',
    baseClass: ReferenceListItemSheet,
    classes: ['wh40k-rpg', 'sheet', 'item', 'mutation'],
    template: 'systems/wh40k-rpg/templates/item/item-content-block-sheet.hbs',
    width: 560,
    height: 640,
    actions: { addGiftRider, addGiftCharacteristicRoll },
    prepareContext: (sheet, context) => {
        const { system } = mutationItem(sheet);
        const { category } = system;
        context['contentFields'] = [
            { name: 'system.effect', labelKey: 'WH40K.Mutation.Effect', value: system.effect },
            { name: 'system.drawback', labelKey: 'WH40K.Mutation.Drawback', value: system.drawback },
        ];
        context['contentScalars'] = [
            {
                kind: 'select',
                name: 'system.category',
                labelKey: 'WH40K.Mutation.Category',
                value: category,
                options: MUTATION_CATEGORIES.map((c) => ({ value: c, labelKey: `WH40K.MutationCategory.${c.capitalize()}`, selected: c === category })),
            },
            {
                kind: 'checkbox',
                name: 'system.visible',
                labelKey: 'WH40K.Mutation.Visible',
                checked: system.visible,
            },
        ];
        if (showsGiftPanel(category)) {
            context['giftPanel'] = buildGiftPanelContext({
                gift: system.gift,
                characteristics: WH40K.characteristics,
                effects: embeddedEffectChoices(sheet),
                resolveName: resolveReferenceName,
            });
        }
    },
});

export default MutationSheet;
