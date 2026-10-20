/**
 * @file MedalSheet — sheet for Only War Medals and Honours (core pp. 294–295, content#32).
 *
 * Uses the shared `item-content-block-sheet.hbs` template: the medal's
 * description, what it is Awarded For, its Squad Bonus, and its type.
 */

import { MEDAL_HONOUR_TYPES } from '../../rules/ow-regimental-award.ts';
import { capitalize } from '../../utils/format.ts';
import defineSimpleItemSheet from './define-simple-item-sheet.ts';
import FreeformGatedItemSheet from './freeform-gated-item-sheet.ts';

interface MedalSystem {
    honourType?: string;
    awardedFor?: string;
    squadBonus?: string;
}

/** Sheet for medal items. */
const MedalSheet = defineSimpleItemSheet({
    className: 'MedalSheet',
    baseClass: FreeformGatedItemSheet,
    classes: ['wh40k-rpg', 'sheet', 'item', 'medal'],
    template: 'systems/wh40k-rpg/templates/item/item-content-block-sheet.hbs',
    width: 560,
    height: 600,
    prepareContext: (sheet, context) => {
        const system = sheet.item.system as MedalSystem;
        context['contentFields'] = [
            { name: 'system.awardedFor', labelKey: 'WH40K.Medal.AwardedFor', value: system.awardedFor ?? '' },
            { name: 'system.squadBonus', labelKey: 'WH40K.Medal.SquadBonus', value: system.squadBonus ?? '' },
        ];
        context['contentScalars'] = [
            {
                kind: 'select',
                name: 'system.honourType',
                labelKey: 'WH40K.Medal.HonourType',
                value: system.honourType ?? '',
                options: MEDAL_HONOUR_TYPES.map((type) => ({
                    value: type,
                    labelKey: `WH40K.Medal.Honour.${capitalize(type)}`,
                    selected: type === system.honourType,
                })),
            },
        ];
    },
});

export default MedalSheet;
