/**
 * Manacles — DH errata p. 176.
 *
 * "A character bound with manacles suffers a –40 penalty to all
 *  Ballistic and Weapon Skill checks."
 *
 * This is modelled as the tracked `manacled` condition Active Effect
 * (see `src/module/rules/active-effects.ts`). The condition writes
 * `system.characteristics.ballisticSkill.modifier -40` and
 * `system.characteristics.weaponSkill.modifier -40`, which compose
 * naturally with every existing characteristic-modifier accumulator
 * (cover, range, fatigue, etc. in `combat-circumstance-modifiers.ts`
 * and the roll dialog breakdown) — there is no separate registry to
 * touch.
 *
 * This module owns only the pure helpers that the equip/unequip and
 * sheet-action wiring needs:
 *
 *   • `isManaclesItem(item)` — content-agnostic detector that walks
 *     the actor's owned items at runtime (Direction #7) by identifier
 *     and name; never hard-codes a UUID or a per-system registry.
 *   • `actorHasManaclesEquipped(actor)` — true when any equipped /
 *     carried item on the actor is a manacle.
 *   • `findManaclesEffect(actor)` — returns the live `Manacled`
 *     ActiveEffect on the actor, if any.
 *   • `actorIsManacled(actor)` — convenience boolean.
 *   • `applyManaclesCondition(actor, origin?)` — idempotent; creates
 *     the AE only if not already present, and tags the AE with the
 *     originating item so unequip can target the right one. Returns
 *     the existing AE when already applied.
 *   • `liftManaclesCondition(actor)` — removes every Manacled AE on
 *     the actor by flag and by name fallback.
 *   • `syncManaclesConditionForActor(actor)` — drives both directions
 *     from the actor's current item state; the equip hook calls this
 *     after every items-changed event so equip ↔ AE stay in lockstep.
 */

import type { WH40KBaseActorDocument, WH40KItemDocument } from '../types/global.d.ts';
import { createConditionEffect } from './active-effects.ts';

/* -------------------------------------------- */
/*  Constants                                   */
/* -------------------------------------------- */

/** Errata p. 176 — penalty applied to BS while manacled. */
export const MANACLES_BS_PENALTY = -40;

/** Errata p. 176 — penalty applied to WS while manacled. */
export const MANACLES_WS_PENALTY = -40;

/** Registry key in the `active-effects.ts` condition map. */
export const MANACLES_CONDITION_KEY = 'manacled' as const;

/** Display name the registry assigns to the created AE. */
export const MANACLES_EFFECT_NAME = 'Manacled' as const;

/**
 * Compendium `system.identifier` slug on the canonical manacles gear
 * entry (see `src/packs/dark-heresy-2/dh2-core-items-tools/_source/manacles_*.json`).
 * Identifier matching is the primary detector; name matching is the
 * fallback for items authored without an identifier yet.
 */
export const MANACLES_IDENTIFIER = 'manacles' as const;

/**
 * Substring (case-insensitive) used as the fallback detector when an
 * item lacks `system.identifier`. Mirrors the medicae-mechadendrite
 * approach: the compendium is the source of truth; this only narrows
 * the actor's owned items at runtime.
 */
const MANACLES_NAME_HINTS: ReadonlyArray<string> = Object.freeze(['manacle']);

/** Foundry flag scope used to tag the Manacled AE with its origin item. */
export const MANACLES_FLAG_SCOPE = 'wh40k-rpg' as const;
/** Foundry flag key — true when the AE was applied by the equip hook. */
export const MANACLES_FLAG_KEY = 'manacles' as const;

/* -------------------------------------------- */
/*  Detectors                                   */
/* -------------------------------------------- */

interface ManaclesCandidate {
    name?: string | null;
    type?: string | null;
    system?: { identifier?: string | null; state?: { equipped?: boolean; inBackpack?: boolean; inShipStorage?: boolean } } | undefined;
}

/**
 * True when the supplied item is a manacles entry. Pure — used by both
 * eligibility detection and tests. Matches by `system.identifier` first
 * (the compendium author's canonical handle), then by a name substring
 * fallback for legacy items.
 */
export function isManaclesItem(item: ManaclesCandidate | null | undefined): boolean {
    if (item === null || item === undefined) return false;
    if (item.type !== 'gear') return false;
    const identifier = (item.system?.identifier ?? '').toLowerCase();
    if (identifier === MANACLES_IDENTIFIER) return true;
    const name = (item.name ?? '').toLowerCase();
    return MANACLES_NAME_HINTS.some((hint) => name.includes(hint));
}

/**
 * True when the item is a manacles entry that is currently equipped on
 * the carrier (not stowed in backpack / ship storage). The penalty only
 * applies while the restraints are actually worn.
 */
export function isManaclesItemEquipped(item: ManaclesCandidate | null | undefined): boolean {
    if (!isManaclesItem(item)) return false;
    const sys = item?.system;
    if (sys === undefined) return false;
    if (sys.state?.equipped !== true) return false;
    if (sys.state.inBackpack === true) return false;
    if (sys.state.inShipStorage === true) return false;
    return true;
}

/**
 * Returns the first equipped manacles item on the actor, or null. Walks
 * the owned-item collection at runtime — no registry, no string-match
 * on names beyond the fallback inside `isManaclesItem`.
 */
export function findEquippedManacles(actor: WH40KBaseActorDocument): WH40KItemDocument | null {
    // eslint-disable-next-line no-restricted-syntax -- boundary: actor.items is a Foundry EmbeddedCollection iterating untyped Item docs
    for (const item of actor.items as unknown as Iterable<WH40KItemDocument>) {
        if (isManaclesItemEquipped(item)) return item;
    }
    return null;
}

/** True when the actor has any equipped manacles. */
export function actorHasManaclesEquipped(actor: WH40KBaseActorDocument): boolean {
    return findEquippedManacles(actor) !== null;
}

interface ManaclesEffectCandidate {
    id?: string | null;
    name?: string | null;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ActiveEffect.flags is an untyped bag scoped per-module; values are not statically known
    flags?: Record<string, Record<string, unknown> | undefined> | undefined;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ActiveEffect.getFlag returns the raw stored flag value, which is untyped
    getFlag?: (scope: string, key: string) => unknown;
}

/**
 * Returns the live Manacled AE on the actor, if any. Identifies by the
 * flag set in `applyManaclesCondition` first, then by AE name as a
 * fallback (so a manually-created Manacled condition is still detected).
 */
export function findManaclesEffect(actor: WH40KBaseActorDocument): ManaclesEffectCandidate | null {
    // eslint-disable-next-line no-restricted-syntax -- boundary: actor.effects is a Foundry EmbeddedCollection of untyped ActiveEffect docs
    for (const effect of actor.effects as unknown as Iterable<ManaclesEffectCandidate>) {
        if (effectIsManacled(effect)) return effect;
    }
    return null;
}

/** True when the supplied AE represents the Manacled condition. */
export function effectIsManacled(effect: ManaclesEffectCandidate | null | undefined): boolean {
    if (effect === null || effect === undefined) return false;
    if (typeof effect.getFlag === 'function') {
        const flagged = effect.getFlag(MANACLES_FLAG_SCOPE, MANACLES_FLAG_KEY);
        if (flagged === true) return true;
    }
    const flagBag = effect.flags?.[MANACLES_FLAG_SCOPE];
    if (flagBag?.[MANACLES_FLAG_KEY] === true) return true;
    return (effect.name ?? '') === MANACLES_EFFECT_NAME;
}

/** True when the actor currently carries the Manacled AE. */
export function actorIsManacled(actor: WH40KBaseActorDocument): boolean {
    return findManaclesEffect(actor) !== null;
}

/* -------------------------------------------- */
/*  Apply / Lift                                */
/* -------------------------------------------- */

interface ApplyManaclesOptions {
    /** Originating item UUID, written to the AE's `origin` field. */
    origin?: string | undefined;
}

/**
 * Apply the Manacled condition to an actor. Idempotent: if a Manacled
 * AE already exists, returns it without creating a duplicate.
 *
 * The condition writes the −40 BS / −40 WS modifier through the active
 * effect changes registered in `active-effects.ts:conditions.manacled`,
 * so this helper does NOT need to set any modifier values directly.
 */
export async function applyManaclesCondition(actor: WH40KBaseActorDocument, options: ApplyManaclesOptions = {}): Promise<ManaclesEffectCandidate | null> {
    const existing = findManaclesEffect(actor);
    if (existing !== null) return existing;

    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ActiveEffect.flags is an untyped per-scope bag; createConditionEffect's options.flags signature is Record<string, unknown>
    const flags: Record<string, Record<string, unknown>> = {
        [MANACLES_FLAG_SCOPE]: { [MANACLES_FLAG_KEY]: true },
    };

    // eslint-disable-next-line no-restricted-syntax -- boundary: createConditionEffect returns Foundry's untyped ActiveEffect handle
    const created = (await createConditionEffect(actor, MANACLES_CONDITION_KEY, {
        flags,
        ...(options.origin !== undefined ? { origin: options.origin } : {}),
    })) as ManaclesEffectCandidate | Array<ManaclesEffectCandidate> | null;

    if (Array.isArray(created)) return created[0] ?? null;
    return created;
}

/**
 * Remove every Manacled AE from the actor. Identifies AEs by the
 * `wh40k-rpg.manacles` flag first, then by name fallback. Returns the
 * number of effects removed.
 */
export async function liftManaclesCondition(actor: WH40KBaseActorDocument): Promise<number> {
    const ids: string[] = [];
    // eslint-disable-next-line no-restricted-syntax -- boundary: actor.effects EmbeddedCollection of untyped ActiveEffect docs
    for (const effect of actor.effects as unknown as Iterable<ManaclesEffectCandidate>) {
        if (effectIsManacled(effect) && typeof effect.id === 'string') ids.push(effect.id);
    }
    if (ids.length === 0) return 0;
    // eslint-disable-next-line no-restricted-syntax -- boundary: deleteEmbeddedDocuments is the Foundry untyped collection API
    await (actor as unknown as { deleteEmbeddedDocuments: (type: string, ids: string[]) => Promise<unknown> }).deleteEmbeddedDocuments('ActiveEffect', ids);
    return ids.length;
}

/**
 * Reconcile the Manacled AE on an actor against the equip state of its
 * manacles items. Equipped → apply; not equipped → lift. Idempotent
 * and safe to call from a descendant-document hook.
 */
export async function syncManaclesConditionForActor(actor: WH40KBaseActorDocument, originUuid?: string): Promise<void> {
    const equipped = actorHasManaclesEquipped(actor);
    const present = actorIsManacled(actor);
    if (equipped && !present) {
        await applyManaclesCondition(actor, { origin: originUuid });
        return;
    }
    if (!equipped && present) {
        await liftManaclesCondition(actor);
    }
}
