/**
 * @file LeadSheet - ApplicationV2 sheet for investigation lead items.
 *
 * Renders a single tab with the lead's state, type, source clue, and GM
 * notes. No automation — the sheet is a data shape view per issue #74.
 */

import { leadStatusSelectOptions } from '../../config/lead-status.ts';
import defineSimpleItemSheet from './define-simple-item-sheet.ts';

const LeadSheet = defineSimpleItemSheet({
    className: 'LeadSheet',
    classes: ['wh40k-rpg', 'sheet', 'item', 'lead'],
    template: 'systems/wh40k-rpg/templates/item/item-lead-sheet.hbs',
    width: 520,
    height: 540,
    tabs: [],
    extraContext: {
        // State dropdown options derive from the shared lead-status registry so
        // appending a status there extends the sheet without editing it.
        states: leadStatusSelectOptions(),
        leadTypes: {
            witness: 'WH40K.Lead.Type.Witness',
            document: 'WH40K.Lead.Type.Document',
            location: 'WH40K.Lead.Type.Location',
            other: 'WH40K.Lead.Type.Other',
        },
    },
});

export default LeadSheet;
