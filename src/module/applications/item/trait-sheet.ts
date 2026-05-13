/**
 * @file TraitSheet - ApplicationV2 sheet for trait items
 */

import BaseItemSheet from './base-item-sheet.ts';

/** Tab label localization keys, hoisted so the static TABS entries reference identifiers. */
const TAB_LABEL_PROPERTIES = 'WH40K.Tabs.Properties';
const TAB_LABEL_EFFECTS = 'WH40K.Tabs.Effects';
const TAB_LABEL_DESCRIPTION = 'WH40K.Tabs.Description';

/**
 * Sheet for trait items.
 */
// @ts-expect-error - TS2417 static side inheritance
export default class TraitSheet extends BaseItemSheet {
    /** @override */
    static override DEFAULT_OPTIONS = {
        classes: ['wh40k-rpg', 'sheet', 'item', 'trait'],
        position: {
            width: 600,
            height: 720,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override PARTS = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/item/item-trait-sheet.hbs',
            scrollable: ['.wh40k-tab-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override TABS = [
        { tab: 'properties', group: 'primary', label: TAB_LABEL_PROPERTIES },
        { tab: 'effects', group: 'primary', label: TAB_LABEL_EFFECTS },
        { tab: 'description', group: 'primary', label: TAB_LABEL_DESCRIPTION },
    ];

    /* -------------------------------------------- */

    /** @override */
    override tabGroups = {
        primary: 'properties',
    };
}
