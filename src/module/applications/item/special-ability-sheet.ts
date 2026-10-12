/**
 * @file SpecialAbilitySheet — sheet for specialAbility content items.
 *
 * Uses the shared `item-content-block-sheet.hbs` template and the freeform-gated
 * base so editing is read-only unless the Freeform Character Editing setting is
 * on. See issue #221.
 *
 * The Deathwatch Distinction fields (#171) are edited here too (#597): the
 * category select always renders; the Renown gate / reward, XP cost, a
 * Distinction's Marks and a Mark's grant render only for the Renown categories
 * (see {@link buildDistinctionPanelContext}).
 */

import type SpecialAbilityData from '../../data/item/special-ability.ts';
import type { WH40KItemDocument } from '../../types/global.d.ts';
import type BaseItemSheet from './base-item-sheet.ts';
import defineSimpleItemSheet from './define-simple-item-sheet.ts';
import ReferenceListItemSheet, { embeddedEffectChoices, resolveReferenceName } from './reference-list-item-sheet.ts';
import { buildCategoryScalar, buildDistinctionPanelContext } from './special-ability-distinction-panel.ts';

/** The special-ability item a SpecialAbilitySheet renders. */
type SpecialAbilityItem = WH40KItemDocument & { system: SpecialAbilityData };

/** The sheet's item, narrowed to the special-ability DataModel this sheet is registered for. */
function specialAbilityItem(sheet: BaseItemSheet): SpecialAbilityItem {
    return sheet.item as SpecialAbilityItem;
}

/** Sheet for special-ability items. */
const SpecialAbilitySheet = defineSimpleItemSheet({
    className: 'SpecialAbilitySheet',
    baseClass: ReferenceListItemSheet,
    classes: ['wh40k-rpg', 'sheet', 'item', 'specialAbility'],
    template: 'systems/wh40k-rpg/templates/item/item-content-block-sheet.hbs',
    width: 560,
    height: 640,
    prepareContext: (sheet, context) => {
        const { system } = specialAbilityItem(sheet);
        context['contentFields'] = [{ name: 'system.benefit', labelKey: 'WH40K.SpecialAbility.Benefit', value: system.benefit }];
        context['contentScalars'] = [buildCategoryScalar(system.category)];
        const panel = buildDistinctionPanelContext({
            fields: system,
            effects: embeddedEffectChoices(sheet),
            resolveName: resolveReferenceName,
        });
        if (panel !== null) context['distinctionPanel'] = panel;
    },
});

export default SpecialAbilitySheet;
