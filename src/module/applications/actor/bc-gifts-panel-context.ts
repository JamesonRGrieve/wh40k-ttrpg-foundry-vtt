/**
 * Render context for the Black Crusade Gifts of the Gods panel (#180).
 *
 * Pure shaping: takes the actor's Gift items (mutations with category
 * `gift`), resolves each against the actor's Chaos Alignment with
 * {@link resolveGiftForAlignment}, and lays the result out for
 * `templates/actor/panel/bc-gifts-panel.hbs`. Labels and granted-item names
 * are looked up through the callbacks the sheet passes, so this module needs
 * no Foundry globals and is unit-testable as is.
 */

import type { ChaosAlignment } from '../../config/game-systems/types.ts';
import {
    giftDefFromMutation,
    mergeGiftDeltas,
    pendingGiftRolls,
    resolveGiftForAlignment,
    type GiftMutationLike,
    type GiftSubTable,
} from '../../rules/bc-gifts.ts';

/** One signed change, labelled for display. */
interface DeltaEntry {
    key: string;
    label: string;
    value: number;
}

/** An acquisition roll the holder has not made yet. */
interface PendingRollEntry {
    characteristic: string;
    label: string;
    formula: string;
    directionKey: string;
}

/** One Gift row of the panel. */
export interface GiftPanelEntry {
    id: string;
    name: string;
    img: string;
    /** HTML of the base effect (compendium-authored rules text). */
    baseDescription: string;
    /** HTML of the applied rider; `''` when none applies. */
    riderDescription: string;
    appliedAlignment: ChaosAlignment;
    /** Langpack key of the sub-table prompt; `''` when the Gift has none. */
    subTableKey: string;
    characteristicDelta: DeltaEntry[];
    skillDelta: DeltaEntry[];
    /** Display names of the traits / talents the Gift grants. */
    grants: string[];
    pendingRolls: PendingRollEntry[];
}

/** The panel's render context (`giftsPanel`). */
export interface BcGiftsPanelContext {
    currentAlignment: ChaosAlignment;
    gifts: GiftPanelEntry[];
    /** Characteristic changes summed across every Gift, for the current alignment. */
    mergedDelta: DeltaEntry[];
}

/** An owned Gift item as the panel reads it. */
export interface GiftPanelItem extends GiftMutationLike {
    img: string | null;
}

/** What the panel needs besides the items. */
export interface BcGiftsPanelInput {
    alignment: ChaosAlignment;
    items: readonly GiftPanelItem[];
    characteristicLabel: (key: string) => string;
    skillLabel: (key: string) => string;
    grantName: (uuid: string) => string;
}

/**
 * The `label` of a keyed actor entry (a characteristic or skill), or the key
 * itself when the actor has no such entry — a Gift may name a key this line's
 * actor lacks.
 */
export function labelOf(entries: Readonly<Record<string, { readonly label?: string | undefined }>>, key: string): string {
    return new Map(Object.entries(entries)).get(key)?.label ?? key;
}

const SUB_TABLE_KEYS: Record<GiftSubTable, string> = {
    '': '',
    'limb': 'WH40K.BC.Gifts.SubTable.Limb',
    'animal': 'WH40K.BC.Gifts.SubTable.Animal',
};

const DIRECTION_KEYS = { gain: 'WH40K.BC.Gifts.Direction.Gain', loss: 'WH40K.BC.Gifts.Direction.Loss' } as const;

/** Non-zero entries of a delta map, labelled. */
function deltaEntries(delta: Readonly<Record<string, number>>, label: (key: string) => string): DeltaEntry[] {
    return Object.entries(delta)
        .filter(([, value]) => value !== 0)
        .map(([key, value]) => ({ key, label: label(key), value }));
}

/** Build the Gifts panel context. */
export function buildBcGiftsPanel(input: BcGiftsPanelInput): BcGiftsPanelContext {
    const resolvedGifts = input.items.map((item) => ({ item, resolved: resolveGiftForAlignment(giftDefFromMutation(item), input.alignment) }));
    const gifts = resolvedGifts.map(({ item, resolved }): GiftPanelEntry => {
        const { gift, modifiers } = item.system;
        return {
            id: resolved.id,
            name: resolved.name,
            img: item.img ?? '',
            baseDescription: resolved.baseDescription,
            riderDescription: resolved.riderDescription,
            appliedAlignment: resolved.appliedAlignment,
            subTableKey: SUB_TABLE_KEYS[gift.subTable],
            characteristicDelta: deltaEntries(resolved.characteristicDelta, input.characteristicLabel),
            skillDelta: deltaEntries(resolved.skillDelta, input.skillLabel),
            grants: resolved.grants.map(input.grantName),
            pendingRolls: pendingGiftRolls(gift, modifiers.characteristics).map((roll) => ({
                characteristic: roll.characteristic,
                label: input.characteristicLabel(roll.characteristic),
                formula: roll.formula,
                directionKey: DIRECTION_KEYS[roll.direction],
            })),
        };
    });
    return {
        currentAlignment: input.alignment,
        gifts,
        mergedDelta: deltaEntries(mergeGiftDeltas(resolvedGifts.map(({ resolved }) => resolved.characteristicDelta)), input.characteristicLabel),
    };
}
