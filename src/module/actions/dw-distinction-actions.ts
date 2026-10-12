/**
 * Deathwatch Distinction / Advanced Special Ability conferral (#171).
 *
 * Distinctions, Marks of Distinction and Advanced Special Abilities are
 * `specialAbility` items (see `rules/dw-distinction.ts`). They are conferred
 * by dropping one on a character, so the actor sheet's drop handler is where
 * the Renown-rank gate and the Renown reward apply:
 *
 *   - {@link refuseBelowRenownRank} — before the item is created, refuse a
 *     drop below the item's required Renown rank with a notification.
 *   - {@link awardConferralRenown} — after it is created, add the item's
 *     Renown reward through `awardRenown`.
 *
 * Only Deathwatch actors have Renown. For any other line, or any item that is
 * not a special ability, every function here is a no-op. The pure readers
 * ({@link readSpecialAbility}, {@link readDwRenown}, {@link conferralRefusal},
 * {@link conferralRenown}) are exported for the sheet panel and for tests.
 */

import type { WH40KBaseActor } from '../documents/base-actor.ts';
import {
    type MarkGrantSource,
    type SpecialAbilityDistinctionFields,
    awardDistinction,
    canGainSpecialAbility,
    isSpecialAbilityCategory,
} from '../rules/dw-distinction.ts';
import { type RenownRank, getRenownRank, isRenownRank, renownRankLabelKey } from '../rules/dw-renown.ts';
import { firstSystemId } from '../utils/chat-system-id.ts';

/** The actor surface the conferral rules read. */
export interface ConferralActor {
    name: string;
    system: object;
}

/** The item surface the conferral rules read. */
export interface ConferralItem {
    type: string;
    name: string;
    system: object;
}

/** A special-ability item's Distinction fields plus its Mark grant, read off the live item. */
export interface SpecialAbilityView extends Pick<SpecialAbilityDistinctionFields, 'category' | 'renownRequired' | 'renownReward' | 'cost'> {
    markGrant: MarkGrantSource;
}

/** Numeric entries of a raw characteristic-modifier map; anything non-numeric is dropped. */
function numericEntries(map: object): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(map)) {
        if (typeof value === 'number') out[key] = value;
    }
    return out;
}

/** The Mark grant half of a special ability: its trait / Active Effect and characteristic modifiers. */
function readMarkGrant(system: object): MarkGrantSource {
    const grant = 'grant' in system && typeof system.grant === 'object' && system.grant !== null ? system.grant : {};
    const modifiers = 'modifiers' in system && typeof system.modifiers === 'object' && system.modifiers !== null ? system.modifiers : {};
    const characteristics =
        'characteristics' in modifiers && typeof modifiers.characteristics === 'object' && modifiers.characteristics !== null ? modifiers.characteristics : {};
    return {
        grant: {
            trait: 'trait' in grant && typeof grant.trait === 'string' ? grant.trait : '',
            activeEffect: 'activeEffect' in grant && typeof grant.activeEffect === 'string' ? grant.activeEffect : '',
        },
        modifiers: { characteristics: numericEntries(characteristics) },
    };
}

/**
 * The Distinction fields of a `specialAbility` item, or `null` when the item is
 * some other type or its category is unreadable.
 */
export function readSpecialAbility(item: ConferralItem): SpecialAbilityView | null {
    if (item.type !== 'specialAbility') return null;
    const system = item.system;
    const category = 'category' in system && typeof system.category === 'string' ? system.category : '';
    if (!isSpecialAbilityCategory(category)) return null;
    const rank = 'renownRequired' in system && typeof system.renownRequired === 'string' ? system.renownRequired : null;
    return {
        category,
        renownRequired: isRenownRank(rank) ? rank : null,
        renownReward: 'renownReward' in system && typeof system.renownReward === 'number' ? system.renownReward : 0,
        cost: 'cost' in system && typeof system.cost === 'number' ? system.cost : 0,
        markGrant: readMarkGrant(system),
    };
}

/** The actor's Renown score when it is a Deathwatch actor that tracks Renown, else `null`. */
export function readDwRenown(actor: ConferralActor): number | null {
    if (firstSystemId(actor) !== 'dw') return null;
    const system = actor.system;
    return 'renown' in system && typeof system.renown === 'number' ? system.renown : null;
}

/** Why a conferral was refused: the rank the item needs and the rank the actor holds. */
export interface ConferralRefusal {
    requiredRank: RenownRank;
    currentRank: RenownRank;
}

/** Whether conferring `item` on `actor` breaks the Renown-rank gate; `null` when it may proceed. */
export function conferralRefusal(actor: ConferralActor, item: ConferralItem): ConferralRefusal | null {
    const renown = readDwRenown(actor);
    const ability = readSpecialAbility(item);
    if (renown === null || ability === null) return null;
    const currentRank = getRenownRank(renown);
    const gate = canGainSpecialAbility({ ability, actorRenownRank: currentRank });
    return gate.allowed ? null : { requiredRank: gate.requiredRank, currentRank };
}

/** The actor's Renown after conferring `item`, or `null` when no Renown change applies. */
export function conferralRenown(actor: ConferralActor, item: ConferralItem): number | null {
    const renown = readDwRenown(actor);
    const ability = readSpecialAbility(item);
    if (renown === null || ability === null) return null;
    const award = awardDistinction({ ability, currentRenown: renown });
    return award.changed ? award.newRenown : null;
}

/**
 * Refuse a conferral below the item's required Renown rank. Warns the user and
 * returns `true` when refused; returns `false` (and does nothing) otherwise.
 */
export function refuseBelowRenownRank(actor: ConferralActor, item: ConferralItem): boolean {
    const refusal = conferralRefusal(actor, item);
    if (refusal === null) return false;
    ui.notifications.warn(
        game.i18n.format('WH40K.DW.Distinction.Gate.RankTooLow', {
            name: item.name,
            actor: actor.name,
            rank: game.i18n.localize(renownRankLabelKey(refusal.requiredRank)),
            current: game.i18n.localize(renownRankLabelKey(refusal.currentRank)),
        }),
    );
    return true;
}

/** The actor surface {@link awardConferralRenown} writes through. */
export interface RenownWritableActor extends ConferralActor {
    update: (diff: { 'system.renown': number }) => Promise<WH40KBaseActor | undefined>;
}

/** Apply the conferred item's Renown reward to the actor, announcing the award. */
export async function awardConferralRenown(actor: RenownWritableActor, item: ConferralItem): Promise<void> {
    const before = readDwRenown(actor);
    const after = conferralRenown(actor, item);
    if (before === null || after === null) return;
    await actor.update({ 'system.renown': after });
    ui.notifications.info(game.i18n.format('WH40K.DW.Distinction.Award.Renown', { name: item.name, actor: actor.name, amount: String(after - before) }));
}
