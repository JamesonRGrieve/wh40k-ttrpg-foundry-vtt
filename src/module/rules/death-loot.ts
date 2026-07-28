/**
 * Death → lootable pile conversion (#477).
 *
 * Post-combat looting was a manual GM chore: open the dead NPC's sheet, build a
 * container, drag equipment across, hide the body. This converts a body into an
 * Item Piles pile automatically, keyed off the **`dead` status** that #495
 * introduced — so every route to death (damage, fatigue, or a GM toggling the
 * token icon) converts identically, instead of each needing its own hook.
 *
 * Item references stay compendium-linked: the pile receives each item's source
 * object, which for a lean pack item is its join key plus per-actor overlay —
 * the canonical body is never deep-copied (`src/packs/CLAUDE.md`).
 *
 * Content-agnostic and line-agnostic: nothing here names an item, a line or an
 * actor type beyond the creature/non-creature split, so it works identically
 * across all seven game lines.
 */

import { DEAD_STATUS_ID, SYSTEM_ID } from '../constants.ts';
import { dropItemAsItemPile } from '../integrations/item-piles.ts';

/** Item types that are never loot: intrinsic capability, not carried gear. */
const NON_LOOTABLE_TYPES: ReadonlySet<string> = new Set(['talent', 'trait', 'skill', 'psychicPower', 'origin', 'malignancy', 'mutation', 'disorder']);

/** Minimal owned-item surface the conversion reads (Foundry boundary). */
export interface LootableItem {
    name: string;
    type: string;
    system?: { bound?: boolean; grantedByDefault?: boolean; quantity?: number };
    toObject?: () => object;
}

/**
 * The items a body should yield: carried gear only.
 *
 * Excludes intrinsic item types (talents, traits, skills, powers — capabilities,
 * not possessions) and anything `bound` / `grantedByDefault` (the Unarmed strike
 * and friends from #228/#390, which are the system's fallback, not loot).
 * Pure, so the policy is unit-testable without a world.
 * @param {readonly LootableItem[]} items  The dead actor's owned items.
 * @returns {LootableItem[]}  The subset that transfers to the pile.
 */
export function selectLootableItems(items: readonly LootableItem[]): LootableItem[] {
    return items.filter((item) => {
        if (NON_LOOTABLE_TYPES.has(item.type)) return false;
        if (item.system?.bound === true) return false;
        if (item.system?.grantedByDefault === true) return false;
        return true;
    });
}

/** Minimal actor surface the conversion reads (Foundry boundary). */
export interface LootableActor {
    id?: string | null;
    name?: string | null;
    type: string;
    items: Iterable<LootableItem>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `actor.statuses` is a Set of status ids
    statuses?: ReadonlySet<string>;
    /* eslint-disable-next-line no-restricted-syntax -- boundary: `Document#getFlag` is typed by Foundry as returning unknown; the `=== true` comparison at the call site is the narrowing */
    getFlag: (scope: string, key: string) => unknown;
    /* eslint-disable-next-line no-restricted-syntax -- boundary: `Document#setFlag` accepts and resolves to Foundry's untyped flag value */
    setFlag: (scope: string, key: string, value: unknown) => Promise<unknown>;
}

/** Minimal token surface the conversion reads (Foundry boundary). */
export interface LootableToken {
    x: number;
    y: number;
    parent?: { id?: string | null } | null;
}

/**
 * Has this body already been converted? The flag makes the conversion
 * idempotent, so re-applying `dead` (GM undo → re-kill, a re-render, a second
 * client's hook) can never spawn a second pile.
 * @param {LootableActor} actor  The dead actor.
 * @returns {boolean}  True when a pile was already produced for this body.
 */
function alreadyLooted(actor: LootableActor): boolean {
    return actor.getFlag(SYSTEM_ID, 'deathLooted') === true;
}

/**
 * Convert a dead body into a lootable pile at its token's position.
 *
 * Preconditions (all silent no-ops, never throws — a failed conversion must not
 * break combat): the actor carries the `dead` status, has not already been
 * converted, and has something lootable.
 *
 * Clearing `dead` does NOT un-convert: the pile is a real object the party may
 * already have looted, so reversing it would destroy player-visible state. The
 * `deathLooted` flag stays set, so a revived-then-re-killed actor does not drop
 * a second copy of gear it no longer has.
 * @param {LootableActor} actor  The actor that just died.
 * @param {LootableToken | null} token  Its placed token, for the pile position.
 * @param {boolean} enabled  The world setting — GM opt-out.
 * @returns {Promise<boolean>}  True when a pile was created.
 */
export async function convertDeadActorToPile(actor: LootableActor, token: LootableToken | null, enabled: boolean): Promise<boolean> {
    try {
        if (!enabled) return false;
        if (token === null) return false;
        if (actor.statuses?.has(DEAD_STATUS_ID) !== true) return false;
        if (alreadyLooted(actor)) return false;

        const lootable = selectLootableItems([...actor.items]);
        if (lootable.length === 0) return false;

        const payload = lootable.map((item) => item.toObject?.() ?? item).filter((data): data is object => typeof data === 'object');
        if (payload.length === 0) return false;

        // Mark BEFORE the async pile creation: two clients (or a re-entrant
        // refresh) reaching here together would otherwise both pass the
        // `alreadyLooted` gate and create two piles.
        await actor.setFlag(SYSTEM_ID, 'deathLooted', true);

        let created = 0;
        for (const data of payload) {
            // eslint-disable-next-line no-await-in-loop -- sequential: Item Piles' createItemPile races itself when called concurrently (#405)
            const ok = await dropItemAsItemPile(data, { x: token.x, y: token.y }, token.parent?.id ?? undefined);
            if (ok) created += 1;
        }

        if (created === 0) {
            // Item Piles absent or refused every item — release the flag so a
            // later attempt (module enabled mid-session) can still convert.
            await actor.setFlag(SYSTEM_ID, 'deathLooted', false);
            return false;
        }
        return true;
    } catch (error) {
        console.error(`${SYSTEM_ID} | death-loot: failed converting ${actor.name ?? actor.type} to a pile`, error);
        return false;
    }
}
