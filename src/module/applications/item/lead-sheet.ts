/**
 * @file LeadSheet - ApplicationV2 sheet for investigation lead items.
 *
 * Renders a single tab with the lead's state, type, source clue, and GM
 * notes. No automation — the sheet is a data shape view per issue #74.
 */

import defineSimpleItemSheet from './define-simple-item-sheet.ts';

const LeadSheet = defineSimpleItemSheet({
    className: 'LeadSheet',
    classes: ['wh40k-rpg', 'sheet', 'item', 'lead'],
    template: 'systems/wh40k-rpg/templates/item/item-lead-sheet.hbs',
    width: 520,
    height: 540,
    tabs: [],
    extraContext: {
        states: {
            'active': 'WH40K.Lead.State.Active',
            'pursued': 'WH40K.Lead.State.Pursued',
            'dead-end': 'WH40K.Lead.State.DeadEnd',
        },
        leadTypes: {
            witness: 'WH40K.Lead.Type.Witness',
            document: 'WH40K.Lead.Type.Document',
            location: 'WH40K.Lead.Type.Location',
            other: 'WH40K.Lead.Type.Other',
        },
    },
});

export default LeadSheet;
