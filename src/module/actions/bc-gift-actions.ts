/**
 * Black Crusade Gifts of the Gods action handlers (#180).
 *
 * Several Gifts change a characteristic by a dice amount the recipient rolls
 * once, when the Gift is gained ("permanently reduce Intelligence by
 * 1d10+5"). The Gift item declares those rolls as data
 * (`system.gift.characteristicRolls`); `bcRollGiftCharacteristic` rolls one
 * of them, posts the roll to chat (the formula and dice are on the card), and
 * stores the signed result on the owned Gift's `modifiers.characteristics` —
 * the ModifiersTemplate channel the actor's data prep already folds into the
 * characteristic with the Gift as its source.
 *
 * Registered in the character sheet's `DEFAULT_OPTIONS.actions`; invoked with
 * `this` bound to the sheet. No-op for non-BC actors.
 */

import { labelOf } from '../applications/actor/bc-gifts-panel-context.ts';
import type { WH40KBaseActor } from '../documents/base-actor.ts';
import { isGiftItem, pendingGiftRolls, signedGiftRoll } from '../rules/bc-gifts.ts';
import { isActorOnLine, type LineBearer } from './actor-line-gate.ts';

/** Minimum surface the handler reads off the bound sheet. */
interface BcGiftSheetLike {
    readonly actor: WH40KBaseActor & { readonly system: LineBearer['system'] };
}

/**
 * `data-action="bcRollGiftCharacteristic"` handler. The clicked element
 * carries `data-item-id` (the owned Gift) and `data-characteristic` (which of
 * its pending rolls to make). A roll that is no longer pending (already made,
 * or the Gift was edited) is ignored, so a double click cannot roll twice.
 */
export async function bcRollGiftCharacteristic(this: BcGiftSheetLike, _event: Event, target: HTMLElement): Promise<void> {
    // The actor's own line, like every BC action (#596).
    if (!isActorOnLine(this.actor, 'bc')) return;
    const { itemId, characteristic } = target.dataset;
    if (itemId === undefined || characteristic === undefined) return;

    const item = this.actor.items.get(itemId);
    if (item === undefined || !isGiftItem(item)) return;
    const { system } = item;

    const pending = pendingGiftRolls(system.gift, system.modifiers.characteristics).find((entry) => entry.characteristic === characteristic);
    if (pending === undefined) return;

    const roll = await new Roll(pending.formula).evaluate();
    const value = signedGiftRoll(pending, roll.total);

    const label = labelOf(this.actor.system.characteristics, characteristic);
    await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: game.i18n.format('WH40K.BC.Gifts.RollFlavor', {
            gift: item.name,
            characteristic: game.i18n.localize(label),
            direction: game.i18n.localize(pending.direction === 'loss' ? 'WH40K.BC.Gifts.Direction.Loss' : 'WH40K.BC.Gifts.Direction.Gain'),
        }),
    });
    await item.update({ [`system.modifiers.characteristics.${characteristic}`]: value });
}
