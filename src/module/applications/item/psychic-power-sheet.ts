/**
 * @file PsychicPowerSheet - ApplicationV2 sheet for psychic power items
 */

import type { DropData } from '../../managers/actor-journal-link.ts';
import { attackSpecialItemFromQuality } from '../../rules/attack-specials.ts';
import ContainerItemSheet from './container-item-sheet.ts';
import defineSimpleItemSheet from './define-simple-item-sheet.ts';
import { itemUuidFromDropData } from './reference-list-edits.ts';

/** A dropped weapon quality's fields the attack-special conversion reads. */
interface DroppedQuality {
    type: string;
    name: string;
    system: { identifier: string; level: number | null };
}

function isDroppedQuality(doc: Awaited<ReturnType<typeof fromUuid>>): doc is Awaited<ReturnType<typeof fromUuid>> & DroppedQuality {
    return doc instanceof Item && doc.type === 'weaponQuality';
}

/**
 * The psychic power's Attack Specials are nested items, held through the container
 * sheet (#697): a dropped attack special nests as it is (PsychicPowerData declares
 * `containerTypes`), and the container's `nestedItemDelete` removes one.
 */
const PsychicPowerSheetBase = defineSimpleItemSheet({
    className: 'PsychicPowerSheetBase',
    baseClass: ContainerItemSheet,
    classes: ['wh40k-rpg', 'sheet', 'item', 'psychic-power'],
    template: 'systems/wh40k-rpg/templates/item/item-psychic-power-sheet.hbs',
    width: 550,
    height: 500,
    // The tabs the template's strip renders (#638): a default naming a tab the template lacks hid every panel.
    tabs: [
        { tab: 'power', group: 'primary', label: 'WH40K.ItemSheet.PsychicPower.PowerTab' },
        { tab: 'damage', group: 'primary', label: 'WH40K.Weapon.Damage' },
        { tab: 'description', group: 'primary', label: 'WH40K.Tabs.Description' },
        { tab: 'effects', group: 'primary', label: 'WH40K.Tabs.Effects' },
    ],
    defaultTab: 'power',
});

/** Sheet for psychic power items. */
export default class PsychicPowerSheet extends PsychicPowerSheetBase {
    /**
     * A dropped weapon quality becomes the attack special it names (Toxic (2) → the
     * Toxic special at level 2). A quality with no attack special is refused with a
     * notice. Every other drop takes the container's path.
     */
    override async _onDrop(event: DragEvent): Promise<boolean> {
        const data: DropData = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
        const uuid = itemUuidFromDropData(data);
        if (uuid === null) return super._onDrop(event);
        const dropped = await fromUuid(uuid);
        if (!isDroppedQuality(dropped)) return super._onDrop(event);

        event.preventDefault();
        event.stopPropagation();
        const special = attackSpecialItemFromQuality(dropped.system);
        if (special === null) {
            ui.notifications.warn(game.i18n.format('WH40K.ItemSheet.PsychicPower.QualityHasNoSpecial', { name: dropped.name }));
            return false;
        }
        await this.item.createNestedDocuments([{ ...special }]);
        return false;
    }
}
