/**
 * @file DarkPactSheet — sheet for Dark Pact items (a DH2 supplement, #84).
 *
 * Shows the terms of striking the pact and its Boons and Banes, each with the
 * mechanics the system applies when the GM gives it to a character. The content
 * is compendium data; the freeform gate allows editing the name and description.
 */

import { isDarkPactItem } from '../../documents/dark-pacts.ts';
import { darkPactSheetView } from './dark-pact-view.ts';
import defineSimpleItemSheet from './define-simple-item-sheet.ts';
import FreeformGatedItemSheet from './freeform-gated-item-sheet.ts';

/** Sheet for darkPact items. */
const DarkPactSheet = defineSimpleItemSheet({
    className: 'DarkPactSheet',
    baseClass: FreeformGatedItemSheet,
    classes: ['wh40k-rpg', 'sheet', 'item', 'dark-pact'],
    template: 'systems/wh40k-rpg/templates/item/item-dark-pact-sheet.hbs',
    width: 560,
    height: 680,
    partOverrides: { scrollable: ['.wh40k-tab-content'] },
    prepareContext: (sheet, context) => {
        if (isDarkPactItem(sheet.item)) context['pact'] = darkPactSheetView(sheet.item.system);
    },
});

export default DarkPactSheet;
