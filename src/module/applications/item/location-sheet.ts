/**
 * @file LocationSheet - ApplicationV2 sheet for location items.
 *
 * Locations are structured places in the setting (sector / system / planet /
 * settlement / site / …). The sheet exposes their queryable metadata
 * (type, parent, region/sector, coordinates, controlling faction, population,
 * tags) plus per-line lore and home-world rules.
 */

import LocationData from '../../data/item/location.ts';
import defineSimpleItemSheet from './define-simple-item-sheet.ts';

/** Build the `{ slug: Label }` map for the location-type selector. */
function locationTypeChoices(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const slug of LocationData.locationTypes) {
        const key = `WH40K.Location.Type.${slug.capitalize()}`;
        out[slug] = game.i18n.has(key) ? game.i18n.localize(key) : slug.capitalize();
    }
    return out;
}

/**
 * Sheet for location items.
 */
const LocationSheet = defineSimpleItemSheet({
    className: 'LocationSheet',
    classes: ['wh40k-rpg', 'sheet', 'item', 'location'],
    template: 'systems/wh40k-rpg/templates/item/item-location-sheet.hbs',
    width: 600,
    height: 700,
    tabs: [
        { tab: 'details', group: 'primary', label: 'Details' },
        { tab: 'description', group: 'primary', label: 'Description' },
        { tab: 'effects', group: 'primary', label: 'Effects' },
    ],
    defaultTab: 'details',
    prepareContext: (_sheet, context) => {
        context['locationTypes'] = locationTypeChoices();
    },
});

export default LocationSheet;
